import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@hocuspocus/server";
import * as Y from "yjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COLLAB_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(COLLAB_ROOT, "..");

/** Muat .env dari root repo (sama seperti server). */
function loadDotEnv(): void {
  const file = path.join(REPO_ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    )
      val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadDotEnv();

const PORT = Number(process.env.COLLAB_PORT ?? 1234);
const HOST = process.env.COLLAB_HOST ?? "127.0.0.1";
const API_URL = process.env.COLLAB_API_URL ?? "http://127.0.0.1:5174";
const DATA_DIR = process.env.LATEX_DATA_DIR
  ? path.resolve(process.env.LATEX_DATA_DIR)
  : path.join(REPO_ROOT, "server", "data", "projects");

/** Folder penyimpanan snapshot Y.Doc per project. */
function collabDir(projectId: string): string {
  return path.join(DATA_DIR, projectId, ".collab");
}

function workspaceFile(projectId: string, file: string): string {
  const safe = file.replace(/\\/g, "/").replace(/\.\./g, "");
  return path.join(DATA_DIR, projectId, "workspace", safe);
}

/** Nama dokumen: "<projectId>::<filePath>". */
function docKey(projectId: string, file: string): string {
  return `${projectId}::${file}`;
}

function parseDocName(name: string): { projectId: string; file: string } | null {
  const idx = name.indexOf("::");
  if (idx < 0) return null;
  return { projectId: name.slice(0, idx), file: name.slice(idx + 2) };
}

/** Simpan Y.Doc ke disk (snapshot biner + teks mentah ke file .tex). */
function persistDoc(docName: string, document: Y.Doc): void {
  const parsed = parseDocName(docName);
  if (!parsed) return;
  const { projectId, file } = parsed;

  try {
    // 1) snapshot biner (agar state bertahan antar restart)
    const dir = collabDir(projectId);
    fs.mkdirSync(dir, { recursive: true });
    const state = Y.encodeStateAsUpdate(document);
    const snapPath = path.join(dir, encodeURIComponent(file) + ".bin");
    fs.writeFileSync(snapPath, state);

    // 2) tulis teks ke file sumber (source of truth untuk compile)
    const text = document.getText("content").toString();
    const target = workspaceFile(projectId, file);

    // PENGAMAN ANTI DATA-LOSS:
    // Jangan pernah menimpa file yang BERISI dengan konten KOSONG. Kondisi ini
    // terjadi bila binding Monaco terbentuk sebelum Y.Doc selesai sync, sehingga
    // editor dikosongkan lalu perubahan kosong itu tersimpan. File yang isinya
    // hilang jauh lebih mahal daripada snapshot yang tertunda.
    if (text.length === 0 && fileHasContent(target)) {
      console.warn(
        `[collab] tolak menulis konten kosong ke ${target} (file berisi, ${fileSizeOf(target)} byte). Snapshot tetap disimpan.`,
      );
      return;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, text, "utf8");
  } catch (err) {
    console.error("[collab] gagal persist", docName, err);
  }
}

/** Ukuran file, atau 0 bila tidak ada. */
function fileSizeOf(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

/** Apakah file ada dan berisi (bukan 0 byte). */
function fileHasContent(p: string): boolean {
  return fileSizeOf(p) > 0;
}

/** Muat snapshot biner bila ada. */
function loadSnapshot(docName: string): Uint8Array | null {
  const parsed = parseDocName(docName);
  if (!parsed) return null;
  const snapPath = path.join(
    collabDir(parsed.projectId),
    encodeURIComponent(parsed.file) + ".bin",
  );
  try {
    if (fs.existsSync(snapPath)) return fs.readFileSync(snapPath);
  } catch {
    /* ignore */
  }
  return null;
}

/** Baca file sumber sebagai initial value bila belum ada snapshot. */
function loadPlainFile(docName: string): string {
  const parsed = parseDocName(docName);
  if (!parsed) return "";
  try {
    const target = workspaceFile(parsed.projectId, parsed.file);
    if (fs.existsSync(target)) return fs.readFileSync(target, "utf8");
  } catch {
    /* ignore */
  }
  return "";
}

/**
 * Verifikasi akses user ke project via backend.
 * Mengirim header cookie dari klien ke backend.
 */
async function verifyAccess(
  projectId: string,
  cookie: string | null,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/projects/${projectId}`, {
      headers: cookie ? { cookie } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

const hocuspocus = new Server({
  address: HOST,
  async onAuthenticate({ documentName, requestHeaders }) {
    const parsed = parseDocName(documentName);
    if (!parsed) throw new Error("Nama dokumen tidak valid");
    const cookie = requestHeaders.get("cookie");
    const ok = await verifyAccess(parsed.projectId, cookie);
    if (!ok) throw new Error("Tidak punya akses ke project ini");
    return { projectId: parsed.projectId, file: parsed.file };
  },
  async onLoadDocument({ documentName, document }) {
    // IDEMPOTEN: Hocuspocus bisa memanggil hook ini lebih dari sekali untuk
    // dokumen yang sama (mis. setelah unload lalu ada koneksi baru). Tanpa
    // penjagaan, isi file akan di-insert ULANG ke Y.Text yang sudah berisi
    // sehingga dokumen terduplikasi (mis. 475 -> 950 karakter).
    const text = document.getText("content");
    if (text.length > 0) return document;

    const snap = loadSnapshot(documentName);
    if (snap) {
      Y.applyUpdate(document, snap);
      // Bila snapshot ada tapi isinya kosong (mis. sisa keadaan rusak),
      // pulihkan dari file sumber di disk.
      if (document.getText("content").length === 0) {
        const plain = loadPlainFile(documentName);
        if (plain.length > 0) document.getText("content").insert(0, plain);
      }
    } else {
      const plain = loadPlainFile(documentName);
      if (plain.length > 0) text.insert(0, plain);
    }
    return document;
  },
  async onStoreDocument({ documentName, document }) {
    persistDoc(documentName, document);
  },
});

hocuspocus.listen(PORT).then(() => {
  console.log(`[collab] Hocuspocus siap di ws://${HOST}:${PORT}`);
});

process.on("SIGINT", async () => {
  await hocuspocus.destroy();
  process.exit(0);
});

export { hocuspocus, docKey };
