import type { languages, editor, Position } from "monaco-editor";

/**
 * Definisi syntax highlighting LaTeX untuk Monaco (Monarch tokenizer).
 * Monaco tidak menyediakan bahasa LaTeX secara bawaan, jadi kita tambahkan.
 */
export const latexLanguage: languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".latex",

  keywords: [
    "documentclass",
    "usepackage",
    "begin",
    "end",
    "section",
    "subsection",
    "subsubsection",
    "paragraph",
    "chapter",
    "part",
    "title",
    "author",
    "date",
    "maketitle",
    "label",
    "ref",
    "cite",
    "bibliography",
    "bibliographystyle",
    "include",
    "input",
    "includegraphics",
    "caption",
    "centering",
    "item",
    "itemize",
    "enumerate",
    "tableofcontents",
    "newpage",
    "pageref",
    "footnote",
    "emph",
    "textbf",
    "textit",
    "texttt",
    "frac",
    "sqrt",
    "sum",
    "int",
  ],

  tokenizer: {
    root: [
      [/%.*$/, "comment"],
      [/\\\[|\\\]/, "delimiter.bracket"],
      [/\$\$/, "delimiter.math"],
      [/\$/, { token: "delimiter.math", next: "@math" }],
      [/\\begin\{[^}]*\}/, "keyword.control"],
      [/\\end\{[^}]*\}/, "keyword.control"],
      [/\\[a-zA-Z@]+\*?/, { cases: { "@keywords": "keyword", "@default": "tag" } }],
      [/\\[^a-zA-Z@]/, "tag"],
      [/[{}]/, "delimiter.bracket"],
      [/[\[\]]/, "delimiter.square"],
      [/&/, "delimiter"],
      [/\\\\/, "delimiter"],
      [/\d+(\.\d+)?/, "number"],
    ],
    math: [
      [/\$/, { token: "delimiter.math", next: "@pop" }],
      [/\\[a-zA-Z@]+/, "keyword"],
      [/[{}]/, "delimiter.bracket"],
      [/\d+(\.\d+)?/, "number"],
      [/[_^]/, "operator"],
      [/[+\-*/=<>]/, "operator"],
    ],
  },
};

/* ------------------------ Completion & Snippets ------------------------ */

interface Snip {
  label: string;
  insertText: string;
  detail: string;
  doc?: string;
}

/** Snippet LaTeX umum. `$0` = posisi kursor, `${1:..}` = placeholder. */
const SNIPPETS: Snip[] = [
  {
    label: "\\begin",
    detail: "Environment block",
    insertText:
      "\\\\begin{${1:environment}}\n\t$0\n\\\\end{${1:environment}}",
  },
  {
    label: "\\section",
    detail: "Section",
    insertText: "\\\\section{${1:Judul}}$0",
  },
  {
    label: "\\subsection",
    detail: "Subsection",
    insertText: "\\\\subsection{${1:Judul}}$0",
  },
  {
    label: "\\itemize",
    detail: "Bullet list",
    insertText: "\\\\begin{itemize}\n\t\\\\item $0\n\\\\end{itemize}",
  },
  {
    label: "\\enumerate",
    detail: "Numbered list",
    insertText: "\\\\begin{enumerate}\n\t\\\\item $0\n\\\\end{enumerate}",
  },
  {
    label: "\\figure",
    detail: "Figure dengan gambar",
    insertText:
      "\\\\begin{figure}[h]\n\t\\\\centering\n\t\\\\includegraphics[width=0.8\\\\textwidth]{${1:gambar}}\n\t\\\\caption{${2:Caption}}\n\t\\\\label{fig:${3:label}}\n\\\\end{figure}",
  },
  {
    label: "\\table",
    detail: "Tabel sederhana",
    insertText:
      "\\\\begin{table}[h]\n\t\\\\centering\n\t\\\\begin{tabular}{${1:cc}}\n\t\t${2:a} & ${3:b} \\\\\\\\\n\t\\\\end{tabular}\n\t\\\\caption{${4:Caption}}\n\\\\end{table}",
  },
  {
    label: "\\equation",
    detail: "Persamaan bernomor",
    insertText:
      "\\\\begin{equation}\n\t$0\n\\\\end{equation}",
  },
  {
    label: "\\frac",
    detail: "Pecahan",
    insertText: "\\\\frac{${1:a}}{${2:b}}$0",
  },
  {
    label: "\\includegraphics",
    detail: "Sisipkan gambar",
    insertText: "\\\\includegraphics[width=${1:0.8}\\\\textwidth]{${2:gambar}}$0",
  },
  {
    label: "\\cite",
    detail: "Kutipan referensi",
    insertText: "\\\\cite{${1:key}}$0",
  },
  {
    label: "\\ref",
    detail: "Referensi label",
    insertText: "\\\\ref{${1:label}}$0",
  },
  {
    label: "\\documentclass",
    detail: "Deklarasi kelas dokumen",
    insertText: "\\\\documentclass[${1:11pt}]{${2:article}}$0",
  },
  {
    label: "\\usepackage",
    detail: "Muat paket",
    insertText: "\\\\usepackage{${1:package}}$0",
  },
];

/** Daftar environment umum untuk completion \begin{} / \end{}. */
const ENVIRONMENTS = [
  "document",
  "abstract",
  "itemize",
  "enumerate",
  "figure",
  "table",
  "tabular",
  "equation",
  "align",
  "equation*",
  "align*",
  "center",
  "verbatim",
  "minipage",
  "frame",
  "theorem",
  "proof",
  "matrix",
  "pmatrix",
  "bmatrix",
];

