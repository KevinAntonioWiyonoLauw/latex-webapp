import { useEffect, useRef, useState } from "react";
import { configurePdfWorker, loadPdfDocument } from "../lib/pdf";
import type { PDFDocumentProxy, PDFPageProxy } from "../lib/pdf";
import { ChevronLeft, ChevronRight, Minus, Plus, FileText } from "lucide-react";
import { useStore } from "../store";
import { api } from "../api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// Konfigurasi worker PDF.js (lokal + fallback CDN) ada di `lib/pdf.ts`.
configurePdfWorker();

interface PageMeta {
  width: number;
  height: number;
}

export function PdfPreview({ className }: { className?: string } = {}) {
  const project = useStore((s) => s.project);
  const pdfVersion = useStore((s) => s.pdfVersion);
  const result = useStore((s) => s.result);
  const syncTarget = useStore((s) => s.syncTarget);
  const compiling = useStore((s) => s.compiling);

  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const docRef = useRef<PDFDocumentProxy | null>(null);
  const pagesRef = useRef<Map<number, PDFPageProxy>>(new Map());
  const metaRef = useRef<PageMeta[]>([]);

  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.3);
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [docReady, setDocReady] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const canRender = pdfVersion > 0 || result?.hasPdf;
  const hasPages = numPages > 0;

  /* ------------------------- load document ------------------------- */
  useEffect(() => {
    if (!project || !canRender) return;
    let cancelled = false;
    setLoading(true);
    setNumPages(0);
    setError(null);

    docRef.current?.destroy();
    docRef.current = null;
    pagesRef.current.clear();
    metaRef.current = [];
    canvasRefs.current.clear();

    const task = loadPdfDocument({
      url: api.pdfUrl(project.id, pdfVersion),
      withCredentials: false,
    });

    task
      .then(async (doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        const metas: PageMeta[] = [];
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          pagesRef.current.set(n, page);
          const vp = page.getViewport({ scale: 1 });
          metas.push({ width: vp.width, height: vp.height });
        }
        metaRef.current = metas;
        setNumPages(doc.numPages);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        // Jangan telan error: kalau PDF gagal dimuat (mis. worker ditolak
        // karena MIME salah), tampilkan supaya tidak jadi panel kosong misterius.
        const msg = e instanceof Error ? e.message : String(e);
        console.error("[pdf] gagal memuat dokumen:", e);
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [project?.id, pdfVersion, canRender]);

  /* -------------------- render canvases (scale) -------------------- */
  useEffect(() => {
    if (numPages <= 0) return;
    let cancelled = false;
    const run = async () => {
      const doc = docRef.current;
      if (!doc) return;
      for (let n = 1; n <= doc.numPages; n++) {
        if (cancelled) return;
        const page = pagesRef.current.get(n);
        const canvas = canvasRefs.current.get(n);
        if (!page || !canvas) continue;
        const viewport = page.getViewport({ scale });
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const ctx = canvas.getContext("2d");
        if (!ctx) continue;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        try {
          await page.render({ canvasContext: ctx, viewport }).promise;
        } catch (e) {
          // Render bisa dibatalkan saat scale berubah (normal) — hanya
          // laporkan bila benar-benar bukan pembatalan.
          if (!cancelled) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!/cancel/i.test(msg)) console.error("[pdf] gagal render halaman:", e);
          }
        }
      }
      if (!cancelled) setDocReady((v) => v + 1);
    };
    const t = setTimeout(() => void run(), 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [numPages, scale]);

  /* --------------------- klik PDF -> source ------------------------ */
  const onClickPage = async (ev: React.MouseEvent, pageNum: number) => {
    if (!project) return;
    const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    const xBp = (ev.clientX - rect.left) / scale;
    const yBp = (ev.clientY - rect.top) / scale;
    try {
      const res = await api.synctexEdit(project.id, pageNum, xBp, yBp);
      useStore.getState().jumpToSource(res.file, res.line);
    } catch {
      /* tidak ada source cocok */
    }
  };

  /* ------------------ source -> PDF highlight ---------------------- */
  useEffect(() => {
    if (!project || !syncTarget || !docRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        const v = await api.synctexView(project.id, syncTarget.path, syncTarget.line);
        if (cancelled) return;
        const pageEl = scrollRef.current?.querySelector<HTMLElement>(
          `[data-page="${v.page}"]`,
        );
        if (!pageEl) return;
        pageEl.querySelector(".sync-highlight")?.remove();
        const el = document.createElement("div");
        el.className = "sync-highlight";
        el.style.left = `${v.x * scale}px`;
        el.style.top = `${v.y * scale}px`;
        el.style.width = `${Math.max(v.width * scale, 20)}px`;
        el.style.height = `${Math.max(v.height * scale, 8)}px`;
        pageEl.appendChild(el);
        pageEl.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => el.remove(), 2500);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncTarget?.nonce, scale]);

  /* ------------------------ scroll tracking ------------------------ */
  const onScroll = () => {
    const container = scrollRef.current;
    if (!container) return;
    const mid = container.scrollTop + container.clientHeight / 3;
    let acc = 0;
    for (let i = 0; i < metaRef.current.length; i++) {
      const pageEl = container.querySelector<HTMLElement>(`[data-page="${i + 1}"]`);
      const h = pageEl?.offsetHeight ?? metaRef.current[i].height * scale;
      if (mid < acc + h) {
        setCurrentPage(i + 1);
        return;
      }
      acc += h + 16;
    }
  };

  const scrollToPage = (n: number) => {
    const pageEl = scrollRef.current?.querySelector<HTMLElement>(`[data-page="${n}"]`);
    pageEl?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section className={cn("flex min-w-0 flex-col bg-muted/30", className)}>
      <div className="flex h-10 shrink-0 items-center gap-1.5 border-b bg-card px-2">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => scrollToPage(Math.max(1, currentPage - 1))}
          disabled={currentPage <= 1}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-14 text-center text-xs text-muted-foreground tabular-nums">
          {hasPages ? `${currentPage} / ${numPages}` : "—"}
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => scrollToPage(Math.min(numPages, currentPage + 1))}
          disabled={currentPage >= numPages}
        >
          <ChevronRight className="size-4" />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          {compiling && (
            <span className="mr-1 flex items-center gap-1.5 text-[11px] text-amber-400">
              <Spinner className="size-3" />
              compiling
            </span>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setScale((s) => Math.max(0.5, s - 0.2))}
          >
            <Minus className="size-4" />
          </Button>
          <span className="min-w-11 text-center text-xs text-muted-foreground tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          >
            <Plus className="size-4" />
          </Button>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div
          ref={scrollRef}
          onScroll={onScroll}
          className="h-full overflow-auto"
        >
          <div
            className={`flex flex-col items-center gap-4 p-4 ${
              hasPages && docReady > 0 && !loading ? "pdf-enter" : ""
            }`}
          >
            {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => {
              const meta = metaRef.current[n - 1];
              const w = (meta?.width ?? 595) * scale;
              const h = (meta?.height ?? 842) * scale;
              return (
                <div
                  key={n}
                  className="pdf-page"
                  data-page={n}
                  style={{ width: w, height: h }}
                  onClick={(e) => void onClickPage(e, n)}
                >
                  <canvas
                    ref={(el) => {
                      if (el) canvasRefs.current.set(n, el);
                      else canvasRefs.current.delete(n);
                    }}
                  />
                </div>
              );
            })}

            {error && !loading && (
              <div className="flex flex-col items-center gap-2 px-6 py-20 text-center">
                <FileText className="size-8 text-destructive opacity-70" />
                <p className="text-sm font-medium text-destructive">
                  Gagal memuat preview PDF
                </p>
                <p className="max-w-md text-xs text-muted-foreground">{error}</p>
              </div>
            )}

            {!canRender && !compiling && !loading && !error && (
              <div className="flex flex-col items-center gap-2 px-6 py-20 text-center text-muted-foreground">
                <FileText className="size-8 opacity-50" />
                <p className="text-sm">
                  Preview PDF akan muncul setelah compile berhasil.
                </p>
              </div>
            )}
          </div>
        </div>

        {(compiling || loading) && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-xs">
            <Spinner className="size-8 text-primary" />
            <p className="text-xs text-muted-foreground">
              {compiling ? "Meng-compile dokumen…" : "Memuat PDF…"}
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
