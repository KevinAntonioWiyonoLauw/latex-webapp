import type { FastifyReply, FastifyRequest } from "fastify";
import type { MemberRole } from "../db/schema.js";
import { projectRepo } from "../db/projects.repo.js";
import { shareRepo } from "../db/share.repo.js";
import { getUser } from "./middleware.js";

export interface AccessResult {
  role: MemberRole;
  /** true bila akses berasal dari share link (bukan sesi user). */
  viaShare: boolean;
  userId: string | null;
}

/**
 * Resolve akses ke sebuah project:
 * 1. Jika user login & anggota -> pakai role anggota.
 * 2. Jika tidak, coba token share dari query `?token=` -> pakai role share.
 * Mengembalikan null bila tidak ada akses.
 */
export async function resolveAccess(
  req: FastifyRequest,
  projectId: string,
): Promise<AccessResult | null> {
  const user = await getUser(req);
  if (user) {
    const role = await projectRepo.roleOf(projectId, user.id);
    if (role) return { role, viaShare: false, userId: user.id };
  }

  const token = (req.query as { token?: string } | undefined)?.token;
  if (token) {
    const resolved = await shareRepo.resolve(token);
    if (resolved && resolved.projectId === projectId) {
      return { role: resolved.role, viaShare: true, userId: user?.id ?? null };
    }
  }
  return null;
}

/**
 * Pastikan akses memenuhi mode. Mengirim error & return null bila gagal.
 */
export async function ensureAccess(
  req: FastifyRequest,
  reply: FastifyReply,
  projectId: string,
  mode: "read" | "write",
): Promise<AccessResult | null> {
  const access = await resolveAccess(req, projectId);
  if (!access) {
    reply.code(404).send({ error: "Project tidak ditemukan" });
    return null;
  }
  if (mode === "write" && access.viaShare) {
    // share link tidak boleh menulis lewat jalur ini
    reply.code(403).send({ error: "Share link hanya untuk baca" });
    return null;
  }
  if (mode === "write" && access.role === "viewer") {
    reply.code(403).send({ error: "Tidak punya akses menulis" });
    return null;
  }
  return access;
}
