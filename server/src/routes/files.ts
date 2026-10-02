import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Storage } from "../storage/index.js";
import { BLOCKED_EXTENSIONS } from "../config.js";
import { projectRepo } from "../db/projects.repo.js";
import { currentUser } from "../auth/middleware.js";

function extOf(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i).toLowerCase() : "";
}

/**
 * Cek akses project. Mengembalikan role atau mengirim error.
 * mode "read" = anggota apa saja; "write" = owner/editor.
 */
async function ensureAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  mode: "read" | "write",
): Promise<boolean> {
  const user = currentUser(req);
  const role = await projectRepo.roleOf(projectId, user.id);
  if (!role) {
    reply.code(404).send({ error: "Project tidak ditemukan" });
    return false;
  }
  if (mode === "write" && role === "viewer") {
    reply.code(403).send({ error: "Tidak punya akses menulis" });
    return false;
  }
  return true;
}

export async function fileRoutes(
  app: FastifyInstance,
  storage: Storage,
): Promise<void> {

  /** File tree project. */
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/tree",
    async (req, reply) => {
      if (!(await ensureAccess(req, reply, req.params.id, "read"))) return;
      return { tree: await storage.tree(req.params.id) };
    },
  );

  /** Baca file teks. */
  app.get<{
    Params: { id: string };
    Querystring: { path?: string };
  }>("/api/projects/:id/file", async (req, reply) => {
    if (!(await ensureAccess(req, reply, req.params.id, "read"))) return;
    const rel = req.query.path;
    if (!rel) return reply.code(400).send({ error: "Parameter path wajib" });
    try {
      const content = await storage.readFile(req.params.id, rel);
      return { path: rel, content };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  /** Baca file biner (gambar). */
  app.get<{
    Params: { id: string };
    Querystring: { path?: string };
  }>("/api/projects/:id/raw", async (req, reply) => {
    if (!(await ensureAccess(req, reply, req.params.id, "read"))) return;
    const rel = req.query.path;
    if (!rel) return reply.code(400).send({ error: "Parameter path wajib" });
    try {
      const buf = await storage.readFileBuffer(req.params.id, rel);
      reply.header("Cache-Control", "no-store");
      return reply.send(buf);
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  /** Tulis file teks. */
  app.put<{
    Params: { id: string };
    Body: { path?: string; content?: string };
  }>("/api/projects/:id/file", async (req, reply) => {
    if (!(await ensureAccess(req, reply, req.params.id, "write"))) return;
    const rel = req.body?.path;
    const content = req.body?.content;
    if (!rel) return reply.code(400).send({ error: "Parameter path wajib" });
    if (typeof content !== "string")
      return reply.code(400).send({ error: "content harus string" });
    if (BLOCKED_EXTENSIONS.has(extOf(rel)))
      return reply.code(400).send({ error: "Ekstensi file dilarang" });
    try {
      await storage.writeFile(req.params.id, rel, content);
      await projectRepo.touch(req.params.id);
      return { ok: true, path: rel };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  /** Buat folder. */
  app.post<{
    Params: { id: string };
    Body: { path?: string };
  }>("/api/projects/:id/folder", async (req, reply) => {
    if (!(await ensureAccess(req, reply, req.params.id, "write"))) return;
    const rel = req.body?.path;
    if (!rel) return reply.code(400).send({ error: "Parameter path wajib" });
    try {
      await storage.mkdir(req.params.id, rel);
      await projectRepo.touch(req.params.id);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  /** Hapus file/folder. */
  app.delete<{
    Params: { id: string };
    Querystring: { path?: string };
  }>("/api/projects/:id/path", async (req, reply) => {
    if (!(await ensureAccess(req, reply, req.params.id, "write"))) return;
    const rel = req.query.path;
    if (!rel) return reply.code(400).send({ error: "Parameter path wajib" });
    try {
      await storage.deletePath(req.params.id, rel);
      await projectRepo.touch(req.params.id);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  /** Rename / pindah. */
  app.post<{
    Params: { id: string };
    Body: { from?: string; to?: string };
  }>("/api/projects/:id/rename", async (req, reply) => {
    if (!(await ensureAccess(req, reply, req.params.id, "write"))) return;
    const { from, to } = req.body ?? {};
    if (!from || !to)
      return reply.code(400).send({ error: "from & to wajib" });
    try {
      await storage.rename(req.params.id, from, to);
      await projectRepo.touch(req.params.id);
      return { ok: true };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  /** Upload satu file (multipart field "file" + query path). */
  app.post<{
    Params: { id: string };
    Querystring: { path?: string };
  }>("/api/projects/:id/upload", async (req, reply) => {
    if (!(await ensureAccess(req, reply, req.params.id, "write"))) return;
    const rel = req.query.path;
    if (!rel) return reply.code(400).send({ error: "Parameter path wajib" });
    if (BLOCKED_EXTENSIONS.has(extOf(rel)))
      return reply.code(400).send({ error: "Ekstensi file dilarang" });
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "File tidak ada" });
    try {
      const buf = await file.toBuffer();
      await storage.writeFileBuffer(req.params.id, rel, buf);
      await projectRepo.touch(req.params.id);
      return { ok: true, path: rel };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });
}
