import {
  Bold,
  Italic,
  Underline,
  Code2,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Sigma,
  Quote,
  Baseline,
  Minus,
  Type,
} from "lucide-react";
import { useStore } from "../store";
import {
  insertAtCursor,
  insertBlock,
  wrapSelection,
  wrapLinesAsEnvironment,
} from "../monaco-bridge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface Action {
  id: string;
  label: string;
  hint: string;
  icon: React.ReactNode;
  run: () => void;
  /** Hanya tampil bila ada teks terpilih. */
  needsSelection?: boolean;
}

/**
 * Toolbar pemformatan LaTeX (mirip Overleaf).
 *
 * Semua aksi bekerja pada SELEKSI di editor Monaco:
 * - tombol bungkus (Bold/Italic/…) -> `wrapSelection`, dan menekan lagi melepas;
 * - daftar -> `wrapLinesAsEnvironment` (tiap baris jadi `\item`);
 * - rumus/link/gambar -> menyisipkan kerangka di kursor.
 */
export function FormatToolbar({ className }: { className?: string }) {
  const project = useStore((s) => s.project);

  const actions: Action[] = [
    {
      id: "bold",
      label: "Bold",
      hint: "\\textbf{…}  (Ctrl+B)",
      icon: <Bold className="size-3.5" />,
      run: () => wrapSelection("\\textbf{"),
    },
    {
      id: "italic",
      label: "Italic",
      hint: "\\textit{…}  (Ctrl+I)",
      icon: <Italic className="size-3.5" />,
      run: () => wrapSelection("\\textit{"),
    },
    {
      id: "underline",
      label: "Underline",
      hint: "\\underline{…}",
      icon: <Underline className="size-3.5" />,
      run: () => wrapSelection("\\underline{"),
    },
    {
      id: "emph",
      label: "Emphasis",
      hint: "\\emph{…}",
      icon: <Baseline className="size-3.5" />,
      run: () => wrapSelection("\\emph{"),
    },
    {
      id: "texttt",
      label: "Typewriter",
      hint: "\\texttt{…}  (kode)",
      icon: <Code2 className="size-3.5" />,
      run: () => wrapSelection("\\texttt{"),
    },
    {
      id: "sc",
      label: "Small caps",
      hint: "\\textsc{…}",
      icon: <Type className="size-3.5" />,
      run: () => wrapSelection("\\textsc{"),
    },
    {
      id: "itemize",
      label: "Daftar butir",
      hint: "itemize (tiap baris jadi \\item)",
      icon: <List className="size-3.5" />,
      run: () => wrapLinesAsEnvironment("itemize"),
    },
    {
      id: "enumerate",
      label: "Daftar nomor",
      hint: "enumerate",
      icon: <ListOrdered className="size-3.5" />,
      run: () => wrapLinesAsEnvironment("enumerate"),
    },
    {
      id: "quote",
      label: "Kutipan",
      hint: "quote",
      icon: <Quote className="size-3.5" />,
      run: () => wrapLinesAsEnvironment("quote", ""),
    },
    {
      id: "math-inline",
      label: "Rumus inline",
      hint: "$…$",
      icon: <Sigma className="size-3.5" />,
      run: () => wrapSelection("$", "$"),
    },
    {
      id: "math-block",
      label: "Rumus blok",
      hint: "equation",
      icon: <Sigma className="size-3.5" />,
      run: () =>
        insertBlock(
          "\\begin{equation}\n  \n  \\label{eq:}\n\\end{equation}\n",
        ),
    },
    {
      id: "link",
      label: "Tautan",
      hint: "\\href{url}{teks}",
      icon: <Link2 className="size-3.5" />,
      run: () => wrapSelection("\\href{https://}{", "}"),
    },
    {
      id: "image",
      label: "Sisipkan gambar",
      hint: "\\includegraphics{…}",
      icon: <ImageIcon className="size-3.5" />,
      run: () => {
        if (!project) return;
        const name = window.prompt(
          "Nama file gambar di folder images/ (mis. diagram.png):",
          "images/",
        );
        if (!name) return;
        insertBlock(`\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=0.8\\textwidth]{${name}}\n  \\caption{}\n  \\label{fig:}\n\\end{figure}\n`);
      },
    },
    {
      id: "cite",
      label: "Sitasi",
      hint: "\\cite{key}",
      icon: <Quote className="size-3.5" />,
      run: () => insertAtCursor("\\cite{}"),
    },
    {
      id: "hrule",
      label: "Garis pemisah",
      hint: "\\hrulefill",
      icon: <Minus className="size-3.5" />,
      run: () => insertBlock("\n\\noindent\\rule{\\textwidth}{0.4pt}\n"),
    },
  ];

  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-0.5 border-b bg-card px-1.5 py-1",
        className,
      )}
    >
      {actions.map((a, i) => (
        <span key={a.id} className="flex items-center">
          {/* Pemisah antar kelompok. */}
          {(i === 6 || i === 9 || i === 12) && (
            <span className="mx-1 h-4 w-px bg-border" />
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                onClick={a.run}
              >
                {a.icon}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <span className="font-medium">{a.label}</span>
              <span className="ml-2 opacity-70">{a.hint}</span>
            </TooltipContent>
          </Tooltip>
        </span>
      ))}
    </div>
  );
}
