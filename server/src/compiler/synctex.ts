import { gunzipSync } from "node:zlib";
import fs from "node:fs";

/**
 * Parser SyncTeX (format teks .synctex.gz).
 *
 * Header:
 *   SyncTeX Version:1
 *   Input:<tag>:<path>
 *   Output:pdf
 *   Magnification:1000
 *   Unit:1
 *   X Offset:0
 *   Y Offset:0
 *   Content:
 *
 * Body:
 *   !<count>                          jumlah record
 *   {<depth>  /  }<depth>             masuk/keluar level kedalaman
 *   [<tag>,<line>:<x>,<y>:<w>,<h>,<d> vbox  (level top = halaman/sheet)
 *   (<tag>,<line>:<x>,<y>:<w>,<h>,<d> hbox
 *   v<tag>,<line>:<x>,<y>:<w>,<h>,<d> vbox border
 *   h<tag>,<line>:<x>,<y>:<w>,<h>,<d> hbox rule
 *   x<tag>,<line>:<x>,<y>             titik
 *   k<tag>,<line>:<x>,<y>:<w>         kern
 *   g<tag>,<line>:<x>,<y>             glue
 *   $<tag>,<line>:<x>,<y>             math
 *   r<tag>,<line>:<x>,<y>:<w>,<h>,<d> rule
 *
 * Field sebelum koma adalah TAG FILE (indeks ke tabel Input), BUKAN page.
 *
 * Koordinat raw adalah satuan sp: 1 big point (bp, 72 dpi) = 65536 sp.
 * Konversi raw -> bp: raw / (65536 * magnification / 1000).
 *
 * Nomor halaman TIDAK disimpan eksplisit. Diturunkan dari geometri:
 *   page = floor((y - yOffset) / pageHeight) + 1
 * dengan pageHeight dideteksi dari tinggi kertas (default A4 = 842 bp).
 */

export interface BoxRecord {
  tag: number;
  line: number;
  /** koordinat & dimensi dalam unit raw SyncTeX (sp) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Halaman (1-based), dihitung dari geometri saat addBox. */
  page: number;
  /** Tipe record asal: '[' vbox, '(' hbox, 'x' point, dll. */
  kind: string;
}

const SP_PER_BP = 65536;
/** Tinggi kertas default (A4 dalam bp, portrait). */
const DEFAULT_PAGE_HEIGHT_BP = 842;
/** Lebar kertas default (A4 dalam bp). */
const DEFAULT_PAGE_WIDTH_BP = 595;

export class SynctexData {
  readonly inputs = new Map<number, string>();
  readonly boxes: BoxRecord[] = [];
  private readonly byFileLine = new Map<string, Map<number, BoxRecord[]>>();

  /** Tinggi halaman efektif (bp) untuk perhitungan page. */
  pageHeightBp = DEFAULT_PAGE_HEIGHT_BP;
  readonly pageWidthBp = DEFAULT_PAGE_WIDTH_BP;

  /** Offset Y dari header SyncTeX (raw sp). */
  yOffsetRaw = 0;
  xOffsetRaw = 0;

  constructor(
    readonly unit: number,
    readonly magnification: number,
  ) {}

  addInput(tag: number, filePath: string): void {
    this.inputs.set(tag, filePath);
  }

  /** Faktor konversi raw sp -> big point (72 dpi). */
  get scale(): number {
    return (SP_PER_BP * this.magnification) / 1000;
  }

  addBox(rec: BoxRecord): void {
    // Hitung page dari posisi vertikal.
    const yBp = (rec.y - this.yOffsetRaw) / this.scale;
    rec.page = Math.max(1, Math.floor(yBp / this.pageHeightBp) + 1);

    this.boxes.push(rec);
    const file = this.inputs.get(rec.tag);
    if (file === undefined) return;
    const key = normalizePath(file);
    let lines = this.byFileLine.get(key);
    if (!lines) {
      lines = new Map();
      this.byFileLine.set(key, lines);
    }
    let arr = lines.get(rec.line);
    if (!arr) {
      arr = [];
      lines.set(rec.line, arr);
    }
    arr.push(rec);
  }

  files(): string[] {
    return [...this.inputs.values()];
  }

  /** Record dengan dimensi terbaik untuk file+line (source -> pdf). */
  boxesFor(file: string, line: number): BoxRecord[] {
    const byLine = this.byFileLine.get(normalizePath(file));
    if (!byLine) return [];
    const exact = byLine.get(line);
    if (exact && exact.length) return sortByUsefulness(exact);
    // fallback: line terdekat >= line, lalu terdekat < line
    let up: number | null = null;
    for (const l of byLine.keys()) {
      if (l >= line && (up === null || l < up)) up = l;
    }
    if (up !== null) return sortByUsefulness(byLine.get(up) ?? []);
    let down: number | null = null;
    for (const l of byLine.keys()) {
      if (l < line && (down === null || l > down)) down = l;
    }
    return down !== null ? sortByUsefulness(byLine.get(down) ?? []) : [];
  }

  /** Record terbaik untuk klik di halaman/titik (pdf -> source). */
  editAtPage(page: number, x: number, y: number): BoxRecord | null {
    // y di sini adalah koordinat dalam halaman (bp dari atas halaman).
    const yAbs = (page - 1) * this.pageHeightBp + y;

    let best: BoxRecord | null = null;
    let bestScore = Infinity;
    for (const rec of this.boxes) {
      const rx = (rec.x - this.xOffsetRaw) / this.scale;
      const ry = (rec.y - this.yOffsetRaw) / this.scale;
      const rw = Math.max(rec.width, 0) / this.scale;
      const rh = Math.max(rec.height, 0) / this.scale;

      const inside =
        x >= rx - 1 && x <= rx + rw + 1 && yAbs >= ry - 1 && yAbs <= ry + rh + 1;
      const cx = rx + rw / 2;
      const cy = ry + rh / 2;
      let score = inside ? 0 : Math.hypot(x - cx, yAbs - cy);
      // utamakan record yang punya area (hbox/vbox)
      if (rw === 0 && rh === 0) score += 1000;
      if (score < bestScore) {
        bestScore = score;
        best = rec;
      }
    }
    return best;
  }
}

