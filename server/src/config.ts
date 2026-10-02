import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Root folder server (satu level di atas src/). */
export const SERVER_ROOT = path.resolve(__dirname, "..");

/** Root repositori (dua level di atas server/). */
export const REPO_ROOT = path.resolve(SERVER_ROOT, "..");

/**
 * Muat file .env dari root repo secara eksplisit.
 * Diperlukan karena server dijalankan dengan cwd `server/`, sedangkan .env
 * berada di root monorepo (Bun hanya auto-load .env dari cwd).
 * Tidak menimpa env yang sudah ada (prioritas: process.env > .env).
 */
function loadDotEnv(): void {
  const candidates = [
    path.join(REPO_ROOT, ".env"),
    path.join(SERVER_ROOT, ".env"),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const text = fs.readFileSync(file, "utf8");
      for (const rawLine of text.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;
        const eq = line.indexOf("=");
        if (eq <= 0) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        // buang tanda kutip pembungkus bila ada
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        if (process.env[key] === undefined) process.env[key] = value;
      }
    } catch {
      /* abaikan bila gagal baca */
    }
    break; // cukup file pertama yang ditemukan
  }
}

loadDotEnv();


/** Folder penyimpanan project. */
export const DATA_DIR = process.env.LATEX_DATA_DIR
  ? path.resolve(process.env.LATEX_DATA_DIR)
  : path.join(SERVER_ROOT, "data", "projects");

/** Lokasi binary tectonic. */
export const TECTONIC_BIN =
  process.env.TECTONIC_BIN || path.join(REPO_ROOT, "tools", "tectonic.exe");

/** Port HTTP server. */
export const PORT = Number(process.env.PORT ?? 5174);

/** Host bind. */
export const HOST = process.env.HOST ?? "127.0.0.1";

/* ------------------------------ Database ------------------------------ */

/** URL koneksi PostgreSQL. */
export const DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://latex:latex@127.0.0.1:5437/latex";

/* -------------------------------- Redis ------------------------------- */

/** URL koneksi Redis. */
export const REDIS_URL = process.env.REDIS_URL ?? "redis://127.0.0.1:6381";

/* --------------------------------- Auth ------------------------------- */

/** Secret Better Auth (min 32 char). */
export const BETTER_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? "dev-secret-ubah-di-produksi-minimal-32";

/** Base URL backend (untuk Better Auth). */
export const BETTER_AUTH_URL =
  process.env.BETTER_AUTH_URL ?? `http://${HOST}:${PORT}`;

/** Origin frontend yang diizinkan (CORS + redirect auth), dipisah koma. */
export const WEB_ORIGINS = (
  process.env.WEB_ORIGIN ?? "http://127.0.0.1:5173,http://localhost:5173"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** Origin utama (pertama) — untuk kompatibilitas. */
export const WEB_ORIGIN = WEB_ORIGINS[0];

/** Kredensial OAuth opsional. */
export const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
export const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
export const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? "";
export const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? "";

/** Mode produksi (menyalakan cookie secure & pengaturan terkait). */
export const IS_PROD = process.env.NODE_ENV === "production";

/**
 * Apakah cookie auth memakai flag Secure.
 * Bila BETTER_AUTH_URL https, otomatis true.
 */
export const COOKIE_SECURE =
  process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === "true"
    : BETTER_AUTH_URL.startsWith("https://");

/** Timeout compile (ms). */
export const COMPILE_TIMEOUT_MS = Number(
  process.env.COMPILE_TIMEOUT_MS ?? 120_000,
);

/** Ukuran maksimum upload (bytes) untuk import zip / file. */
export const MAX_UPLOAD_BYTES = Number(
  process.env.MAX_UPLOAD_BYTES ?? 100 * 1024 * 1024,
);

/** Ekstensi file teks yang boleh diedit di editor. */
export const TEXT_EXTENSIONS = new Set([
  ".tex",
  ".bib",
  ".cls",
  ".sty",
  ".bst",
  ".txt",
  ".md",
  ".lhs",
  ".cfg",
  ".def",
  ".clo",
  ".json",
  ".yaml",
  ".yml",
  ".tikz",
  ".pgf",
]);

/** Ekstensi yang dilarang sama sekali (keamanan). */
export const BLOCKED_EXTENSIONS = new Set([
  ".exe",
  ".dll",
  ".bat",
  ".cmd",
  ".com",
  ".scr",
  ".msi",
  ".ps1",
  ".sh",
  ".js",
  ".vbs",
  ".jar",
]);
