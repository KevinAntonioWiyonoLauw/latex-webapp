import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { DATABASE_URL } from "../config.js";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Pool koneksi PostgreSQL (satu instance global). */
export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 10,
});

/** Instance Drizzle ORM. */
export const db = drizzle(pool, { schema });

export { schema };
export * from "./schema.js";

/** Cek koneksi DB. */
export async function pingDb(): Promise<boolean> {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    return true;
  } catch {
    return false;
  }
}

/**
 * Jalankan migrasi Drizzle saat server start.
 *
 * Idempoten: Drizzle mencatat migrasi yang sudah dijalankan di tabel
 * `__drizzle_migrations`, jadi aman dipanggil setiap kali server naik.
 * Dengan ini deploy tidak perlu langkah `db:push` manual.
 */
export async function runMigrations(): Promise<void> {
  // Folder migrasi ada di <server>/drizzle, yaitu dua level di atas src/db.
  const folder = path.resolve(__dirname, "..", "..", "drizzle");
  if (!fs.existsSync(folder)) {
    console.warn(`[db] folder migrasi tidak ditemukan (${folder}), dilewati.`);
    return;
  }
  try {
    await migrate(db, { migrationsFolder: folder });
    console.log("[db] migrasi selesai.");
  } catch (err) {
    console.error("[db] migrasi gagal:", err);
    throw err;
  }
}

/** Tutup pool saat shutdown. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
