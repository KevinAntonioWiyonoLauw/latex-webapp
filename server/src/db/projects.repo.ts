import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "./index.js";
import {
  projects,
  projectMembers,
  user,
  type MemberRole,
  type Project,
} from "./schema.js";

/** Project + role user yang mengaksesnya. */
export interface ProjectWithRole extends Project {
  role: MemberRole;
}

/**
 * Repository untuk projects + keanggotaan (ACL).
 */
export const projectRepo = {
  /** Buat project baru; owner otomatis jadi anggota role "owner". */
  async create(input: {
    id: string;
    ownerId: string;
    name: string;
    rootFile?: string;
  }): Promise<Project> {
    const [row] = await db
      .insert(projects)
      .values({
        id: input.id,
        ownerId: input.ownerId,
        name: input.name.trim() || "Untitled",
        rootFile: input.rootFile ?? "main.tex",
      })
      .returning();
    await db
      .insert(projectMembers)
      .values({ projectId: input.id, userId: input.ownerId, role: "owner" });
    return row;
  },

  /** Daftar project yang bisa diakses user (owner atau anggota). */
  async listForUser(userId: string): Promise<ProjectWithRole[]> {
    const rows = await db
      .select({
        project: projects,
        role: projectMembers.role,
      })
      .from(projects)
      .innerJoin(projectMembers, eq(projectMembers.projectId, projects.id))
      .where(
        and(
          eq(projectMembers.userId, userId),
          eq(projects.archived, false),
        ),
      )
      .orderBy(desc(projects.updatedAt));
    return rows.map((r) => ({ ...r.project, role: r.role as MemberRole }));
  },

  /** Ambil project bila user adalah anggota. */
  async getForUser(
    projectId: string,
    userId: string,
  ): Promise<ProjectWithRole | null> {
    const rows = await db
      .select({ project: projects, role: projectMembers.role })
      .from(projects)
      .innerJoin(
        projectMembers,
        and(
          eq(projectMembers.projectId, projects.id),
          eq(projectMembers.userId, userId),
        ),
      )
      .where(eq(projects.id, projectId))
      .limit(1);
    if (!rows.length) return null;
    return { ...rows[0].project, role: rows[0].role as MemberRole };
  },

  /** Ambil project tanpa cek user (internal). */
  async getById(projectId: string): Promise<Project | null> {
    const [row] = await db
      .select()
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1);
    return row ?? null;
  },

  /** Update field project. */
  async update(
    projectId: string,
    patch: Partial<Pick<Project, "name" | "rootFile" | "label" | "archived">>,
  ): Promise<Project | null> {
    const [row] = await db
      .update(projects)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(projects.id, projectId))
      .returning();
    return row ?? null;
  },

  /** Naikkan outputVersion + tandai ada PDF. */
  async bumpOutputVersion(projectId: string): Promise<number> {
    const [row] = await db
      .update(projects)
      .set({
        outputVersion: sql`${projects.outputVersion} + 1`,
        hasPdf: true,
        updatedAt: new Date(),
      })
      .where(eq(projects.id, projectId))
      .returning({ outputVersion: projects.outputVersion });
    return row?.outputVersion ?? 0;
  },

  /** Sentuh updatedAt (mis. setelah edit file). */
  async touch(projectId: string): Promise<void> {
    await db
      .update(projects)
      .set({ updatedAt: new Date() })
      .where(eq(projects.id, projectId));
  },

  /** Hapus project (cascade ke members). */
  async remove(projectId: string): Promise<boolean> {
    const rows = await db
      .delete(projects)
      .where(eq(projects.id, projectId))
      .returning({ id: projects.id });
    return rows.length > 0;
  },

  /** Role user pada project (null bila bukan anggota). */
  async roleOf(
    projectId: string,
    userId: string,
  ): Promise<MemberRole | null> {
    const [row] = await db
      .select({ role: projectMembers.role })
      .from(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .limit(1);
    return (row?.role as MemberRole) ?? null;
  },

  /** Cek apakah user boleh menulis (owner/editor). */
  async canWrite(projectId: string, userId: string): Promise<boolean> {
    const role = await this.roleOf(projectId, userId);
    return role === "owner" || role === "editor";
  },

  /** Tambah anggota. */
  async addMember(
    projectId: string,
    userId: string,
    role: MemberRole,
  ): Promise<void> {
    await db
      .insert(projectMembers)
      .values({ projectId, userId, role })
      .onConflictDoUpdate({
        target: [projectMembers.projectId, projectMembers.userId],
        set: { role },
      });
  },

  /** Daftar anggota + info user. */
  async listMembers(projectId: string) {
    return db
      .select({
        userId: projectMembers.userId,
        role: projectMembers.role,
        createdAt: projectMembers.createdAt,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(projectMembers)
      .innerJoin(user, eq(user.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId))
      .orderBy(projectMembers.createdAt);
  },

  /** Hapus anggota. */
  async removeMember(projectId: string, userId: string): Promise<boolean> {
    const rows = await db
      .delete(projectMembers)
      .where(
        and(
          eq(projectMembers.projectId, projectId),
          eq(projectMembers.userId, userId),
        ),
      )
      .returning({ userId: projectMembers.userId });
    return rows.length > 0;
  },

  /** Cari user berdasarkan email (untuk undang kolaborator). */
  async findUserByEmail(email: string) {
    const [row] = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);
    return row ?? null;
  },

  /** Project yang user-nya owner atau anggota (untuk pencarian). */
  async isMember(projectId: string, userId: string): Promise<boolean> {
    const role = await this.roleOf(projectId, userId);
    return role !== null;
  },
};
