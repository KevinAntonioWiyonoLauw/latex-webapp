import type { FastifyInstance } from "fastify";
import fsp from "node:fs/promises";
import path from "node:path";
import { nanoid } from "nanoid";
import type { Storage } from "../storage/index.js";
import { TEMPLATE_LIST, getTemplateContent } from "../storage/index.js";
import { projectRepo } from "../db/projects.repo.js";
import { currentUser } from "../auth/middleware.js";

/** Salin isi direktori secara rekursif. */
async function copyDir(src: string, dest: string): Promise<void> {
  await fsp.mkdir(dest, { recursive: true });
  let entries: import("node:fs").Dirent[];
  try {
    entries = await fsp.readdir(src, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === ".git" || e.name === ".collab" || e.name === ".output")
      continue;
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(s, d);
    else if (e.isFile()) await fsp.copyFile(s, d);
  }
}

export async function projectRoutes(
  app: FastifyInstance,
  storage: Storage,
): Promise<void> {
  /** Semua route di grup ini butuh login. */

  /** Info user yang sedang login. */
  app.get("/api/me", async (req) => {
    return { user: currentUser(req) };
  });

  /** Daftar template bawaan. */
  app.get("/api/templates", async () => {
    return { templates: TEMPLATE_LIST };
  });

  /** Daftar project milik user (owner atau anggota). */
  app.get("/api/projects", async (req) => {
    const user = currentUser(req);
    return { projects: await projectRepo.listForUser(user.id) };
  });

  /** Detail project + role. */
  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    const user = currentUser(req);
    const p = await projectRepo.getForUser(req.params.id, user.id);
    if (!p) return reply.code(404).send({ error: "Project tidak ditemukan" });
    return { project: p, role: p.role };
  });

  /** Buat project baru. */
  app.post<{ Body: { name?: string; template?: string } }>(
    "/api/projects",
    async (req, reply) => {
      const user = currentUser(req);
      const name = req.body?.name ?? "Untitled";
      const template = (req.body?.template as "article" | "report" | "beamer") ??
        "article";
      try {
        const id = nanoid(12);
        const project = await projectRepo.create({
          id,
          ownerId: user.id,
          name,
          rootFile: "main.tex",
        });
        // tulis file root dari template
        await storage.ensureProjectDirs(id);
        await storage.writeFile(id, "main.tex", getTemplateContent(template));
        return reply.code(201).send({ project });
      } catch (err) {
        return reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  /** Update project (rename / rootFile / label). Hanya owner/editor. */
  app.patch<{
    Params: { id: string };
    Body: { name?: string; rootFile?: string; label?: string };
  }>("/api/projects/:id", async (req, reply) => {
    const user = currentUser(req);
    const role = await projectRepo.roleOf(req.params.id, user.id);
    if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
    if (role === "viewer")
      return reply.code(403).send({ error: "Tidak punya akses menulis" });
    const p = await projectRepo.update(req.params.id, req.body ?? {});
    if (!p) return reply.code(404).send({ error: "Project tidak ditemukan" });
    return { project: p };
  });

  /** Duplikat (clone) project. */
  app.post<{ Params: { id: string }; Body: { name?: string } }>(
    "/api/projects/:id/clone",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      const src = await projectRepo.getById(req.params.id);
      if (!src) return reply.code(404).send({ error: "Project tidak ditemukan" });

      const newId = nanoid(12);
      await projectRepo.create({
        id: newId,
        ownerId: user.id,
        name: req.body?.name?.trim() || `${src.name} (salinan)`,
        rootFile: src.rootFile,
      });
      // Salin seluruh file workspace.
      await storage.ensureProjectDirs(newId);
      await copyDir(
        storage.workspaceDir(req.params.id),
        storage.workspaceDir(newId),
      );
      const created = await projectRepo.getById(newId);
      return reply.code(201).send({ project: created });
    },
  );

  /** Hapus project. Hanya owner. */
  app.delete<{ Params: { id: string } }>(
    "/api/projects/:id",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      if (role !== "owner")
        return reply.code(403).send({ error: "Hanya owner yang bisa menghapus" });
      await projectRepo.remove(req.params.id);
      await storage.removeProjectDir(req.params.id);
      return { ok: true };
    },
  );
}