function sortByUsefulness(recs: BoxRecord[]): BoxRecord[] {
  return [...recs].sort((a, b) => {
    const da = a.width * a.height;
    const db = b.width * b.height;
    if ((db > 0 ? 1 : 0) !== (da > 0 ? 1 : 0)) return db > 0 ? 1 : -1;
    return db - da;
  });
}

function normalizePath(p: string): string {
  return p.replace(/\\/g, "/").toLowerCase();
}

/** Parse isi teks .synctex menjadi SynctexData. */
export function parseSynctex(text: string): SynctexData {
  let unit = 1;
  let magnification = 1000;
  let xOffset = 0;
  let yOffset = 0;
  const lines = text.split(/\r?\n/);

  const inputs: Array<[number, string]> = [];
  let contentStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("Input:")) {
      const rest = line.slice(6);
      const ci = rest.indexOf(":");
      if (ci > 0) {
        const tag = Number(rest.slice(0, ci));
        const p = rest.slice(ci + 1);
        if (!Number.isNaN(tag) && p) inputs.push([tag, p]);
      }
    } else if (line.startsWith("Unit:")) {
      const u = Number(line.slice(5));
      if (u && !Number.isNaN(u)) unit = u;
    } else if (line.startsWith("Magnification:")) {
      const m = Number(line.slice(14));
      if (m && !Number.isNaN(m)) magnification = m;
    } else if (line.startsWith("X Offset:")) {
      const v = Number(line.slice(9));
      if (!Number.isNaN(v)) xOffset = v;
    } else if (line.startsWith("Y Offset:")) {
      const v = Number(line.slice(9));
      if (!Number.isNaN(v)) yOffset = v;
    } else if (line.startsWith("Content:")) {
      contentStart = i + 1;
      break;
    }
  }

  const data = new SynctexData(unit, magnification);
  data.xOffsetRaw = xOffset;
  data.yOffsetRaw = yOffset;
  for (const [tag, p] of inputs) data.addInput(tag, p);
  if (contentStart < 0) return data;

  // Deteksi tinggi kertas dari vbox teratas (bounding box halaman pertama).
  // Kita kumpulkan dulu semua record, lalu estimasi pageHeight dari
  // max(y + height) vbox level-1.
  const pending: BoxRecord[] = [];
  for (let i = contentStart; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const c = line[0];
    if (c === "{" || c === "}" || c === "!" || c === ")" || c === "]" ||
        c === ">" || c === "<") {
      continue;
    }
    if (
      c === "[" ||
      c === "(" ||
      c === "h" ||
      c === "v" ||
      c === "x" ||
      c === "k" ||
      c === "g" ||
      c === "$" ||
      c === "r"
    ) {
      const rec = parseRecord(line);
      if (rec) pending.push(rec);
    }
  }

  // Estimasi dimensi halaman: ambil vbox '[' dengan area terbesar
  // (biasanya bounding box sheet).
  const vboxes = pending.filter((r) => r.kind === "[");
  let pageH = DEFAULT_PAGE_HEIGHT_BP;
  if (vboxes.length) {
    let maxY = 0;
    for (const v of vboxes) {
      const bottom = v.y + Math.max(v.height, 0);
      if (bottom > maxY) maxY = bottom;
    }
    const hBp = (maxY - yOffset) / data.scale;
    if (hBp > 100 && hBp < 5000) pageH = hBp;
  }
  data.pageHeightBp = pageH;

  for (const rec of pending) data.addBox(rec);
  return data;
}

/**
 * Parse satu record.
 * Format: "<kindchar><tag>,<line>:<x>,<y>[:<w>,<h>[,<d>]]"
 */
function parseRecord(line: string): BoxRecord | null {
  let s = line;
  const kindChar = s[0];
  if (!/[0-9]/.test(kindChar)) s = s.slice(1);

  const colonIdx = s.indexOf(":");
  if (colonIdx < 0) return null;
  const head = s.slice(0, colonIdx); // "tag,line"
  const rest = s.slice(colonIdx + 1);

  const comma = head.indexOf(",");
  if (comma < 0) return null;
  const tag = Number(head.slice(0, comma));
  const lineNo = Number(head.slice(comma + 1));
  if (Number.isNaN(tag) || Number.isNaN(lineNo)) return null;

  const parts = rest.split(":");
  const coords = parts[0]?.split(",") ?? [];
  const dims = parts[1]?.split(",") ?? [];

  return {
    tag,
    line: lineNo,
    x: num(coords[0]),
    y: num(coords[1]),
    width: num(dims[0]),
    height: num(dims[1]),
    page: 1,
    kind: kindChar,
  };
}

function num(s: string | undefined): number {
  if (!s) return 0;
  const v = Number(s);
  return Number.isNaN(v) ? 0 : v;
}

/** Baca & parse file .synctex.gz dari disk. */
export function readSynctexFile(path: string): SynctexData | null {
  try {
    const gz = fs.readFileSync(path);
    const text = gunzipSync(gz).toString("utf8");
    return parseSynctex(text);
  } catch {
    return null;
  }
}
