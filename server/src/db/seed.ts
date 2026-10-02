/**
 * Seed / migrasi: adopsi project lama (filesystem + project.json) ke database.
 *
 * Jalankan:
 *   bun run seed        (dari folder server)
 * atau:
 *   bun run src/db/seed.ts
 *
 * Argumen opsional: email user pemilik (default: user pertama di DB).
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { DATA_DIR } from "../config.js";
import { db, pool } from "./index.js";
import { user, projects, projectMembers } from "./schema.js";

interface OldMeta {
  id: string;
  name: string;
  rootFile: string;
  createdAt: number;
  updatedAt: number;
  outputVersion?: number;
  hasPdf?: boolean;
}

async function main(): Promise<void> {
  const targetEmail = process.argv[2];

  // Tentukan user pemilik.
  let owner = targetEmail
    ? (await db.select().from(user).where(eq(user.email, targetEmail)).limit(1))[0]
    : (await db.select().from(user).limit(1))[0];

  if (!owner) {
    console.error(
      "Tidak ada user di database. Daftarkan minimal satu user lewat UI dulu.",
    );
    process.exit(1);
  }
  console.log(`Owner untuk adopsi: ${owner.email} (${owner.id})`);

  if (!fs.existsSync(DATA_DIR)) {
    console.log("Folder data project tidak ada. Tidak ada yang diadopsi.");
    process.exit(0);
  }

  const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });
  let adopted = 0;
  let skipped = 0;

  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const metaPath = path.join(DATA_DIR, e.name, "project.json");
    if (!fs.existsSync(metaPath)) {
      // sudah project DB, atau bukan project lama
      skipped++;
      continue;
    }

    // Sudah ada di DB?
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, e.name))
      .limit(1);
    if (existing.length) {
      skipped++;
      continue;
    }

    let meta: OldMeta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as OldMeta;
    } catch {
      console.warn(`  ! gagal baca ${metaPath}, dilewati`);
      skipped++;
      continue;
    }

    await db.insert(projects).values({
      id: e.name,
      ownerId: owner.id,
      name: meta.name || e.name,
      rootFile: meta.rootFile || "main.tex",
      outputVersion: meta.outputVersion ?? 0,
      hasPdf: meta.hasPdf ?? false,
      createdAt: meta.createdAt ? new Date(meta.createdAt) : new Date(),
      updatedAt: meta.updatedAt ? new Date(meta.updatedAt) : new Date(),
    });
    await db
      .insert(projectMembers)
      .values({ projectId: e.name, userId: owner.id, role: "owner" })
      .onConflictDoNothing();

    // Rename project.json agar tidak diadopsi ulang.
    try {
      fs.renameSync(metaPath, `${metaPath}.migrated`);
    } catch {
      /* ignore */
    }

    console.log(`  + diadopsi: ${meta.name} (${e.name}) -> ${owner.email}`);
    adopted++;
  }

  console.log(`Selesai. Diadopsi: ${adopted}, dilewati: ${skipped}.`);
  await pool.end();
}

main().catch(async (err) => {
  console.error(err);
  await pool.end();
  process.exit(1);
});
