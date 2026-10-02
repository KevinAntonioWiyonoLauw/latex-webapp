import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, Pencil, Trash2 } from "lucide-react";
import { useStore } from "../store";
import {
  toBlocks,
  applyBlockEdit,
  paragraphFromHtml,
  listFromHtml,
  headingFromHtml,
  type Block,
} from "../latexVisual";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Mode Visual — tampilan "seperti Word" untuk file .tex.
 *
 * KESELAMATAN: setiap perubahan hanya diterapkan pada rentang karakter blok
 * yang bersangkutan (`applyBlockEdit`). Perintah LaTeX yang tidak dikenali
 * ditampilkan sebagai blok `raw` read-only dan TIDAK PERNAH ditulis ulang.
 * Jadi mengedit secara visual tidak bisa merusak preamble / lingkungan rumit.
 */
export function VisualEditor({ className }: { className?: string }) {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const setFileContent = useStore((s) => s.setFileContent);
  const active = tabs.find((t) => t.path === activePath) ?? null;

  const source = active?.content ?? "";
  const blocks = useMemo(() => toBlocks(source), [source]);

  /** Tulis isi baru ke store (autosave ditangani store). */
  const commit = useCallback(
    (next: string) => {
      if (!active) return;
      setFileContent(active.path, next);
      const p = active.path;
      setTimeout(() => {
        void useStore.getState().saveFile(p).catch(() => {});
      }, 300);
    },
    [active, setFileContent],
  );

  if (!active) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-6", className)}>
        <p className="text-sm text-muted-foreground">Tidak ada file terbuka.</p>
      </div>
    );
  }

  if (!/\.tex$/i.test(active.path)) {
    return (
      <div className={cn("flex flex-1 items-center justify-center p-6", className)}>
        <p className="text-sm text-muted-foreground">
          Mode Visual hanya untuk file .tex. Gunakan mode Kode untuk file ini.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("min-h-0 flex-1 overflow-auto bg-background", className)}>
      <div className="mx-auto max-w-3xl px-6 py-6">
        <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90">
          Mode Visual menyunting paragraf, judul, daftar, dan gambar. Perintah
          LaTeX lain (tabel, rumus, lingkungan khusus) ditampilkan sebagai blok
          abu-abu dan tidak diubah — sunting lewat mode Kode.
        </p>

        {blocks.length === 0 && (
          <p className="text-sm text-muted-foreground">Dokumen kosong.</p>
        )}

        {blocks.map((b, i) => (
          <BlockView
            key={`${b.start}-${i}`}
            block={b}
            source={source}
            onCommit={commit}
          />
        ))}
      </div>
    </div>
  );
}

