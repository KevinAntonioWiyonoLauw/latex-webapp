import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import editorWorker from "monaco-editor/esm/vs/editor/editor.worker?worker";
import jsonWorker from "monaco-editor/esm/vs/language/json/json.worker?worker";
import cssWorker from "monaco-editor/esm/vs/language/css/css.worker?worker";
import htmlWorker from "monaco-editor/esm/vs/language/html/html.worker?worker";
import tsWorker from "monaco-editor/esm/vs/language/typescript/ts.worker?worker";
import { registerLatex, registerLatexCompletion } from "./latexLanguage";

/** Context untuk completion: label & bib key dari seluruh project. */
const completionContext: { labels: string[]; bibKeys: string[] } = {
  labels: [],
  bibKeys: [],
};

/** Perbarui context completion (dipanggil store saat file berubah). */
export function setCompletionContext(ctx: {
  labels?: string[];
  bibKeys?: string[];
}): void {
  if (ctx.labels) completionContext.labels = ctx.labels;
  if (ctx.bibKeys) completionContext.bibKeys = ctx.bibKeys;
}

/**
 * Konfigurasi Monaco agar memakai bundle lokal (offline), bukan CDN.
 * Juga mendaftarkan worker yang diperlukan.
 */
export function setupMonaco(): void {
  // Atur worker MonacoEnvironment.
  self.MonacoEnvironment = {
    getWorker(_moduleId: string, label: string) {
      switch (label) {
        case "json":
          return new jsonWorker();
        case "css":
        case "scss":
        case "less":
          return new cssWorker();
        case "html":
        case "handlebars":
        case "razor":
          return new htmlWorker();
        case "typescript":
        case "javascript":
          return new tsWorker();
        default:
          return new editorWorker();
      }
    },
  };

  loader.config({ monaco });
  registerLatex(monaco);
  registerLatexCompletion(monaco, () => completionContext);
}
