/**
 * Konversi LaTeX <-> HTML untuk "Mode Visual".
 *
 * PRINSIP KESELAMATAN (penting — project ini pernah kena data-loss):
 * Konversi hanya dilakukan pada konstruksi yang DIKENALI. Bila sebuah blok
 * memuat perintah yang tidak kita pahami, blok itu ditandai `raw` dan
 * ditampilkan apa adanya (read-only) — tidak pernah ditulis ulang. Jadi
 * round-trip tidak mungkin menghilangkan perintah LaTeX.
 */

export type Block =
  | { kind: "heading"; level: number; title: string; starred: boolean; line: number; start: number; end: number }
  | { kind: "list"; ordered: boolean; items: string[]; start: number; end: number }
  | { kind: "image"; path: string; width?: string; start: number; end: number }
  | { kind: "text"; html: string; source: string; start: number; end: number }
  | { kind: "raw"; source: string; start: number; end: number };

/** Escape HTML entities. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Urutan penting: `\&` sebelum `&`. */
const UNESCAPE: [RegExp, string][] = [
  [/\\textbackslash\{\}/g, "\\"],
  [/\\&/g, "&"],
  [/\\%/g, "%"],
  [/\\\$/g, "$"],
  [/\\#/g, "#"],
  [/\\_/g, "_"],
  [/\\\{/g, "{"],
  [/\\\}/g, "}"],
  [/\\textasciitilde\{\}/g, "~"],
  [/\\textasciicircum\{\}/g, "^"],
];

const ESCAPE: [string, string][] = [
  ["\\", "\\textbackslash{}"],
  ["&", "\\&"],
  ["%", "\\%"],
  ["$", "\\$"],
  ["#", "\\#"],
  ["_", "\\_"],
  ["{", "\\{"],
  ["}", "\\}"],
  ["~", "\\textasciitilde{}"],
  ["^", "\\textasciicircum{}"],
];

/** Ubah teks LaTeX polos menjadi teks tampilan. */
export function unescapeText(s: string): string {
  let out = s;
  for (const [re, rep] of UNESCAPE) out = out.replace(re, rep);
  return out;
}

/** Ubah teks tampilan menjadi teks LaTeX polos (aman untuk dokumen). */
export function escapeText(s: string): string {
  let out = "";
  for (const ch of s) {
    const hit = ESCAPE.find(([c]) => c === ch);
    out += hit ? hit[1] : ch;
  }
  return out;
}

/** Perintah inline yang kita kenali beserta tag HTML-nya. */
const INLINE_CMDS: { cmd: string; tag: string }[] = [
  { cmd: "textbf", tag: "strong" },
  { cmd: "textit", tag: "em" },
  { cmd: "emph", tag: "em" },
  { cmd: "underline", tag: "u" },
  { cmd: "texttt", tag: "code" },
  { cmd: "textsc", tag: "span" },
];

/**
 * Render satu paragraf LaTeX menjadi HTML.
 * Mengembalikan null bila ada perintah yang tidak dikenal (-> blok `raw`).
 */
export function renderInline(src: string): string | null {
  let out = "";
  let i = 0;
  let safe = true;

  while (i < src.length) {
    const ch = src[i];

    // PENTING: `$` menandai mode matematika. Bila blok memuatnya, JANGAN
    // jadikan blok editable — kalau tidak, `$…$` akan di-escape menjadi
    // `\$…\$` saat disimpan dan rumus user rusak. Blok seperti itu
    // ditampilkan sebagai `raw` (read-only).
    if (ch === "$") {
      safe = false;
      out += esc(src.slice(i));
      break;
    }

    // Escape LaTeX -> karakter biasa.
    if (ch === "\\") {
      const rest = src.slice(i);

      // \\ = ganti baris
      if (rest.startsWith("\\\\")) {
        out += "<br/>";
        i += 2;
        continue;
      }

      // perintah inline yang dikenal
      const hit = INLINE_CMDS.find((c) => rest.startsWith(`\\${c.cmd}{`));
      if (hit) {
        const open = i + hit.cmd.length + 2;
        const { value, end } = readBraced(src, open);
        const inner = renderInline(value);
        if (inner === null) return null;
        out += `<${hit.tag}>${inner}</${hit.tag}>`;
        i = end + 1;
        continue;
      }

      // escape karakter
      const pair = src.slice(i, i + 2);
      if (["\\&", "\\%", "\\$", "\\#", "\\_", "\\{", "\\}"].includes(pair)) {
        out += esc(unescapeText(pair));
        i += 2;
        continue;
      }
      if (rest.startsWith("\\textbackslash{}")) {
        out += esc("\\");
        i += "\\textbackslash{}".length;
        continue;
      }
      if (rest.startsWith("\\textasciitilde{}")) {
        out += esc("~");
        i += "\\textasciitilde{}".length;
        continue;
      }
      if (rest.startsWith("\\textasciicircum{}")) {
        out += esc("^");
        i += "\\textasciicircum{}".length;
        continue;
      }

      // perintah lain -> tidak aman untuk dikonversi
      safe = false;
      out += esc(src.slice(i, i + 20));
      i += 1;
      continue;
    }

    out += esc(ch);
    i += 1;
  }

  return safe ? out : null;
}

/** Baca isi `{...}` mulai dari indeks `{` (brace bersarang). */
function readBraced(src: string, open: number): { value: string; end: number } {
  let depth = 0;
  let out = "";
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === "\\") {
      out += ch + (src[i + 1] ?? "");
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

const SECTION_RE =
  /^\s*\\(part|chapter|section|subsection|subsubsection|paragraph|subparagraph)(\*?)\s*(?:\[[^\]]*\])?\s*\{/;

const LEVEL: Record<string, number> = {
  part: 0,
  chapter: 1,
  section: 2,
  subsection: 3,
  subsubsection: 4,
  paragraph: 5,
  subparagraph: 5,
};

/** Pecah dokumen menjadi blok-blok yang bisa ditampilkan. */
export function toBlocks(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.split("\n");

  let buf: string[] = [];
  let bufLine = 1;
  let bufOffset = 0;
  let offset = 0;
  /** Kedalaman `\begin{...}` yang belum ditutup di dalam buf. */
  let envDepth = 0;

  /** Selesaikan blok yang sedang dikumpulkan (offset akhir = sebelum baris ini). */
  const flush = (endOffset: number) => {
    if (buf.length === 0) return;
    const slice = source.slice(bufOffset, endOffset);
    const lead = /^\s*/.exec(slice)?.[0].length ?? 0;
    const tail = /\s*$/.exec(slice)?.[0].length ?? 0;
    const raw = slice.trim();
    const line = bufLine;
    const start = bufOffset + lead;
    const end = Math.max(start, endOffset - tail);
    buf = [];
    envDepth = 0;
    if (!raw) return;
    blocks.push(classify(raw, line, start, end));
  };

  lines.forEach((ln, idx) => {
    const blank = ln.trim() === "";

    if (blank) {
      // Baris kosong memisahkan blok, KECUALI bila kita sedang di dalam
      // sebuah environment (mis. tabel/rumus multi-baris) — environment harus
      // tetap utuh sebagai satu blok agar tidak terpecah dan rusak.
      if (envDepth === 0) flush(offset);
      else if (buf.length > 0) buf.push(ln);
    } else {
      // Judul section SELALU memulai blok baru, walaupun tidak didahului baris
      // kosong. Tanpa ini, dokumen padat (umum pada template kampus) membuat
      // beberapa section menempel jadi satu blok raksasa.
      if (envDepth === 0 && buf.length > 0 && SECTION_RE.test(ln)) {
        flush(offset);
      }

      if (buf.length === 0) {
        bufLine = idx + 1;
        bufOffset = offset;
      }
      buf.push(ln);

      // Lacak kedalaman environment pada baris ini.
      //
      // PENTING: `document` DIKECUALIKAN. `\begin{document}` membuka
      // environment yang baru ditutup di akhir dokumen, sehingga bila ikut
      // dihitung, envDepth selalu > 0 dan tidak ada satu pun blok yang
      // terpecah — seluruh isi dokumen jadi satu blok raksasa read-only.
      const opens = (ln.match(/\\begin\s*\{(?!document\})/g) ?? []).length;
      const closes = (ln.match(/\\end\s*\{(?!document\})/g) ?? []).length;
      envDepth += opens - closes;
      if (envDepth < 0) envDepth = 0;
    }

    offset += ln.length + 1; // +1 untuk "\n"
  });
  flush(source.length);
  return blocks;
}

function classify(raw: string, line: number, start: number, end: number): Block {
  // Judul section.
  const sec = SECTION_RE.exec(raw);
  if (sec) {
    const open = raw.indexOf("{", raw.indexOf(sec[1]));
    const { value } = readBraced(raw, open);
    const title = renderInline(value);
    if (title !== null && !raw.includes("\n")) {
      return {
        kind: "heading",
        level: LEVEL[sec[1]] ?? 2,
        title,
        starred: sec[2] === "*",
        line,
        start,
        end,
      };
    }
  }

  // Daftar itemize / enumerate sederhana.
  const listRe = /^\s*\\begin\{(itemize|enumerate)\}([\s\S]*)\\end\{\1\}\s*$/;
  const lm = listRe.exec(raw);
  if (lm) {
    const body = lm[2];
    const parts = body.split(/\\item\b/).slice(1);
    if (parts.length) {
      const items: string[] = [];
      let ok = true;
      for (const p of parts) {
        const h = renderInline(p.trim());
        if (h === null) {
          ok = false;
          break;
        }
        items.push(h);
      }
      if (ok) return { kind: "list", ordered: lm[1] === "enumerate", items, start, end };
    }
  }

  // Gambar tunggal.
  const imgRe = /^\s*\\includegraphics(\[[^\]]*\])?\{([^}]+)\}\s*$/;
  const im = imgRe.exec(raw);
  if (im) {
    const width = /width=([^,\]]+)/.exec(im[1] ?? "")?.[1];
    return { kind: "image", path: im[2], width, start, end };
  }

  // Paragraf teks biasa.
  const html = renderInline(raw);
  if (html !== null) return { kind: "text", html, source: raw, start, end };

  return { kind: "raw", source: raw, start, end };
}

