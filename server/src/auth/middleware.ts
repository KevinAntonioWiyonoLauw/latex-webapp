import { fromNodeHeaders } from "better-auth/node";
import type { FastifyReply, FastifyRequest } from "fastify";
import { auth } from "./index.js";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  image?: string | null;
}

/**
 * Ambil session user dari request. Mengembalikan null bila belum login.
 */
export async function getUser(req: FastifyRequest): Promise<AuthUser | null> {
  try {
    const session = await auth.api.getSession({
      headers: fromNodeHeaders(req.headers),
    });
    if (!session?.user) return null;
    return {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      image: session.user.image,
    };
  } catch {
    return null;
  }
}

/**
 * Wajib login. Mengirim 401 bila belum.
 * Dipakai di preHandler route yang butuh auth.
 */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = await getUser(req);
  if (!user) {
    reply.code(401).send({ error: "Belum login" });
    return;
  }
  // simpan di request untuk dipakai handler
  (req as FastifyRequest & { user?: AuthUser }).user = user;
  await Promise.resolve();
}

/** Ambil user yang sudah ditempel requireAuth. */
export function currentUser(req: FastifyRequest): AuthUser {
  const u = (req as FastifyRequest & { user?: AuthUser }).user;
  if (!u) throw new Error("requireAuth belum dipasang pada route ini");
  return u;
}

/**
 * PreHandler yang bisa dipasang per-route sebagai array, mis.:
 *   app.get("/api/x", { preHandler: [requireAuth] }, handler)
 * Re-export agar konsisten.
 */
export const authGuard = [requireAuth];
