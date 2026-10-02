import type { FastifyInstance } from "fastify";
import { projectRepo } from "../db/projects.repo.js";
import { currentUser } from "../auth/middleware.js";
import { GitHistory } from "../db/git.js";
import { DATA_DIR } from "../config.js";

export async function historyRoutes(
  app: FastifyInstance,
  git: GitHistory,
): Promise<void> {
  /** Daftar revisi. */
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/revisions",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      const list = await git.list(req.params.id);
      return { revisions: list };
    },
  );

  /** Buat snapshot manual. */
  app.post<{ Params: { id: string }; Body: { message?: string } }>(
    "/api/projects/:id/revisions",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      if (role === "viewer")
        return reply.code(403).send({ error: "Tidak punya akses menulis" });
      const snap = await git.snapshot(
        req.params.id,
        req.body?.message ?? `snapshot oleh ${user.name}`,
        user.id,
      );
      if (!snap) return { ok: true, snapshot: null, message: "Tidak ada perubahan" };
      return { ok: true, snapshot: snap };
    },
  );

  /** Diff sebuah revisi. */
  app.get<{ Params: { id: string; hash: string } }>(
    "/api/projects/:id/revisions/:hash/diff",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      const diff = await git.diff(req.params.id, req.params.hash);
      return { diff };
    },
  );

  /** Isi file pada revisi tertentu. */
  app.get<{
    Params: { id: string; hash: string };
    Querystring: { file?: string };
  }>("/api/projects/:id/revisions/:hash/file", async (req, reply) => {
    const user = currentUser(req);
    const role = await projectRepo.roleOf(req.params.id, user.id);
    if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
    const file = req.query.file;
    if (!file) return reply.code(400).send({ error: "Parameter file wajib" });
    try {
      const content = await git.fileAt(req.params.id, req.params.hash, file);
      return { file, content };
    } catch (err) {
      return reply.code(404).send({ error: (err as Error).message });
    }
  });

  /** Pulihkan ke revisi tertentu. */
  app.post<{ Params: { id: string; hash: string } }>(
    "/api/projects/:id/revisions/:hash/restore",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      if (role === "viewer")
        return reply.code(403).send({ error: "Tidak punya akses menulis" });
      const ok = await git.restore(req.params.id, req.params.hash, user.id);
      return { ok };
    },
  );
}

export { GitHistory, DATA_DIR };
