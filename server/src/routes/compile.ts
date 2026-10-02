import type { FastifyInstance } from "fastify";
import type { CompilerManager } from "../compiler/manager.js";
import { projectRepo } from "../db/projects.repo.js";
import { currentUser } from "../auth/middleware.js";

export async function compileRoutes(
  app: FastifyInstance,
  compiler: CompilerManager,
): Promise<void> {

  /** Trigger compile. Butuh akses tulis (owner/editor). */
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/compile",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      if (role === "viewer")
        return reply.code(403).send({ error: "Tidak punya akses menulis" });
      void compiler.request(req.params.id);
      return { ok: true, queued: true };
    },
  );

  /** Batalkan compile yang sedang berjalan. */
  app.post<{ Params: { id: string } }>(
    "/api/projects/:id/compile/cancel",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      if (role === "viewer")
        return reply.code(403).send({ error: "Tidak punya akses menulis" });
      const cancelled = compiler.cancel(req.params.id);
      return { ok: true, cancelled };
    },
  );

  /** Status / hasil compile terakhir. */
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/compile/status",
    async (req, reply) => {
      const user = currentUser(req);
      const project = await projectRepo.getForUser(req.params.id, user.id);
      if (!project) return reply.code(404).send({ error: "Project tidak ditemukan" });

      const inMemory = compiler.lastResult(req.params.id) ?? null;
      if (inMemory) {
        return { running: compiler.isRunning(req.params.id), result: inMemory };
      }

      // Fallback: server baru restart -> rekonstruksi dari DB.
      const hasPdf = project.hasPdf && project.outputVersion > 0;
      return {
        running: compiler.isRunning(req.params.id),
        result: {
          projectId: req.params.id,
          status: hasPdf ? ("success" as const) : ("queued" as const),
          outputVersion: project.outputVersion,
          startedAt: 0,
          logs: [],
          hasPdf,
        },
      };
    },
  );
}
