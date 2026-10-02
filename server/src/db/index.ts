import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { DATABASE_URL } from "../config.js";
import * as schema from "./schema.js";

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

/** Tutup pool saat shutdown. */
export async function closeDb(): Promise<void> {
  await pool.end();
}
