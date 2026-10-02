import { useEffect, useMemo, useRef, useState } from "react";
import { ListTree, Search, X } from "lucide-react";
import { useStore } from "../store";
import {
  parseOutline,
  OUTLINE_LABEL,
  OUTLINE_COLOR,
  type OutlineItem,
} from "../latexOutline";
import { revealLine } from "../monaco-bridge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

/**
 * Panel "Outline" — daftar section/subsection dokumen yang sedang dibuka.
 *
 * Tujuan: memudahkan navigasi dokumen panjang tanpa harus menggulir kode.
 * Klik satu entri -> editor melompat ke baris perintah tersebut.
 *
 * Hanya untuk file .tex; untuk file lain panel menampilkan keterangan singkat.
 */
export function OutlinePanel({ className }: { className?: string }) {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const active = tabs.find((t) => t.path === activePath) ?? null;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(true);
  const listRef = useRef<HTMLDivElement>(null);

  const isTex = !!active && /\.(tex|sty|cls)$/i.test(active.path);

  // Parse ulang saat isi dokumen berubah.
  const items: OutlineItem[] = useMemo(() => {
    if (!active || !isTex) return [];
    return parseOutline(active.content);
  }, [active?.path, active?.content, isTex]);

  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((i) => i.title.toLowerCase().includes(q) || i.command.includes(q))
    : items;

  // Saat ganti file, reset pencarian.
  useEffect(() => {
    setQuery("");
  }, [activePath]);

  const jump = (it: OutlineItem) => {
    if (!revealLine(it.line)) return;
    // Sorot baris sebentar supaya jelas.
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-line="${it.line}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  };

  return (
    <section className={cn("flex flex-col border-t bg-card", className)}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-8 shrink-0 items-center gap-1.5 border-b px-2.5 text-left hover:bg-accent/50"
        title={open ? "Sembunyikan outline" : "Tampilkan outline"}
      >
        <ListTree className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          Outline
        </span>
        {isTex && items.length > 0 && (
          <span className="ml-1 rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
            {items.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Pencarian section */}
          {isTex && items.length > 4 && (
            <div className="relative shrink-0 border-b p-1.5">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari section…"
                className="h-7 pl-7 text-xs"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery("")}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent"
                >
                  <X className="size-3" />
                </button>
              )}
            </div>
          )}

          <ScrollArea className="h-44">
            <div ref={listRef} className="p-1.5">
              {!active && (
                <p className="p-2 text-xs text-muted-foreground">
                  Tidak ada file aktif.
                </p>
              )}

              {active && !isTex && (
                <p className="p-2 text-xs text-muted-foreground">
                  Outline hanya untuk file .tex.
                </p>
              )}

              {isTex && items.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">
                  Belum ada section. Tambahkan mis.{" "}
                  <code className="rounded bg-muted px-1">\section&#123;…&#125;</code>.
                </p>
              )}

              {isTex && items.length > 0 && shown.length === 0 && (
                <p className="p-2 text-xs text-muted-foreground">
                  Tidak ada yang cocok.
                </p>
              )}

              {shown.map((it, idx) => (
                <button
                  key={`${it.line}-${idx}`}
                  type="button"
                  data-line={it.line}
                  onClick={() => jump(it)}
                  title={`${OUTLINE_LABEL[it.command] ?? it.command} — baris ${it.line}`}
                  className={cn(
                    "group flex w-full items-center gap-1.5 rounded-md py-1 pr-2 text-left text-[12px]",
                    "hover:bg-accent hover:text-accent-foreground",
                  )}
                  style={{ paddingLeft: 6 + it.level * 10 }}
                >
                  <span
                    className={cn(
                      "shrink-0 text-[10px] font-semibold",
                      OUTLINE_COLOR[it.level] ?? "text-muted-foreground",
                    )}
                  >
                    {it.starred ? "★" : "§"}
                  </span>
                  <span className="truncate">{it.title}</span>
                  <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100">
                    {it.line}
                  </span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </>
      )}
    </section>
  );
}
