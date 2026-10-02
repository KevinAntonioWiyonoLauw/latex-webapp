import type { editor } from "monaco-editor";

/** Referensi global ke editor Monaco yang aktif (untuk aksi dari luar). */
let activeEditor: editor.IStandaloneCodeEditor | null = null;

export function setActiveEditor(ed: editor.IStandaloneCodeEditor | null): void {
  activeEditor = ed;
}

export function getActiveEditor(): editor.IStandaloneCodeEditor | null {
  return activeEditor;
}

/** Sisipkan teks di posisi kursor editor aktif. */
export function insertAtCursor(text: string): boolean {
  if (!activeEditor) return false;
  const sel = activeEditor.getSelection();
  if (!sel) return false;
  activeEditor.executeEdits("insert", [
    {
      range: sel,
      text,
      forceMoveMarkers: true,
    },
  ]);
  activeEditor.focus();
  return true;
}

/**
 * Bungkus teks terpilih dengan `prefix`…`suffix` (mis. `\textbf{` … `}`).
 *
 * Bila tidak ada teks terpilih, sisipkan `prefix + suffix` lalu letakkan
 * kursor di tengahnya supaya user bisa langsung mengetik.
 * Bila sudah dibungkus, membungkus lagi akan MELEPAS bungkusnya (toggle),
 * seperti perilaku tombol Bold di editor biasa.
 */
export function wrapSelection(prefix: string, suffix = "}"): boolean {
  const ed = activeEditor;
  if (!ed) return false;
  const sel = ed.getSelection();
  const model = ed.getModel();
  if (!sel || !model) return false;

  const selected = model.getValueInRange(sel);
  const full = model.getValue();

  // Toggle: sudah dibungkus? -> lepas.
  if (
    selected.startsWith(prefix) &&
    selected.endsWith(suffix) &&
    selected.length >= prefix.length + suffix.length
  ) {
    const inner = selected.slice(prefix.length, selected.length - suffix.length);
    ed.executeEdits("wrap", [{ range: sel, text: inner, forceMoveMarkers: true }]);
    ed.focus();
    return true;
  }

  // Deteksi bungkus di sekitar seleksi (seleksi hanya isinya).
  const before = full.slice(0, model.getOffsetAt(sel.getStartPosition()));
  const after = full.slice(model.getOffsetAt(sel.getEndPosition()));
  if (before.endsWith(prefix) && after.startsWith(suffix)) {
    const startPos = model.getPositionAt(
      model.getOffsetAt(sel.getStartPosition()) - prefix.length,
    );
    const endPos = model.getPositionAt(
      model.getOffsetAt(sel.getEndPosition()) + suffix.length,
    );
    ed.executeEdits("unwrap", [
      {
        range: {
          startLineNumber: startPos.lineNumber,
          startColumn: startPos.column,
          endLineNumber: endPos.lineNumber,
          endColumn: endPos.column,
        },
        text: selected,
        forceMoveMarkers: true,
      },
    ]);
    ed.focus();
    return true;
  }

  if (!selected) {
    // Sisipkan kerangka kosong, kursor di tengah.
    const pos = sel.getStartPosition();
    ed.executeEdits("wrap", [
      {
        range: sel,
        text: prefix + suffix,
        forceMoveMarkers: true,
      },
    ]);
    ed.setPosition({
      lineNumber: pos.lineNumber,
      column: pos.column + prefix.length,
    });
    ed.focus();
    return true;
  }

  ed.executeEdits("wrap", [
    { range: sel, text: prefix + selected + suffix, forceMoveMarkers: true },
  ]);
  ed.focus();
  return true;
}

/**
 * Bungkus baris-baris terpilih dengan sebuah environment
 * (mis. `\begin{itemize}` … `\end{itemize}`), tiap baris diberi `\item`.
 */
export function wrapLinesAsEnvironment(env: string, perLinePrefix = "\\item "): boolean {
  const ed = activeEditor;
  if (!ed) return false;
  const sel = ed.getSelection();
  const model = ed.getModel();
  if (!sel || !model) return false;

  const start = sel.getStartPosition().lineNumber;
  const end = sel.getEndPosition().lineNumber;
  const indent = " ".repeat(
    model.getLineFirstNonWhitespaceColumn(start) > 0
      ? model.getLineFirstNonWhitespaceColumn(start) - 1
      : 0,
  );

  const lines: string[] = [];
  for (let n = start; n <= end; n++) {
    const raw = model.getLineContent(n).trim();
    lines.push(indent + perLinePrefix + raw);
  }

  const text = `${indent}\\begin{${env}}\n${lines.join("\n")}\n${indent}\\end{${env}}`;
  ed.executeEdits("env", [
    {
      range: {
        startLineNumber: start,
        startColumn: 1,
        endLineNumber: end,
        endColumn: model.getLineMaxColumn(end),
      },
      text,
      forceMoveMarkers: true,
    },
  ]);
  ed.focus();
  return true;
}

/** Sisipkan blok teks pada baris baru di posisi kursor. */
export function insertBlock(text: string): boolean {
  const ed = activeEditor;
  if (!ed) return false;
  const pos = ed.getPosition();
  if (!pos) return false;
  ed.executeEdits("block", [
    {
      range: {
        startLineNumber: pos.lineNumber,
        startColumn: pos.column,
        endLineNumber: pos.lineNumber,
        endColumn: pos.column,
      },
      text,
      forceMoveMarkers: true,
    },
  ]);
  ed.focus();
  return true;
}

/** Lompat & sorot sebuah baris (dipakai panel outline). */
export function revealLine(line: number): boolean {
  const ed = activeEditor;
  if (!ed) return false;
  ed.revealLineInCenter(line);
  ed.setPosition({ lineNumber: line, column: 1 });
  ed.focus();
  return true;
}
