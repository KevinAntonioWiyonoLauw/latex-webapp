import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

/**
 * Utilitas path yang aman: memastikan path hasil resolve tetap di dalam root.
 */

/** Normalisasi path relatif ke bentuk POSIX (pakai "/"). */
export function toPosix(p: string): string {
  return p.split(path.sep).join("/");
}

/**
 * Resolve path relatif di dalam `root` dengan proteksi path traversal.
 * Melempar error jika hasil keluar dari root atau berisi segmen terlarang.
 */
export function safeResolve(root: string, relative: string): string {
  if (relative.includes("\0")) throw new Error("Path tidak valid");
  const cleaned = relative.replace(/\\/g, "/").replace(/^\/+/, "");
  const abs = path.resolve(root, cleaned);
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path di luar workspace");
  }
  return abs;
}

/** Apakah path relatif valid (tidak keluar root). */
export function isSafeRelative(relative: string): boolean {
  try {
    const cleaned = relative.replace(/\\/g, "/").replace(/^\/+/, "");
    if (relative.includes("\0")) return false;
    const abs = path.resolve("/root/ws", cleaned);
    const rel = path.relative("/root/ws", abs);
    return !rel.startsWith("..") && !path.isAbsolute(rel);
  } catch {
    return false;
  }
}

/** Pastikan direktori ada. */
export async function ensureDir(dir: string): Promise<void> {
  await fsp.mkdir(dir, { recursive: true });
}

/** Cek keberadaan path. */
export function exists(p: string): boolean {
  return fs.existsSync(p);
}

/** Hapus path secara rekursif (aman jika tidak ada). */
export async function removePath(p: string): Promise<void> {
  await fsp.rm(p, { recursive: true, force: true });
}

/** Baca direktori, kembalikan [] jika tidak ada. */
export async function readDirSafe(dir: string): Promise<fs.Dirent[]> {
  try {
    return await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}
