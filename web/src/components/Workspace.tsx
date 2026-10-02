import { useEffect } from "react";
import type { ServerEvent } from "@latex/shared";
import { useStore } from "../store";
import { useServerEvents } from "../hooks/useServerEvents";
import { Toolbar } from "./Toolbar";
import { FileTree } from "./FileTree";
import { EditorPane } from "./Editor";
import { PdfPreview } from "./PdfPreview";

export function Workspace({ projectId }: { projectId: string }) {
  const loadProject = useStore((s) => s.loadProject);
  const project = useStore((s) => s.project);
  const activePath = useStore((s) => s.activePath);

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

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <Toolbar />
      <div className="flex min-h-0 flex-1">
        <FileTree />
        <EditorPane />
        <PdfPreview />
      </div>
      <footer className="flex h-7 shrink-0 items-center gap-4 border-t bg-card px-3 text-[11px] text-muted-foreground">
        <span>{project ? `Root: ${project.rootFile}` : "…"}</span>
        <span>{activePath ? `Aktif: ${activePath}` : "Tidak ada file aktif"}</span>
        <span className="ml-auto hidden md:inline">
          Ctrl+S simpan &amp; compile · Klik PDF untuk lompat ke kode
        </span>
      </footer>
    </div>
  );
}
