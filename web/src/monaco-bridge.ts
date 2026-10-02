import type { editor } from "monaco-editor";

/** Referensi global ke editor Monaco yang aktif (untuk aksi dari luar). */
let activeEditor: editor.IStandaloneCodeEditor | null = null;

export function setActiveEditor(ed: editor.IStandaloneCodeEditor | null): void {
  activeEditor = ed;
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
