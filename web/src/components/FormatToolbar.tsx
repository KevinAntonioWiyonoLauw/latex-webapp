import { useState } from "react";
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
import { toast } from "sonner";
import { useStore } from "../store";
import {
  insertAtCursor,
  insertBlock,
  wrapSelection,
  wrapLinesAsEnvironment,
} from "../monaco-bridge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  const [imgDialog, setImgDialog] = useState(false);

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
      hint: "\\underline{…}  (Ctrl+U)",
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
      hint: "$…$  (Ctrl+E)",
      icon: <Sigma className="size-3.5" />,
      run: () => wrapSelection("$", "$"),
    },
    {
      id: "math-block",
      label: "Rumus blok",
      hint: "equation",
      icon: <Sigma className="size-3.5" />,
      run: () =>
        insertBlock("\\begin{equation}\n  \n  \\label{eq:}\n\\end{equation}\n"),
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
      hint: "figure + \\includegraphics",
      icon: <ImageIcon className="size-3.5" />,
      run: () => setImgDialog(true),
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
      hint: "garis horizontal",
      icon: <Minus className="size-3.5" />,
      run: () => insertBlock("\n\\noindent\\rule{\\textwidth}{0.4pt}\n"),
    },
  ];

  return (
    <>
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

      <ImageInsertDialog
        open={imgDialog}
        onOpenChange={setImgDialog}
        onInsert={(opts) => {
          const { path, width, caption, label, asFigure } = opts;
          if (!asFigure) {
            insertBlock(`\\includegraphics[width=${width}]{${path}}\n`);
          } else {
            insertBlock(
              [
                "\\begin{figure}[h]",
                "  \\centering",
                `  \\includegraphics[width=${width}]{${path}}`,
                `  \\caption{${caption}}`,
                `  \\label{${label}}`,
                "\\end{figure}",
                "",
              ].join("\n"),
            );
          }
          toast.success("Kode gambar disisipkan di posisi kursor");
        }}
        hasProject={!!project}
      />
    </>
  );
}

/**
 * Dialog penyisipan gambar (menggantikan `window.prompt`).
 *
 * Menyediakan pemilih file dari folder project supaya user tidak perlu menulis
 * path secara manual — sumber kesalahan paling umum.
 */
function ImageInsertDialog({
  open,
  onOpenChange,
  onInsert,
  hasProject,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onInsert: (opts: {
    path: string;
    width: string;
    caption: string;
    label: string;
    asFigure: boolean;
  }) => void;
  hasProject: boolean;
}) {
  const tree = useStore((s) => s.tree);
  const [path, setPath] = useState("");
  const [width, setWidth] = useState("0.8\\textwidth");
  const [caption, setCaption] = useState("");
  const [label, setLabel] = useState("");
  const [asFigure, setAsFigure] = useState(true);

  /** Kumpulkan semua file gambar di project (rekursif). */
  const images: string[] = [];
  const walk = (nodes: typeof tree) => {
    for (const n of nodes) {
      if (n.type === "file" && /\.(png|jpe?g|pdf|eps|svg|gif)$/i.test(n.path)) {
        images.push(n.path);
      } else if (n.type === "dir" && n.children) {
        walk(n.children);
      }
    }
  };
  walk(tree);

  const widths: [string, string][] = [
    ["0.3\\textwidth", "30%"],
    ["0.5\\textwidth", "50%"],
    ["0.8\\textwidth", "80%"],
    ["\\textwidth", "100%"],
  ];

  const autoLabel = (p: string) =>
    "fig:" + (p.split("/").pop() ?? "").replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9]+/g, "-");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="size-4" />
            Sisipkan gambar
          </DialogTitle>
          <DialogDescription>
            Pilih gambar dari project, atau tulis path-nya sendiri.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              File gambar
            </span>
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="images/diagram.png"
              className="h-8 font-mono text-xs"
            />
          </label>

          {images.length > 0 && (
            <div className="rounded border bg-muted/40 p-2">
              <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">
                Gambar di project ({images.length})
              </p>
              <div className="flex max-h-32 flex-wrap gap-1.5 overflow-auto">
                {images.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => {
                      setPath(p);
                      if (!label) setLabel(autoLabel(p));
                    }}
                    className={cn(
                      "max-w-full truncate rounded border px-2 py-1 font-mono text-[11px]",
                      path === p
                        ? "border-primary bg-primary/15 text-foreground"
                        : "text-muted-foreground hover:bg-accent",
                    )}
                    title={p}
                  >
                    {p.split("/").pop()}
                  </button>
                ))}
              </div>
            </div>
          )}

          {!hasProject && (
            <p className="text-[11px] text-amber-300">
              Project belum dimuat.
            </p>
          )}

          <div className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              Lebar
            </span>
            <div className="flex flex-wrap gap-1.5">
              {widths.map(([v, l]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setWidth(v)}
                  className={cn(
                    "rounded border px-2 py-1 text-[11px]",
                    width === v
                      ? "border-primary bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={asFigure}
              onChange={(e) => setAsFigure(e.target.checked)}
            />
            Bungkus <code className="rounded bg-muted px-1">figure</code> (caption
            &amp; label)
          </label>

          {asFigure && (
            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Caption
                </span>
                <Input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  placeholder="(opsional)"
                  className="h-8 text-xs"
                />
              </label>
              <label className="space-y-1">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Label
                </span>
                <Input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="fig:nama"
                  className="h-8 text-xs"
                />
              </label>
            </div>
          )}

          {path && (
            <pre className="overflow-x-auto rounded border bg-muted/40 px-2 py-1.5 font-mono text-[10px] text-muted-foreground">
              {asFigure
                ? `\\begin{figure}[h]\n  \\centering\n  \\includegraphics[width=${width}]{${path}}\n  \\caption{${caption}}\n  \\label{${label}}\n\\end{figure}`
                : `\\includegraphics[width=${width}]{${path}}`}
            </pre>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            disabled={!path.trim()}
            onClick={() => {
              onInsert({
                path: path.trim(),
                width,
                caption: caption.trim() || path.split("/").pop() || "Gambar",
                label: label.trim() || autoLabel(path),
                asFigure,
              });
              onOpenChange(false);
            }}
          >
            <ImageIcon />
            Sisipkan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
