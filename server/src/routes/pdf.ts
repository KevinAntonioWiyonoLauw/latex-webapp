import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import type { Storage } from "../storage/index.js";
import { projectRepo } from "../db/projects.repo.js";
import { currentUser } from "../auth/middleware.js";

export async function pdfRoutes(
  app: FastifyInstance,
  storage: Storage,
): Promise<void> {

  /** Serve PDF output. */
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/pdf",
    async (req, reply) => {
      const user = currentUser(req);
      const project = await projectRepo.getForUser(req.params.id, user.id);
      if (!project) return reply.code(404).send({ error: "Project tidak ditemukan" });
      const pdfPath = storage.pdfPath(req.params.id);
      if (!fs.existsSync(pdfPath))
        return reply.code(404).send({ error: "PDF belum tersedia" });
      reply.header("Content-Type", "application/pdf");
      reply.header("Cache-Control", "no-store");
      reply.header("X-Output-Version", String(project.outputVersion));
      return reply.send(fs.createReadStream(pdfPath));
    },
  );

  /** Download PDF dengan nama file. */
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/pdf/download",
    async (req, reply) => {
      const user = currentUser(req);
      const project = await projectRepo.getForUser(req.params.id, user.id);
      if (!project) return reply.code(404).send({ error: "Project tidak ditemukan" });
      const pdfPath = storage.pdfPath(req.params.id);
      if (!fs.existsSync(pdfPath))
        return reply.code(404).send({ error: "PDF belum tersedia" });
      const name = (project.name || "document").replace(/[^\w.-]+/g, "_");
      reply.header("Content-Type", "application/pdf");
      reply.header("Content-Disposition", `attachment; filename="${name}.pdf"`);
      return reply.send(fs.createReadStream(pdfPath));
    },
  );
}
