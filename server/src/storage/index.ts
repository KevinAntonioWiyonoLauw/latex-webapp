import fsp from "node:fs/promises";
import path from "node:path";
import type { FileNode } from "@latex/shared";
import { DATA_DIR, MAX_UPLOAD_BYTES } from "../config.js";
import {
  ensureDir,
  exists,
  removePath,
  safeResolve,
  toPosix,
} from "../utils/paths.js";

const WORKSPACE_DIR = "workspace";
const OUTPUT_DIR = ".output";

/** Ukuran file bila ada; 0 bila tidak ada / tidak bisa dibaca. */
async function fileSizeIfExists(p: string): Promise<number> {
  try {
    const st = await fsp.stat(p);
    return st.size;
  } catch {
    return 0;
  }
}

/**
 * Storage level FILE (disk) untuk sebuah project.
 * Metadata project (nama, owner, rootFile, ACL) disimpan di PostgreSQL
 * melalui `projectRepo` — lihat `src/db/projects.repo.ts`.
 */
export class Storage {
  constructor(private readonly root: string = DATA_DIR) {}

  async init(): Promise<void> {
    await ensureDir(this.root);
  }

  /** Folder root sebuah project di disk. */
  projectDir(id: string): string {
    return safeResolve(this.root, id);
  }

  /** Folder workspace (tempat file sumber user). */
  workspaceDir(id: string): string {
    return path.join(this.projectDir(id), WORKSPACE_DIR);
  }

  /** Folder output (PDF, synctex, log). */
  outputDir(id: string): string {
    return path.join(this.projectDir(id), OUTPUT_DIR);
  }

  /** Pastikan folder project ada. */
  async ensureProjectDirs(id: string): Promise<void> {
    await ensureDir(this.workspaceDir(id));
    await ensureDir(this.outputDir(id));
  }

  /** Hapus seluruh folder project (dipakai saat delete project). */
  async removeProjectDir(id: string): Promise<void> {
    if (exists(this.workspaceDir(id)) || exists(this.outputDir(id))) {
      await removePath(this.projectDir(id));
    }
  }

  /** Bangun file-tree rekursif dari workspace. */
  async tree(id: string): Promise<FileNode[]> {
    const ws = this.workspaceDir(id);
    return this.buildTree(ws, "");
  }