function BlockView({
  block,
  source,
  onCommit,
}: {
  block: Block;
  source: string;
  onCommit: (next: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const save = () => {
    const el = ref.current;
    if (!el) return;
    let latex = "";
    if (block.kind === "text") latex = paragraphFromHtml(el);
    else if (block.kind === "list") latex = listFromHtml(el);
    else if (block.kind === "heading") {
      const cmd = "section"; // dijaga: heading disunting lewat dialog, bukan di sini
      latex = headingFromHtml(el, cmd, block.starred);
    }
    if (!latex) return;
    onCommit(applyBlockEdit(source, block, latex));
    setEditing(false);
  };

  /* ------------------------------- heading ------------------------------- */
  if (block.kind === "heading") {
    const sizes = [
      "text-2xl font-bold",
      "text-xl font-bold",
      "text-lg font-bold",
      "text-base font-semibold",
      "text-sm font-semibold",
      "text-sm font-medium",
    ];
    return (
      <HeadingBlock
        block={block}
        source={source}
        onCommit={onCommit}
        className={sizes[block.level] ?? "text-base font-semibold"}
      />
    );
  }

  /* -------------------------------- list -------------------------------- */
  if (block.kind === "list") {
    return (
      <div className="group relative mb-3">
        <BlockToolbar onEdit={() => setEditing(true)} editing={editing} onSave={save} />
        <div
          ref={ref}
          contentEditable={editing}
          suppressContentEditableWarning
          className={cn(
            "rounded px-2 py-1 outline-none",
            editing && "bg-accent/30 ring-1 ring-primary",
          )}
        >
          {block.items.map((it, i) => (
            <div key={i} className="flex gap-2 text-sm leading-relaxed">
              <span className="shrink-0 text-muted-foreground">
                {block.ordered ? `${i + 1}.` : "•"}
              </span>
              <span dangerouslySetInnerHTML={{ __html: it }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* -------------------------------- image ------------------------------- */
  if (block.kind === "image") {
    return (
      <figure className="group relative mb-4 flex flex-col items-center">
        <BlockToolbar
          onEdit={() => setEditing(true)}
          editing={editing}
          onSave={save}
          extra={
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Hapus gambar dari dokumen"
              onClick={() => onCommit(applyBlockEdit(source, block, ""))}
            >
              <Trash2 className="size-3.5" />
            </Button>
          }
        />
        <ImageFromProject path={block.path} />
        <figcaption className="mt-1 font-mono text-[11px] text-muted-foreground">
          {block.path}
        </figcaption>
      </figure>
    );
  }

  /* --------------------------------- raw -------------------------------- */
  if (block.kind === "raw") {
    return (
      <pre className="mb-3 overflow-x-auto rounded border border-dashed bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
        {block.source.length > 400 ? block.source.slice(0, 400) + "\n…" : block.source}
      </pre>
    );
  }

  /* -------------------------------- text -------------------------------- */
  return (
    <div className="group relative mb-3">
      <BlockToolbar onEdit={() => setEditing(true)} editing={editing} onSave={save} />
      <div
        ref={ref}
        contentEditable={editing}
        suppressContentEditableWarning
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setEditing(false);
            // Kembalikan tampilan semula.
            if (ref.current) ref.current.innerHTML = block.html;
          }
        }}
        className={cn(
          "rounded px-2 py-1 text-sm leading-relaxed outline-none",
          editing && "bg-accent/30 ring-1 ring-primary",
        )}
        dangerouslySetInnerHTML={{ __html: block.html }}
      />
      {!editing && (
        <p className="mt-0.5 hidden px-2 font-mono text-[10px] text-muted-foreground group-hover:block">
          {block.source.length > 90 ? block.source.slice(0, 90) + "…" : block.source}
        </p>
      )}
    </div>
  );
}

function BlockToolbar({
  onEdit,
  editing,
  onSave,
  extra,
}: {
  onEdit: () => void;
  editing: boolean;
  onSave: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="absolute -top-1 right-0 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
      {extra}
      {editing ? (
        <Button size="sm" className="h-7 text-xs" onClick={onSave}>
          Simpan
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title="Sunting blok ini"
          onClick={onEdit}
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
    </div>
  );
}

/** Judul section — bisa diganti teksnya, level, dan nomor/bintang. */
function HeadingBlock({
  block,
  source,
  onCommit,
  className,
}: {
  block: Extract<Block, { kind: "heading" }>;
  source: string;
  onCommit: (next: string) => void;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(block.title);
  const [command, setCommand] = useState(
    ["part", "chapter", "section", "subsection", "subsubsection", "paragraph"][
      block.level
    ] ?? "section",
  );

  useEffect(() => {
    setTitle(block.title);
  }, [block.title]);

  const apply = () => {
    const latex = `\\${command}${block.starred ? "*" : ""}{${title.trim()}}`;
    onCommit(applyBlockEdit(source, block, latex));
    setOpen(false);
  };

  return (
    <>
      <div className="group relative flex items-center gap-2">
        <span className={cn("min-w-0 flex-1 truncate", className)}>{block.title}</span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7 opacity-0 group-hover:opacity-100"
          title="Ubah judul section"
          onClick={() => setOpen(true)}
        >
          <Pencil className="size-3.5" />
        </Button>
      </div>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-sm rounded-lg border bg-card p-4 shadow-xl">
            <p className="mb-3 text-sm font-semibold">Ubah judul section</p>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && apply()}
            />
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                ["part", "Bagian"],
                ["chapter", "Bab"],
                ["section", "Seksi"],
                ["subsection", "Sub-seksi"],
                ["subsubsection", "Sub-sub"],
                ["paragraph", "Paragraf"],
              ].map(([c, label]) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCommand(c)}
                  className={cn(
                    "rounded border px-2 py-1 text-[11px]",
                    command === c
                      ? "border-primary bg-primary/15 text-foreground"
                      : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button size="sm" onClick={apply} disabled={!title.trim()}>
                Simpan
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Tampilkan gambar dari project.
 *
 * Gambar diambil lewat API project (butuh cookie sesi), jadi memakai
 * `fetch` + object URL alih-alih `<img src>` langsung.
 */
function ImageFromProject({ path }: { path: string }) {
  const project = useStore((s) => s.project);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    if (!project) return;

    (async () => {
      try {
        const res = await fetch(
          `/api/projects/${project.id}/raw?path=${encodeURIComponent(path)}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const u = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        revoked = u;
        setUrl(u);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [project?.id, path]);

  if (failed) {
    return (
      <div className="flex h-24 w-full items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
        <ImageIcon className="mr-1.5 size-4" />
        Gambar tidak ditemukan: {path}
      </div>
    );
  }
  if (!url) {
    return (
      <div className="flex h-24 w-full items-center justify-center rounded border border-dashed text-xs text-muted-foreground">
        Memuat gambar…
      </div>
    );
  }
  return (
    <img
      src={url}
      alt={path}
      className="max-h-96 max-w-full rounded border object-contain"
    />
  );
}
