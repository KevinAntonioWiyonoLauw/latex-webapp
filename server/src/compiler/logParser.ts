import type { LogEntry, LogLevel } from "@latex/shared";

/**
 * Parser log LaTeX (output tectonic) menjadi daftar LogEntry
 * yang bisa dipetakan ke baris editor.
 *
 * Format umum:
 *   ! LaTeX Error: Something bad.
 *   l.42 \command
 *   main.tex:12: Undefined control sequence.
 *   LaTeX Warning: Reference ...
 *   Overfull \hbox ...
 */

const ERROR_RE = /^!\s?(.*)$/;
const FILELINE_RE = /^(.+?\.(?:tex|sty|cls|bib|def|cfg)):(\d+):\s*(.*)$/i;
const LINE_RE = /^l\.(\d+)\s?(.*)$/;
const WARN_RE = /^(?:LaTeX|Package\s+\S+|Class\s+\S+)\s+Warning:\s*(.*)$/i;
const OVERFULL_RE = /^(Overfull|Underfull)\s+\\([hv])box/i;

export function parseLog(raw: string): LogEntry[] {
  const lines = raw.split(/\r?\n/);
  const out: LogEntry[] = [];
  let lastError: LogEntry | null = null;
  let currentFile: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim();

    // Deteksi file aktif dari "(./path/file.tex" atau "/abs/file.tex"
    const openMatch = /\(([^()\s]+\.(?:tex|sty|cls|bib|def|cfg))\b/i.exec(line);
    if (openMatch) currentFile = openMatch[1];

    const fm = FILELINE_RE.exec(trimmed);
    if (fm) {
      out.push({
        level: "error",
        message: fm[3].trim() || "Error",
        file: fm[1],
        line: Number(fm[2]),
      });
      continue;
    }

    const em = ERROR_RE.exec(trimmed);
    if (em) {
      lastError = { level: "error", message: em[1].trim(), file: currentFile };
      out.push(lastError);
      continue;
    }

    const lm = LINE_RE.exec(trimmed);
    if (lm && lastError) {
      lastError.line = Number(lm[1]);
      if (lm[2]) lastError.message += ` (${lm[2].trim()})`;
      lastError = null;
      continue;
    }

    const wm = WARN_RE.exec(trimmed);
    if (wm) {
      out.push({
        level: "warning",
        message: wm[1].trim(),
        file: currentFile,
      });
      continue;
    }

    if (OVERFULL_RE.test(trimmed)) {
      out.push({ level: "warning", message: trimmed });
      continue;
    }
  }

  return dedupe(out);
}

function dedupe(entries: LogEntry[]): LogEntry[] {
  const seen = new Set<string>();
  const out: LogEntry[] = [];
  for (const e of entries) {
    const key = `${e.level}|${e.file ?? ""}|${e.line ?? ""}|${e.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return out;
}

/** Ambil pesan error utama untuk ditampilkan ringkas. */
export function firstErrorMessage(entries: LogEntry[]): string | undefined {
  const err = entries.find((e) => e.level === "error");
  return err?.message;
}

export function countByLevel(entries: LogEntry[]): Record<LogLevel, number> {
  const c: Record<LogLevel, number> = { error: 0, warning: 0, info: 0 };
  for (const e of entries) c[e.level]++;
  return c;
}
