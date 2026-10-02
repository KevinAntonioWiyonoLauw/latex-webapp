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
    const absFrom = safeResolve(this.workspaceDir(id), from);
    const absTo = safeResolve(this.workspaceDir(id), to);
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
