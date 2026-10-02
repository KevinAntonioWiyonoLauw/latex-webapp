import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import type { Storage } from "../storage/index.js";
import { shareRepo } from "../db/share.repo.js";
import { projectRepo } from "../db/projects.repo.js";
import { readSynctexFile } from "../compiler/synctex.js";

/**
 * Route publik berbasis share token (tanpa login).
 * Semua di bawah prefix /api/share/:token/*.
 */
export async function publicShareRoutes(
  app: FastifyInstance,
  storage: Storage,
): Promise<void> {
  /** Validasi token -> projectId + role. */
  async function resolve(
    token: string,
  ): Promise<{ projectId: string; role: string } | null> {
    return shareRepo.resolve(token);
  }

  /** Metadata project + role dari share link. */
  app.get<{ Params: { token: string } }>(
    "/api/share/:token",
    async (req, reply) => {
      const r = await resolve(req.params.token);
      if (!r) return reply.code(404).send({ error: "Link tidak valid / kedaluwarsa" });
      const project = await projectRepo.getById(r.projectId);
      if (!project) return reply.code(404).send({ error: "Project tidak ditemukan" });
      return {
        project: {
          id: project.id,
          name: project.name,
          rootFile: project.rootFile,
          outputVersion: project.outputVersion,
          hasPdf: project.hasPdf,
          updatedAt: project.updatedAt,
        },
        role: r.role,
      };
    },
  );

  /** File tree. */
  app.get<{ Params: { token: string } }>(
    "/api/share/:token/tree",
    async (req, reply) => {
      const r = await resolve(req.params.token);
      if (!r) return reply.code(404).send({ error: "Link tidak valid" });
      return { tree: await storage.tree(r.projectId) };
    },
  );

  /** Baca file teks. */
  app.get<{
    Params: { token: string };
    Querystring: { path?: string };
  }>("/api/share/:token/file", async (req, reply) => {
    const r = await resolve(req.params.token);
    if (!r) return reply.code(404).send({ error: "Link tidak valid" });
    const rel = req.query.path;
    if (!rel) return reply.code(400).send({ error: "Parameter path wajib" });
    try {
      const content = await storage.readFile(r.projectId, rel);
      return { path: rel, content };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  /** Baca file biner (gambar). */
  app.get<{
    Params: { token: string };
    Querystring: { path?: string };
  }>("/api/share/:token/raw", async (req, reply) => {
    const r = await resolve(req.params.token);
    if (!r) return reply.code(404).send({ error: "Link tidak valid" });
    const rel = req.query.path;
    if (!rel) return reply.code(400).send({ error: "Parameter path wajib" });
    try {
      const buf = await storage.readFileBuffer(r.projectId, rel);
      reply.header("Cache-Control", "no-store");
      return reply.send(buf);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  /** PDF output. */
  app.get<{ Params: { token: string } }>(
    "/api/share/:token/pdf",
    async (req, reply) => {
      const r = await resolve(req.params.token);
      if (!r) return reply.code(404).send({ error: "Link tidak valid" });
      const pdfPath = storage.pdfPath(r.projectId);
      if (!fs.existsSync(pdfPath))
        return reply.code(404).send({ error: "PDF belum tersedia" });
      const project = await projectRepo.getById(r.projectId);
      reply.header("Content-Type", "application/pdf");
      reply.header("Cache-Control", "no-store");
      reply.header("X-Output-Version", String(project?.outputVersion ?? 0));
      return reply.send(fs.createReadStream(pdfPath));
    },
  );

  /** SyncTeX view (source -> PDF) untuk share page. */
  app.get<{
    Params: { token: string };
    Querystring: { file?: string; line?: string };
  }>("/api/share/:token/synctex/view", async (req, reply) => {
    const r = await resolve(req.params.token);
    if (!r) return reply.code(404).send({ error: "Link tidak valid" });
    const synctexPath = storage.synctexPath(r.projectId);
    if (!fs.existsSync(synctexPath))
      return reply.code(404).send({ error: "Synctex tidak tersedia" });
    const data = readSynctexFile(synctexPath);
    if (!data) return reply.code(404).send({ error: "Synctex tidak tersedia" });

    const rel = req.query.file;
    const line = Number(req.query.line ?? "1");
    if (!rel) return reply.code(400).send({ error: "Parameter file wajib" });

    const ws = storage.workspaceDir(r.projectId);
    const target = `${ws}/${rel}`.replace(/\\/g, "/");
    const boxes = data.boxesFor(target, line);
    if (!boxes.length) return reply.code(404).send({ error: "Tidak ada posisi" });
    const rec = boxes[0];
    const s = data.scale;
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
