import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import { projectRepo } from "../db/projects.repo.js";
import { shareRepo } from "../db/share.repo.js";
import { currentUser } from "../auth/middleware.js";

const ROLES = ["owner", "editor", "viewer"] as const;

export async function shareRoutes(app: FastifyInstance): Promise<void> {
  /* ----------------------- Share links (owner only) ----------------------- */

  /** Daftar share link project. */
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/share",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      const links = await shareRepo.listByProject(req.params.id);
      return { links };
    },
  );

  /** Buat share link baru. Hanya owner/editor. */
  app.post<{
    Params: { id: string };
    Body: { role?: string; expiresInDays?: number };
  }>("/api/projects/:id/share", async (req, reply) => {
    const user = currentUser(req);
    const role = await projectRepo.roleOf(req.params.id, user.id);
    if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
    if (role === "viewer")
      return reply.code(403).send({ error: "Tidak punya akses" });

    const linkRole = (req.body?.role ?? "viewer") as (typeof ROLES)[number];
    if (!ROLES.includes(linkRole) || linkRole === "owner")
      return reply.code(400).send({ error: "Role tidak valid" });

    const days = req.body?.expiresInDays;
    const expiresAt =
      typeof days === "number" && days > 0
        ? new Date(Date.now() + days * 24 * 60 * 60 * 1000)
        : null;

    const link = await shareRepo.create({
      token: nanoid(24),
      projectId: req.params.id,
      role: linkRole,
      createdBy: user.id,
      expiresAt,
    });
    return reply.code(201).send({ link });
  });

  /** Revoke share link. Hanya owner/editor. */
  app.delete<{ Params: { id: string; token: string } }>(
    "/api/projects/:id/share/:token",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      if (role === "viewer")
        return reply.code(403).send({ error: "Tidak punya akses" });
      const ok = await shareRepo.revoke(req.params.id, req.params.token);
      return { ok };
    },
  );

  /* -------------------------- Members (collaborators) -------------------------- */

  /** Daftar anggota project. */
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/members",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      const members = await projectRepo.listMembers(req.params.id);
      return { members };
    },
  );

  /** Tambah kolaborator by email. Hanya owner. */
  app.post<{
    Params: { id: string };
    Body: { email?: string; role?: string };
  }>("/api/projects/:id/members", async (req, reply) => {
    const user = currentUser(req);
    const role = await projectRepo.roleOf(req.params.id, user.id);
    if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
    if (role !== "owner")
      return reply.code(403).send({ error: "Hanya owner yang bisa mengundang" });

    const email = req.body?.email?.trim().toLowerCase();
    const newRole = (req.body?.role ?? "editor") as (typeof ROLES)[number];
    if (!email) return reply.code(400).send({ error: "Email wajib" });
    if (!ROLES.includes(newRole) || newRole === "owner")
      return reply.code(400).send({ error: "Role tidak valid" });

    const target = await projectRepo.findUserByEmail(email);
    if (!target)
      return reply
        .code(404)
        .send({ error: "User dengan email itu belum terdaftar" });

    if (target.id === user.id)
      return reply.code(400).send({ error: "Tidak bisa menambah diri sendiri" });

    await projectRepo.addMember(req.params.id, target.id, newRole);
    const members = await projectRepo.listMembers(req.params.id);
    return reply.code(201).send({ members });
  });

  /** Ubah role anggota. Hanya owner. */
  app.patch<{
    Params: { id: string; userId: string };
    Body: { role?: string };
  }>("/api/projects/:id/members/:userId", async (req, reply) => {
    const user = currentUser(req);
    const role = await projectRepo.roleOf(req.params.id, user.id);
    if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
    if (role !== "owner")
      return reply.code(403).send({ error: "Hanya owner yang bisa mengubah role" });

    const newRole = req.body?.role as (typeof ROLES)[number];
    if (!ROLES.includes(newRole) || newRole === "owner")
      return reply.code(400).send({ error: "Role tidak valid" });
    if (req.params.userId === user.id)
      return reply.code(400).send({ error: "Tidak bisa mengubah role sendiri" });

    await projectRepo.addMember(req.params.id, req.params.userId, newRole);
    const members = await projectRepo.listMembers(req.params.id);
    return { members };
  });

  /** Hapus anggota. Hanya owner. */
  app.delete<{ Params: { id: string; userId: string } }>(
    "/api/projects/:id/members/:userId",
    async (req, reply) => {
      const user = currentUser(req);
      const role = await projectRepo.roleOf(req.params.id, user.id);
      if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });
      if (role !== "owner")
        return reply.code(403).send({ error: "Hanya owner yang bisa menghapus" });
      if (req.params.userId === user.id)
        return reply.code(400).send({ error: "Owner tidak bisa dihapus" });
      const ok = await projectRepo.removeMember(req.params.id, req.params.userId);
      return { ok };
    },
  );
}
