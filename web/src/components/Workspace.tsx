import { useEffect, useState } from "react";
import type { ServerEvent } from "@latex/shared";
import { Menu, X } from "lucide-react";
import { useStore } from "../store";
import { useServerEvents } from "../hooks/useServerEvents";
import { Toolbar } from "./Toolbar";
import { FileTree } from "./FileTree";
import { OutlinePanel } from "./OutlinePanel";
import { EditorPane } from "./Editor";
import { PdfPreview } from "./PdfPreview";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Tata letak workspace.
 *
 * - Desktop (>= lg): tiga kolom berdampingan — file, editor, PDF.
 * - Tablet (md..lg): file tree + editor, PDF disembunyikan agar editor lega.
 * - Mobile (< md): satu panel penuh pada satu waktu (file / editor / PDF),
 *   dipilih lewat segmented control di bawah toolbar. File tree tampil sebagai
 *   drawer overlay agar tidak memakan lebar layar.
 */
type MobileView = "files" | "editor" | "pdf";

export function Workspace({ projectId }: { projectId: string }) {
  const loadProject = useStore((s) => s.loadProject);
  const project = useStore((s) => s.project);
  const activePath = useStore((s) => s.activePath);
  const [view, setView] = useState<MobileView>("editor");
  const [treeOpen, setTreeOpen] = useState(false);

  useEffect(() => {
    void loadProject(projectId).catch((e) => {
      alert("Gagal memuat project: " + (e as Error).message);
      location.hash = "";
    });
  }, [projectId, loadProject]);

  useServerEvents(projectId, (e: ServerEvent) => {
    const st = useStore.getState();
    switch (e.type) {
      case "compile:started":
        st.onCompileStarted();
        break;
      case "compile:log":
        st.onCompileLog(e.entry);
        break;
      case "compile:finished":
        st.onCompileFinished(e.result);
        if (e.result.status === "success") {
          void st.refreshTree();
        }
        break;
      default:
        break;
    }
  });

  // Saat memilih file di mobile, langsung tampilkan editor.
  useEffect(() => {
    if (!activePath) return;
    if (window.matchMedia("(max-width: 767px)").matches) {
      setView("editor");
      setTreeOpen(false);
    }
  }, [activePath]);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Toolbar />

      {/* Pemilih panel: hanya di mobile. */}
      <div className="flex shrink-0 items-center gap-1 border-b bg-card px-2 py-1.5 md:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          title="Buka daftar file"
          onClick={() => setTreeOpen(true)}
        >
          <Menu className="size-4" />
        </Button>
        <div className="ml-auto flex items-center gap-1 rounded-md bg-muted p-0.5">
          {(["files", "editor", "pdf"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                view === v
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {v === "files" ? "File" : v === "editor" ? "Kode" : "PDF"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* File tree + outline — kolom tetap di >= md, drawer overlay di mobile. */}
        <div
          className={cn(
            "min-h-0 shrink-0 flex-col",
            view === "files" ? "flex w-full md:w-60" : "hidden md:flex md:w-60",
          )}
        >
          <FileTree className="w-full min-h-0 flex-1 border-r-0" />
          <OutlinePanel className="w-full shrink-0" />
        </div>

        {/* Drawer file tree khusus mobile. */}
        {treeOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setTreeOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-card shadow-xl">
              <div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
                <span className="pl-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                  Files
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  onClick={() => setTreeOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <FileTree className="w-full" hideHeader />
            </div>
          </div>
        )}

        {/* Editor — selalu tampil di >= md; di mobile sesuai pilihan. */}
        <div
          className={cn(
            "min-w-0 flex-1",
            view === "editor" ? "flex" : "hidden md:flex",
          )}
        >
          <EditorPane />
        </div>

        {/* PDF — disembunyikan di < lg agar editor lega; di mobile lewat tab. */}
        <div
          className={cn(
            "min-w-0 lg:flex lg:w-[46%]",
            view === "pdf" ? "flex w-full" : "hidden",
          )}
        >
          <PdfPreview className="w-full" />
        </div>
      </div>

      <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-card px-3 text-[11px] text-muted-foreground">
        <span className="truncate">{project ? `Root: ${project.rootFile}` : "…"}</span>
        <span className="hidden truncate sm:inline">
          {activePath ? `Aktif: ${activePath}` : "Tidak ada file aktif"}
        </span>
        <span className="ml-auto hidden shrink-0 md:inline">
          Ctrl+S simpan &amp; compile · Klik PDF untuk lompat ke kode
        </span>
      </footer>
    </div>
  );
}