  private async buildTree(root: string, rel: string): Promise<FileNode[]> {
    const dir = rel ? safeResolve(root, rel) : root;
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return [];
    }
    const nodes: FileNode[] = [];
    for (const e of entries) {
      if (e.name.startsWith(".")) continue;
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        nodes.push({
          name: e.name,
          path: childRel,
          type: "dir",
          children: await this.buildTree(root, childRel),
        });
      } else if (e.isFile()) {
        let size = 0;
        let mtime = 0;
        try {
          const st = await fsp.stat(path.join(dir, e.name));
          size = st.size;
          mtime = st.mtimeMs;
        } catch {
          /* ignore */
        }
        nodes.push({ name: e.name, path: childRel, type: "file", size, mtime });
      }
    }
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    return nodes;
  }

  /** Baca isi file teks. */
  async readFile(id: string, rel: string): Promise<string> {
    const abs = safeResolve(this.workspaceDir(id), rel);
    return fsp.readFile(abs, "utf8");
  }

  /** Baca file sebagai Buffer (untuk binary/gambar). */
  async readFileBuffer(id: string, rel: string): Promise<Buffer> {
    const abs = safeResolve(this.workspaceDir(id), rel);
    return fsp.readFile(abs);
  }

  /** Tulis file teks (buat folder parent bila perlu). */
  async writeFile(id: string, rel: string, content: string): Promise<void> {
    const abs = safeResolve(this.workspaceDir(id), rel);

    // PENGAMAN ANTI DATA-LOSS (jalur autosave HTTP).
    // Klien yang masih memegang tab berisi KOSONG (mis. sisa keadaan rusak
    // sebelum perbaikan kolaborasi) akan menulis kekosongan itu setiap kali
    // autosave/compile berjalan, sehingga dokumen berisi terus-menerus
    // dikosongkan dan compile gagal dengan "Emergency stop".
    //
    // Menolak penulisan kosong ke file yang masih berisi jauh lebih aman:
    // menghapus seluruh isi dokumen selalu bisa dilakukan lewat tombol hapus,
    // sedangkan kehilangan dokumen tidak bisa dibatalkan.
    if (content.length === 0) {
      const existing = await fileSizeIfExists(abs);
      if (existing > 0) {
        throw new Error(
          `Ditolak: menulis konten kosong ke "${rel}" yang masih berisi ${existing} byte. ` +
            `Muat ulang halaman (Ctrl+Shift+R) agar editor sinkron dengan file di server.`,
        );
      }
    }

    await ensureDir(path.dirname(abs));
    await fsp.writeFile(abs, content, "utf8");
  }

  /** Tulis buffer binary (untuk upload). */
  async writeFileBuffer(id: string, rel: string, buf: Buffer): Promise<void> {
    if (buf.length > MAX_UPLOAD_BYTES) throw new Error("File terlalu besar");
    const abs = safeResolve(this.workspaceDir(id), rel);
    await ensureDir(path.dirname(abs));
    await fsp.writeFile(abs, buf);
  }

  /** Buat folder baru. */
  async mkdir(id: string, rel: string): Promise<void> {
    await ensureDir(safeResolve(this.workspaceDir(id), rel));
  }

  /** Hapus file/folder. */
  async deletePath(id: string, rel: string): Promise<void> {
    const abs = safeResolve(this.workspaceDir(id), rel);
    await removePath(abs);
  }

  /** Rename / pindah file. */
  async rename(id: string, from: string, to: string): Promise<void> {
    if (from === to) return;
    const ws = this.workspaceDir(id);
    const absFrom = safeResolve(ws, from);
    const absTo = safeResolve(ws, to);

    // Tolak memindahkan folder ke dalam dirinya sendiri atau sub-foldernya —
    // kalau dibiarkan, `fs.rename` bisa membuat struktur tak terpakai / gagal
    // dengan pesan yang membingungkan.
    const relTo = path.relative(absFrom, absTo);
    if (relTo === "" || (!relTo.startsWith("..") && !path.isAbsolute(relTo))) {
      throw new Error("Tidak bisa memindahkan folder ke dalam dirinya sendiri");
    }

    // PENGAMAN: jangan menimpa file/folder yang sudah ada. `fs.rename` diam-diam
    // menimpa tujuan, sehingga drag & drop yang salah bisa menghapus file lain.
    if (exists(absTo)) {
      throw new Error(`"${to}" sudah ada — pindahkan ke nama lain`);
    }

    await ensureDir(path.dirname(absTo));
    await fsp.rename(absFrom, absTo);
  }

  /** Path absolut file PDF output. */
  pdfPath(id: string): string {
    return path.join(this.outputDir(id), "main.pdf");
  }

  synctexPath(id: string): string {
    return path.join(this.outputDir(id), "main.synctex.gz");
  }

  logPath(id: string): string {
    return path.join(this.outputDir(id), "main.log");
  }

  /** Path workspace relatif (untuk referensi). */
  relativeWorkspace(id: string): string {
    return toPosix(this.workspaceDir(id));
  }
}

/* ----------------------------- Templates ----------------------------- */

export type TemplateId = "article" | "beamer" | "report";

const TEMPLATES: Record<TemplateId, { label: string; content: string }> = {
  article: {
    label: "Article",
    content: `\\documentclass[11pt]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[T1]{fontenc}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Judul Dokumen}
\\author{Nama Anda}
\\date{\\today}

\\begin{document}
\\maketitle

\\begin{abstract}
Ringkasan singkat dokumen.
\\end{abstract}

\\section{Pendahuluan}
Mulai menulis di sini. Contoh rumus: $E = mc^2$.

\\section{Metode}
\\begin{equation}
  \\int_0^1 x^2 \\, dx = \\frac{1}{3}
\\end{equation}

\\end{document}
`,
  },
  report: {
    label: "Report",
    content: `\\documentclass[12pt]{report}
\\usepackage{amsmath, amssymb}
\\usepackage{graphicx}
\\usepackage{hyperref}

\\title{Laporan}
\\author{Nama Anda}
\\date{\\today}

\\begin{document}
\\maketitle
\\tableofcontents

\\chapter{Pendahuluan}
Isi bab pertama.

\\chapter{Pembahasan}
Isi bab kedua.

\\end{document}
`,
  },
  beamer: {
    label: "Beamer (Presentasi)",
    content: `\\documentclass{beamer}
\\usetheme{Madrid}

\\title{Judul Presentasi}
\\author{Nama Anda}
\\date{\\today}

\\begin{document}

\\begin{frame}
  \\titlepage
\\end{frame}

\\begin{frame}{Ringkasan}
  \\begin{itemize}
    \\item Poin pertama
    \\item Poin kedua
  \\end{itemize}
\\end{frame}

\\end{document}
`,
  },
};

export const TEMPLATE_LIST = Object.entries(TEMPLATES).map(([id, t]) => ({
  id: id as TemplateId,
  label: t.label,
}));

/** Ambil isi template berdasarkan id. */
export function getTemplateContent(id: TemplateId): string {
  return (TEMPLATES[id] ?? TEMPLATES.article).content;
}