/**
 * Serialisasi isi elemen HTML kembali menjadi LaTeX.
 * Hanya menangani tag yang kita hasilkan sendiri; tag lain diabaikan tag-nya.
 */
export function fromHtml(node: Node): string {
  let out = "";
  node.childNodes.forEach((n) => {
    if (n.nodeType === Node.TEXT_NODE) {
      out += escapeText(n.textContent ?? "");
      return;
    }
    if (n.nodeType !== Node.ELEMENT_NODE) return;
    const el = n as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (tag === "br") {
      out += "\\\\\n";
      return;
    }
    const inner = fromHtml(el);
    const map: Record<string, string> = {
      strong: "textbf",
      b: "textbf",
      em: "textit",
      i: "textit",
      u: "underline",
      code: "texttt",
      span: "textsc",
    };
    const cmd = map[tag];
    if (cmd) {
      out += `\\${cmd}{${inner}}`;
      return;
    }
    out += inner;
  });
  return out;
}

/**
 * Terapkan perubahan pada SATU blok saja, tanpa menyentuh bagian dokumen lain.
 *
 * Ini kunci keamanan Mode Visual: kita hanya mengganti rentang karakter
 * [start, end) milik blok itu. Semua perintah LaTeX di luar blok tersebut
 * (preamble, lingkungan kompleks, gambar, dll) tetap utuh apa adanya.
 */
