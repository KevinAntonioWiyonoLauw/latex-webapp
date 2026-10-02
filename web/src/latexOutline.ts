/**
 * Parser struktur dokumen LaTeX (untuk panel "Outline").
 *
 * Hanya membaca — tidak pernah mengubah isi dokumen. Semua perintah
 * section LaTeX didukung (part … subparagraph), termasuk versi berbintang
 * (`\section*{}`) dan argumen opsional (`\section[pendek]{panjang}`).
 */

export type OutlineLevel = 0 | 1 | 2 | 3 | 4 | 5;

export interface OutlineItem {
  /** Nama perintah asli, mis. "section" atau "subsection". */
  command: string;
  /** Judul yang ditampilkan (dari `{...}`, bukan `[...]`). */
  title: string;
  /** Nomor baris (1-based) tempat perintah berada. */
  line: number;
  /** Kedalaman untuk indentasi. */
  level: OutlineLevel;
  /** `\section*` — tidak bernomor. */
  starred: boolean;
}

const LEVELS: Record<string, OutlineLevel> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 5,
};

const RE = /\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(?:\[[^\]]*\])?\s*\{/g;

/**
 * Ambil isi `{...}` mulai dari indeks `open` (posisi karakter `{`),
 * dengan memperhitungkan brace bersarang dan `\{` yang di-escape.
 */
function readBraced(src: string, open: number): { value: string; end: number } {
  let depth = 0;
  let out = "";
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") {
      // Lewati karakter yang di-escape (mis. \{ \}).
      out += src[i + 1] ?? "";
      i++;
      continue;
    }
    if (ch === "{") {
      depth++;
      if (depth === 1) continue;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) return { value: out, end: i };
    }
    out += ch;
  }
  return { value: out, end: src.length };
}

/** Buang markup sederhana dari judul supaya enak dibaca di panel. */
function cleanTitle(raw: string): string {
  return raw
    .replace(/\\[a-zA-Z]+\*?\s*\{([^{}]*)\}/g, "$1") // \textbf{x} -> x
    .replace(/\\[a-zA-Z]+/g, "") // perintah tanpa argumen
    .replace(/[{}$]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cari semua section di dalam dokumen, urut sesuai posisi. */
export function parseOutline(content: string): OutlineItem[] {
  const items: OutlineItem[] = [];
  RE.lastIndex = 0;

  // Hitung nomor baris secara bertahap (hindari split() untuk file besar).
  let line = 1;
  let lineStart = 0;

  let m: RegExpExecArray | null;
  while ((m = RE.exec(content)) !== null) {
    const braceIdx = m.index + m[0].length - 1;
    const { value } = readBraced(content, braceIdx);

    // Hitung baris tempat perintah ini berada.
    while (lineStart < m.index) {
      const nl = content.indexOf("\n", lineStart);
      if (nl === -1 || nl >= m.index) break;
      lineStart = nl + 1;
      line++;
    }

    const command = m[1];
    const title = cleanTitle(value);
    if (title) {
      items.push({
        command,
        title,
        line,
        level: LEVELS[command] ?? 2,
        starred: m[2] === "*",
      });
    }
  }

  return items;
}

/** Label Indonesia untuk tiap jenis section. */
export const OUTLINE_LABEL: Record<string, string> = {
  part: "Bagian",
  chapter: "Bab",
  section: "Seksi",
  subsection: "Sub-seksi",
  subsubsection: "Sub-sub",
  paragraph: "Paragraf",
  subparagraph: "Sub-paragraf",
};

/** Ikon/aksen warna per level (kelas Tailwind). */
export const OUTLINE_COLOR: Record<number, string> = {
  0: "text-purple-300",
  1: "text-pink-300",
  2: "text-amber-300",
  3: "text-sky-300",
  4: "text-emerald-300",
  5: "text-muted-foreground",
};
