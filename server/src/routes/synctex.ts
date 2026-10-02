import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import type { Storage } from "../storage/index.js";
import { readSynctexFile } from "../compiler/synctex.js";
import { projectRepo } from "../db/projects.repo.js";
import { currentUser } from "../auth/middleware.js";

export async function synctexRoutes(
  app: FastifyInstance,
  storage: Storage,
): Promise<void> {

  /** Cache data synctex per project+version untuk menghindari parse berulang. */
  const cache = new Map<string, { version: number; data: ReturnType<typeof readSynctexFile> }>();

  async function load(projectId: string) {
    const project = await projectRepo.getById(projectId);
    const version = project?.outputVersion ?? 0;
    const cached = cache.get(projectId);
    if (cached && cached.version === version) return cached.data;
    const p = storage.synctexPath(projectId);
    const data = fs.existsSync(p) ? readSynctexFile(p) : null;
    cache.set(projectId, { version, data });
    return data;
  }

  /** PDF -> source: query edit pada halaman & koordinat (big point, 72dpi). */
  app.get<{
    Params: { id: string };
    Querystring: { page?: string; x?: string; y?: string };
  }>("/api/projects/:id/synctex/edit", async (req, reply) => {
    const user = currentUser(req);
    const project = await projectRepo.getForUser(req.params.id, user.id);
    if (!project) return reply.code(404).send({ error: "Project tidak ditemukan" });
    const data = await load(req.params.id);
    if (!data) return reply.code(404).send({ error: "Synctex tidak tersedia" });

    const page = Number(req.query.page ?? "1");
    const x = Number(req.query.x ?? "0");
    const y = Number(req.query.y ?? "0");
    const rec = data.editAtPage(page, x, y);
    if (!rec) return reply.code(404).send({ error: "Tidak ada source cocok" });

    const file = data.inputs.get(rec.tag);
    if (!file) return reply.code(404).send({ error: "Tag tidak dikenal" });
    return {
      file: relativeToWorkspace(storage, req.params.id, file),
      line: rec.line,
      column: 0,
    };
  });

  /** Source -> PDF: query view untuk file+line. */
  app.get<{
    Params: { id: string };
    Querystring: { file?: string; line?: string };
  }>("/api/projects/:id/synctex/view", async (req, reply) => {
    const user = currentUser(req);
    const project = await projectRepo.getForUser(req.params.id, user.id);
    if (!project) return reply.code(404).send({ error: "Project tidak ditemukan" });
    const data = await load(req.params.id);
    if (!data) return reply.code(404).send({ error: "Synctex tidak tersedia" });

    const rel = req.query.file;
    const line = Number(req.query.line ?? "1");
    if (!rel) return reply.code(400).send({ error: "Parameter file wajib" });

    // cari path absolut yang cocok
    const target = resolveSourcePath(storage, req.params.id, rel);
    const boxes = data.boxesFor(target, line);
    if (!boxes.length) return reply.code(404).send({ error: "Tidak ada posisi cocok" });
    const rec = boxes[0];
    const s = data.scale;
    // Koordinat view relatif terhadap halaman (bukan dokumen absolut).
    const pageTopRaw = data.yOffsetRaw + (rec.page - 1) * data.pageHeightBp * s;
    return {
      page: rec.page,
      x: (rec.x - data.xOffsetRaw) / s,
      y: (rec.y - pageTopRaw) / s,
      width: rec.width / s,
      height: rec.height / s,
    };
  });
}

function relativeToWorkspace(storage: Storage, id: string, abs: string): string {
  const ws = storage.workspaceDir(id).replace(/\\/g, "/");
  const a = abs.replace(/\\/g, "/");
  if (a.toLowerCase().startsWith(ws.toLowerCase() + "/")) {
    return a.slice(ws.length + 1);
  }
  // kadang synctex menyimpan path dengan drive beda; kembalikan basename
  const parts = a.split("/");
  return parts[parts.length - 1];
}

function resolveSourcePath(storage: Storage, id: string, rel: string): string {
  const ws = storage.workspaceDir(id);
  const abs = `${ws}/${rel}`.replace(/\\/g, "/");
  return abs;
}