export function applyBlockEdit(
  source: string,
  block: { start: number; end: number },
  newText: string,
): string {
  return source.slice(0, block.start) + newText + source.slice(block.end);
}

/** Bangun LaTeX untuk sebuah paragraf teks dari elemen HTML yang diedit. */
export function paragraphFromHtml(el: HTMLElement): string {
  return fromHtml(el).trim();
}

/** Bangun LaTeX untuk daftar dari elemen <ul>/<ol>. */
export function listFromHtml(el: HTMLElement): string {
  const ordered = el.tagName.toLowerCase() === "ol";
  const items = Array.from(el.querySelectorAll(":scope > li")).map(
    (li) => fromHtml(li).trim(),
  );
  const body = items.map((t) => `  \item ${t}`).join("\n");
  return `\begin{${ordered ? "enumerate" : "itemize"}}\n${body}\n\end{${
    ordered ? "enumerate" : "itemize"
  }}`;
}

/** Bangun LaTeX untuk judul section dari elemen heading visual. */
export function headingFromHtml(el: HTMLElement, command: string, starred: boolean): string {
  return `\\${command}${starred ? "*" : ""}{${fromHtml(el).trim()}}`;
}

/** Bangun LaTeX untuk gambar. */
export function imageFromAttrs(path: string, width?: string): string {
  const opt = width ? `[width=${width}]` : "";
  return `\\includegraphics${opt}{${path}}`;
}
