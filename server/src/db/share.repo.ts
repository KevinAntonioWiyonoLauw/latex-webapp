import { eq, and, desc } from "drizzle-orm";
import { db } from "./index.js";
import { shareLinks, projectMembers, type MemberRole } from "./schema.js";

export interface ShareLinkRow {
  token: string;
  projectId: string;
  role: string;
  createdBy: string;
  expiresAt: Date | null;
  createdAt: Date;
}

export const shareRepo = {
  /** Buat share link baru. */
  async create(input: {
    token: string;
    projectId: string;
    role: MemberRole;
    createdBy: string;
    expiresAt?: Date | null;
  }): Promise<ShareLinkRow> {
    const [row] = await db
      .insert(shareLinks)
      .values({
        token: input.token,
        projectId: input.projectId,
        role: input.role,
        createdBy: input.createdBy,
        expiresAt: input.expiresAt ?? null,
      })
      .returning();
    return row;
  },

  /** Daftar share link sebuah project. */
  async listByProject(projectId: string): Promise<ShareLinkRow[]> {
    return db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.projectId, projectId))
      .orderBy(desc(shareLinks.createdAt));
  },

  /** Ambil share link berdasarkan token. */
  async getByToken(token: string): Promise<ShareLinkRow | null> {
    const [row] = await db
      .select()
      .from(shareLinks)
      .where(eq(shareLinks.token, token))
      .limit(1);
    return row ?? null;
  },

  /** Hapus (revoke) share link. */
  async revoke(projectId: string, token: string): Promise<boolean> {
    const rows = await db
      .delete(shareLinks)
      .where(
        and(
          eq(shareLinks.token, token),
          eq(shareLinks.projectId, projectId),
        ),
      )
      .returning({ token: shareLinks.token });
    return rows.length > 0;
  },

  /**
   * Resolve token -> akses project.
   * Mengembalikan { projectId, role } bila token valid & belum kedaluwarsa.
   */
  async resolve(
    token: string,
  ): Promise<{ projectId: string; role: MemberRole } | null> {
    const link = await this.getByToken(token);
    if (!link) return null;
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) return null;
    return {
      projectId: link.projectId,
      role: link.role as MemberRole,
    };
  },
};

export { projectMembers };
