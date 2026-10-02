import { useStore } from "../store";
import { api } from "../api";
import { navigate } from "../App";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { UserMenu } from "./UserMenu";
import { ShareDialog } from "./ShareDialog";
import { SettingsDialog } from "./SettingsDialog";
import { HistoryDialog } from "./HistoryDialog";
import { SearchDialog } from "./SearchDialog";
import { BibDialog } from "./BibDialog";
import { insertAtCursor } from "../monaco-bridge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  ChevronLeft,
  Download,
  FileArchive,
  FileDown,
  Play,
  Rocket,
  CheckCircle2,
  XCircle,
  CircleDashed,
  Square,
} from "lucide-react";

export function Toolbar() {
  const project = useStore((s) => s.project);
  const compiling = useStore((s) => s.compiling);
  const result = useStore((s) => s.result);
  const compile = useStore((s) => s.compile);

  const status = compiling
    ? { variant: "secondary" as const, icon: <Spinner className="size-3" />, label: "Compiling…" }
    : result?.status === "success"
      ? { variant: "outline" as const, icon: <CheckCircle2 className="size-3 text-emerald-400" />, label: "Sukses" }
      : result?.status === "error"
        ? { variant: "destructive" as const, icon: <XCircle className="size-3" />, label: "Error" }
        : { variant: "secondary" as const, icon: <CircleDashed className="size-3" />, label: "Belum compile" };

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b bg-card px-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ChevronLeft />
            <span className="hidden sm:inline">Projects</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Kembali ke daftar project</TooltipContent>
      </Tooltip>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold">{project?.name ?? "…"}</span>
        <Badge variant={status.variant} className="gap-1 whitespace-nowrap">
          {status.icon}
          {status.label}
        </Badge>
      </div>

      <div className="ml-auto flex items-center gap-1.5">
        {project && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <FileArchive />
                        <span className="hidden lg:inline">Export</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() =>
                          window.open(api.exportUrl(project.id), "_blank")
                        }
                      >
                        <FileArchive />
                        Project (.zip)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          window.open(
                            api.pandocExportUrl(project.id, "docx"),
                            "_blank",
                          )
                        }
                      >
                        <FileDown />
                        Word (.docx)
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() =>
                          window.open(
                            api.pandocExportUrl(project.id, "html"),
                            "_blank",
                          )
                        }
                      >
                        <FileDown />
                        HTML
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TooltipTrigger>
              <TooltipContent>Export project / dokumen</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <a href={api.downloadPdfUrl(project.id)} download>
                  <Button variant="outline" size="sm" disabled={!result?.hasPdf}>
                    <Download />
                    <span className="hidden lg:inline">PDF</span>
                  </Button>
                </a>
              </TooltipTrigger>
              <TooltipContent>Unduh hasil PDF</TooltipContent>
            </Tooltip>

            <ShareDialog projectId={project.id} />

            <HistoryDialog
              projectId={project.id}
              onRestored={() => {
                void useStore.getState().refreshTree();
                const active = useStore.getState().activePath;
                if (active) void useStore.getState().openFile(active);
              }}
            />

            <SearchDialog projectId={project.id} />

            <BibDialog
              projectId={project.id}
              onCite={(key) => insertAtCursor(`\\cite{${key}}`)}
            />

            {compiling ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => void useStore.getState().cancelCompile()}
                className="gap-1.5"
              >
                <Square className="size-3.5" />
                <span className="hidden sm:inline">Stop</span>
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void compile()}
                className="gap-1.5"
              >
                <Play className="size-3.5" />
                <span className="hidden sm:inline">Recompile</span>
                <Rocket className="size-3.5 sm:hidden" />
              </Button>
            )}
          </>
        )}
        <SettingsDialog />
        <UserMenu onSignedOut={() => navigate("/")} />
      </div>
    </header>
  );
}
