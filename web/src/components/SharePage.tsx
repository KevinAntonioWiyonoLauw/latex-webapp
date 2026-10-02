import { useEffect, useRef, useState } from "react";
import type { FileNode } from "@latex/shared";
import * as pdfjsLib from "pdfjs-dist";
import MonacoEditor from "@monaco-editor/react";
import { ArrowLeft, ChevronRight, FileCode2, FileText, Folder } from "lucide-react";
import { api } from "@/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

// Worker PDF.js (sama seperti PdfPreview).
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

interface ShareMeta {
  id: string;
  name: string;
  rootFile: string;
  outputVersion: number;
  hasPdf: boolean;
  updatedAt: number;
}

function flattenTree(
  nodes: FileNode[],
  depth = 0,
): { node: FileNode; depth: number }[] {
  const out: { node: FileNode; depth: number }[] = [];
  for (const n of nodes) {
    out.push({ node: n, depth });
    if (n.type === "dir" && n.children) {
      out.push(...flattenTree(n.children, depth + 1));
    }
  }
  return out;
}

export function SharePage({ token }: { token: string }) {
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [role, setRole] = useState<string>("viewer");
  const [tree, setTree] = useState<FileNode[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await api.shareMeta(token);
        setMeta(res.project);
        setRole(res.role);
        const t = await api.shareTree(token);
        setTree(t);
        const root = res.project.rootFile;
        const c = await api.shareReadFile(token, root);
        setContent(c);
        setActivePath(root);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const openFile = async (path: string) => {
    try {
      const c = await api.shareReadFile(token, path);
      setContent(c);
      setActivePath(path);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (error || !meta) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center gap-3 bg-background p-6 text-center">
        <FileCode2 className="size-10 text-muted-foreground" />
        <h1 className="text-lg font-semibold">Tidak bisa membuka project</h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {error ?? "Link tidak valid atau sudah kedaluwarsa."}
        </p>
        <Button variant="outline" onClick={() => (location.hash = "")}>
          <ArrowLeft /> Kembali
        </Button>
      </div>
    );
  }

  const files = flattenTree(tree);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3">
        <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <FileCode2 className="size-4" />
        </div>
        <span className="font-semibold">{meta.name}</span>
        <Badge variant="secondary" className="gap-1">
          {role === "editor" ? "Editor" : "Hanya lihat"}
        </Badge>
        <span className="ml-auto text-xs text-muted-foreground">
          Dibagikan via link
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* File list — di mobile disembunyikan agar editor/PDF lega. */}
        <aside className="hidden w-56 shrink-0 overflow-auto border-r bg-card py-1.5 md:block">
          <p className="px-3 pb-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Files
          </p>
          {files.map(({ node, depth }) => {
            const Icon =
              node.type === "dir"
                ? Folder
                : node.name.endsWith(".tex")
                  ? FileCode2
                  : FileText;
            return (
              <button
                key={node.path}
                type="button"
                onClick={() => node.type === "file" && openFile(node.path)}
                disabled={node.type === "dir"}
                className={cn(
                  "flex w-full items-center gap-1.5 px-2 py-1 text-left text-[13px]",
                  "hover:bg-accent hover:text-accent-foreground",
                  node.path === activePath &&
                    "bg-accent text-accent-foreground",
                )}
                style={{ marginLeft: depth * 10 }}
              >
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{node.name}</span>
              </button>
            );
          })}
        </aside>

        {/* Editor (readonly) */}
        <div className="flex min-w-0 flex-1 flex-col border-r">
          <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-card px-3 text-xs text-muted-foreground">
            {activePath ?? "—"}
            <ChevronRight className="size-3" />
            <span>read-only</span>
          </div>
          <div className="min-h-0 flex-1">
            <MonacoEditor
              height="100%"
              theme="vs-dark"
              language="latex"
              path={activePath ?? "main.tex"}
              value={content}
              options={{
                readOnly: true,
                fontSize: 13,
                minimap: { enabled: false },
                wordWrap: "on",
                scrollBeyondLastLine: false,
                automaticLayout: true,
              }}
            />
          </div>
        </div>

        {/* PDF */}
        <SharePdf token={token} version={meta.outputVersion} hasPdf={meta.hasPdf} />
      </div>
    </div>
  );
}

function SharePdf({
  token,
  version,
  hasPdf,
}: {
  token: string;
  version: number;
  hasPdf: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const [numPages, setNumPages] = useState(0);
  const [scale] = useState(1.3);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasPdf && version === 0) return;
    let cancelled = false;
    setLoading(true);
    const task = pdfjsLib.getDocument({
      url: api.sharePdfUrl(token, version),
      withCredentials: false,
    });
    task.promise
      .then(async (doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        setNumPages(doc.numPages);
        // render
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          // tunggu canvas ter-mount
          await new Promise((r) => setTimeout(r, 0));
          const canvas = canvasRefs.current.get(n);
          if (canvas) {
            const viewport = page.getViewport({ scale });
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext("2d");
            if (ctx)
              await page.render({ canvasContext: ctx, viewport }).promise.catch(
                () => {},
              );
          }
        }
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [token, version, hasPdf, scale]);

  return (
    <section className="flex min-w-0 flex-col bg-muted/30 md:w-[46%]">
      <div ref={scrollRef} className="h-full w-full overflow-auto p-4">
        {!hasPdf && (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Belum ada PDF hasil compile.
          </div>
        )}
        {loading && numPages === 0 && (
          <div className="flex h-full items-center justify-center">
            <Spinner className="size-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex flex-col items-center gap-4">
          {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
            <div
              key={n}
              className="bg-white shadow-[0_2px_12px_rgba(0,0,0,0.5)]"
              style={{ width: 595 * scale, minHeight: 842 * scale }}
            >
              <canvas
                ref={(el) => {
                  if (el) canvasRefs.current.set(n, el);
                  else canvasRefs.current.delete(n);
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