/** Perintah LaTeX untuk completion berbasis `\`. */
const COMMANDS = [
  "documentclass",
  "usepackage",
  "begin",
  "end",
  "section",
  "subsection",
  "subsubsection",
  "chapter",
  "paragraph",
  "title",
  "author",
  "date",
  "maketitle",
  "tableofcontents",
  "label",
  "ref",
  "pageref",
  "cite",
  "bibliography",
  "bibliographystyle",
  "include",
  "input",
  "includegraphics",
  "caption",
  "centering",
  "item",
  "footnote",
  "emph",
  "textbf",
  "textit",
  "texttt",
  "underline",
  "frac",
  "sqrt",
  "sum",
  "prod",
  "int",
  "lim",
  "alpha",
  "beta",
  "gamma",
  "delta",
  "theta",
  "lambda",
  "pi",
  "sigma",
  "omega",
  "infty",
  "partial",
  "nabla",
  "times",
  "cdot",
  "leq",
  "geq",
  "neq",
  "approx",
  "rightarrow",
  "leftarrow",
  "leftrightarrow",
  "mathbf",
  "mathrm",
  "mathcal",
  "text",
];

/** Daftar key dari sebuah konten .bib (untuk \cite). */
function extractBibKeys(content: string): string[] {
  const keys: string[] = [];
  const re = /@\w+\s*\{\s*([^,\s]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) keys.push(m[1]);
  return keys;
}

/**
 * Daftarkan provider completion LaTeX.
 * `getContext` dipakai untuk mengambil daftar label & bib key dari file lain.
 */
export function registerLatexCompletion(
  monaco: typeof import("monaco-editor"),
  getContext: () => { labels: string[]; bibKeys: string[] },
): void {
  const provider: languages.CompletionItemProvider = {
    provideCompletionItems: (
      model: editor.ITextModel,
      position: Position,
    ) => {
      const lineText = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // \begin{...} / \end{...} -> environment
      const envMatch = /\\(begin|end)\{([^}]*)$/.exec(lineText);
      if (envMatch) {
        return {
          suggestions: ENVIRONMENTS.map((e) => ({
            label: e,
            kind: monaco.languages.CompletionItemKind.Enum,
            insertText: e,
            range,
          })),
        };
      }

      // \ref{...} / \pageref{...} -> label
      const refMatch = /\\(ref|pageref|eqref)\{[^}]*$/.exec(lineText);
      if (refMatch) {
        const { labels } = getContext();
        return {
          suggestions: labels.map((l) => ({
            label: l,
            kind: monaco.languages.CompletionItemKind.Reference,
            insertText: l,
            range,
          })),
        };
      }

      // \cite{...} -> bib keys
      const citeMatch = /\\cite[a-z]*\{[^}]*$/.exec(lineText);
      if (citeMatch) {
        const { bibKeys } = getContext();
        return {
          suggestions: bibKeys.map((k) => ({
            label: k,
            kind: monaco.languages.CompletionItemKind.Reference,
            insertText: k,
            range,
          })),
        };
      }

      // Default: snippet + perintah
      const suggestions: languages.CompletionItem[] = [];
      for (const s of SNIPPETS) {
        suggestions.push({
          label: s.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: s.insertText,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: s.detail,
          range,
        });
      }
      for (const c of COMMANDS) {
        suggestions.push({
          label: `\\${c}`,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: `\\${c}`,
          detail: "Perintah LaTeX",
          range,
        });
      }
      return { suggestions };
    },
  };

  monaco.languages.registerCompletionItemProvider("latex", provider);
}

export function registerLatex(monaco: typeof import("monaco-editor")): void {
  monaco.languages.register({ id: "latex" });
  monaco.languages.setMonarchTokensProvider("latex", latexLanguage);

  monaco.languages.setLanguageConfiguration("latex", {
    comments: { lineComment: "%" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
      ["(", ")"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "(", close: ")" },
      { open: "$", close: "$" },
    ],
    surroundingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: "$", close: "$" },
    ],
  });

  // bibtex sederhana
  monaco.languages.register({ id: "bibtex" });
  monaco.languages.setMonarchTokensProvider("bibtex", {
    tokenizer: {
      root: [
        [/@\w+/, "keyword"],
        [/[a-zA-Z]+\s*=/, "attribute.name"],
        [/\{|\}/, "delimiter.bracket"],
        [/".*?"/, "string"],
        [/\d+/, "number"],
        [/%.*$/, "comment"],
      ],
    },
  });
}

/* ------------------------------- Helpers ------------------------------- */

/** Ekstrak semua label \label{...} dari sebuah konten. */
export function extractLabels(content: string): string[] {
  const out: string[] = [];
  const re = /\\label\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) out.push(m[1]);
  return out;
}

export { extractBibKeys };

/** Hitung jumlah kata (estimasi, abaikan perintah LaTeX). */
export function countWords(text: string): number {
  const cleaned = text
    .replace(/\\[a-zA-Z@]+\*?(\[[^\]]*\])?(\{[^}]*\})?/g, " ")
    .replace(/\$[^$]*\$/g, " ")
    .replace(/[{}\\]/g, " ");
  const words = cleaned.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w));
  return words.length;
}
