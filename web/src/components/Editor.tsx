import { useCallback, useEffect, useRef, useState } from "react";
import MonacoEditor, { type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditorNs } from "monaco-editor";
import type { LogEntry } from "@latex/shared";
import { toast } from "sonner";
import {
  X,
  Circle,
  AlertCircle,
  AlertTriangle,
  Info,
  Loader2,
  Users,
  WifiOff,
} from "lucide-react";
import { useStore } from "../store";
import { useSettings } from "../store/settings";
import { useSession } from "../auth/client";
import { createCollab, colorForUser, type CollabHandle } from "../hooks/useCollab";
import { setCompletionContext } from "../monaco";
import { setActiveEditor } from "../monaco-bridge";
import { countWords, extractLabels, extractBibKeys } from "../latexLanguage";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function langFor(path: string): string {
  if (
    path.endsWith(".tex") ||
    path.endsWith(".sty") ||
    path.endsWith(".cls") ||
    path.endsWith(".def")
  )
    return "latex";
  if (path.endsWith(".bib")) return "bibtex";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  return "plaintext";
}

export function EditorPane() {
  const tabs = useStore((s) => s.tabs);
  const activePath = useStore((s) => s.activePath);
  const setActive = useStore((s) => s.setActive);
  const closeTab = useStore((s) => s.closeTab);
  const setFileContent = useStore((s) => s.setFileContent);
  const compile = useStore((s) => s.compile);
  const project = useStore((s) => s.project);
  const { data: session } = useSession();
  const settings = useSettings();

  const active = tabs.find((t) => t.path === activePath) ?? null;
  const editorRef = useRef<MonacoEditorNs.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof import("monaco-editor") | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoCompileTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const collabRef = useRef<CollabHandle | null>(null);

  const [collabStatus, setCollabStatus] = useState<string>("disconnected");
  const [collabUsers, setCollabUsers] = useState<
    { name: string; color: string; clientId: number }[]
  >([]);
  const [wordCount, setWordCount] = useState(0);

  /** Putuskan binding collab aktif (mis. saat ganti file / unmount). */
  const teardownCollab = useCallback(() => {
    collabRef.current?.destroy();
    collabRef.current = null;
    setCollabStatus("disconnected");
    setCollabUsers([]);
  }, []);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco as unknown as typeof import("monaco-editor");
    setActiveEditor(editor);
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      const p = useStore.getState().activePath;
      if (p) void useStore.getState().saveFile(p).then(() => compile());
    });
  };

  /** Bangun koneksi collab untuk file yang sedang aktif. */
  const startCollab = useCallback(
    (path: string) => {
      const ed = editorRef.current;
      const mc = monacoRef.current;
      if (!ed || !mc || !project) return;
      // Hindari koneksi ganda ke doc yang sama.
      if (collabRef.current) return;

      const userName = session?.user?.name ?? "Anonim";
      try {
        collabRef.current = createCollab({
          projectId: project.id,
          file: path,
          editor: ed,
          monaco: mc,
          user: { name: userName, color: colorForUser(userName) },
          onStatus: (s) => setCollabStatus(s),
          onAwareness: (users) => setCollabUsers(users),
        });
      } catch (e) {
        toast.error("Gagal menyambung kolaborasi", {
          description: (e as Error).message,
        });
      }
    },
    [project, session],
  );

  // Ganti file -> putuskan collab lama & sambung ke file baru.
  useEffect(() => {
    teardownCollab();
    editorRef.current?.setScrollTop(0);
    // Hitung kata untuk file aktif.
    setWordCount(active ? countWords(active.content) : 0);
    if (
      settings.collabEnabled &&
      activePath &&
      project &&
      editorRef.current
    ) {
      const t = setTimeout(() => startCollab(activePath), 150);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePath, project?.id, settings.collabEnabled]);

  // Bersihkan saat komponen dibongkar.
  useEffect(
    () => () => {
      teardownCollab();
      setActiveEditor(null);
    },
    [teardownCollab],
  );

  // Perbarui context completion (label & bib key) dari semua tab.
  useEffect(() => {
    const labels: string[] = [];
    const bibKeys: string[] = [];
    for (const t of tabs) {
      if (t.path.endsWith(".bib")) bibKeys.push(...extractBibKeys(t.content));
      else labels.push(...extractLabels(t.content));
    }
    setCompletionContext({ labels, bibKeys });
  }, [tabs]);

  // Sinkronkan konten tab -> editor Monaco.
  //
  // Monaco dipasang dengan `defaultValue` (uncontrolled), jadi perubahan pada
  // store TIDAK otomatis tampil di editor. Diperlukan agar self-heal bekerja:
  // ketika server menolak menyimpan konten kosong, store memuat ulang isi dari
  // server, dan efek ini menampilkannya kembali di editor.
  useEffect(() => {
    if (!active) return;
    // Saat kolaborasi aktif, isi dokumen dikelola Y.Doc (MonacoBinding).
    if (collabRef.current) return;
    const model = editorRef.current?.getModel();
    if (!model) return;
    if (model.getValue() !== active.content) {
      model.setValue(active.content);
    }
  }, [active?.path, active?.content]);

  const onChange = (value: string | undefined) => {
    if (value === undefined) return;
    setWordCount(countWords(value));
    if (active) {
      const labels = extractLabels(value);
      const bibKeys = active.path.endsWith(".bib")
        ? extractBibKeys(value)
        : [];
      if (labels.length || bibKeys.length)
        setCompletionContext({ labels, bibKeys });
    }
    // Saat collab aktif, konten dikelola Y.Doc (server yang menyimpan).
    if (collabRef.current) return;
    if (!active) return;
    setFileContent(active.path, value);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const path = active.path;
    saveTimer.current = setTimeout(() => {
      void useStore.getState().saveFile(path).catch(() => {});
    }, 800);

    // Auto-compile (debounce) bila diaktifkan.
    if (settings.autoCompile) {
      if (autoCompileTimer.current) clearTimeout(autoCompileTimer.current);
      autoCompileTimer.current = setTimeout(() => {
        void useStore
          .getState()
          .saveFile(path)
          .then(() => compile())
          .catch(() => {});
      }, settings.autoCompileDelay);
    }
  };

  /** Tangani drop file (gambar) ke editor. */
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!project) return;
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const uploads = imageFiles.length ? imageFiles : files;
    try {
      await useStore.getState().uploadFiles(uploads, "images");
      const ed = editorRef.current;
      if (ed) {
        const snippet = uploads
          .filter((f) => f.type.startsWith("image/"))
          .map(
            (f) =>
              `\\includegraphics[width=0.8\\textwidth]{images/${f.name}}`,
          )
          .join("\n");
        if (snippet) {
          const pos = ed.getPosition();
          if (pos) ed.executeEdits("drop", [{ range: {
            startLineNumber: pos.lineNumber,
            startColumn: pos.column,
            endLineNumber: pos.lineNumber,
            endColumn: pos.column,
          }, text: snippet }]);
        }
      }
      toast.success(`${uploads.length} file di-upload ke images/`);
    } catch (err) {
      toast.error("Gagal upload file", { description: (err as Error).message });
    }
  };

  const collabActive =
    collabStatus === "connected" || collabStatus === "connecting";
  const others = collabUsers;
  const theme = settings.theme === "light" ? "light" : "vs-dark";

  return (
    <div className="flex min-w-0 flex-1 flex-col border-r">
      {/* Tab bar */}
      <div className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b bg-card">
        {tabs.length === 0 && (
          <div className="flex items-center px-3 text-xs text-muted-foreground">
            Tidak ada file terbuka
          </div>
        )}
        {tabs.map((t) => (
          <div
            key={t.path}
            role="button"
            tabIndex={0}
            onClick={() => setActive(t.path)}
            onKeyDown={(e) => e.key === "Enter" && setActive(t.path)}
            className={cn(
              "group flex cursor-pointer items-center gap-1.5 border-r px-3 text-xs whitespace-nowrap",
              "hover:bg-accent/50",
              t.path === activePath
                ? "bg-background text-foreground shadow-[inset_0_-2px_0_0_var(--primary)]"
                : "text-muted-foreground",
            )}
          >
            <span>{t.path.split("/").pop()}</span>
            {t.saving ? (
              <Loader2 className="size-3 animate-spin text-muted-foreground" />
            ) : (
              t.dirty && <Circle className="size-2 fill-current text-amber-400" />
            )}
            <button
              type="button"
              className="ml-0.5 rounded p-0.5 opacity-0 hover:bg-accent group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                closeTab(t.path);
              }}
            >
              <X className="size-3" />
            </button>
          </div>
        ))}

        {/* Status kolaborasi */}
        <div className="ml-auto flex items-center gap-2 pr-2">
          <CollabIndicator status={collabStatus} users={others} active={collabActive} />
        </div>
      </div>

      {/* Editor */}
      <div
        className="relative min-h-0 flex-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {active ? (
          <MonacoEditor
            height="100%"
            theme={theme}
            language={langFor(active.path)}
            path={active.path}
            defaultValue={active.content}
            onChange={onChange}
            onMount={onMount}
            options={{
              fontSize: settings.fontSize,
              minimap: { enabled: settings.minimap },
              wordWrap: settings.wordWrap ? "on" : "off",
              lineNumbers: settings.lineNumbers ? "on" : "off",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: settings.tabSize,
              renderWhitespace: "selection",
              quickSuggestions: { other: true, comments: false, strings: false },
              suggestOnTriggerCharacters: true,
              snippetSuggestions: "inline",
            }}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Pilih file untuk mulai mengedit
          </div>
        )}
      </div>

      {/* Status bar editor: word count + status kolaborasi */}
      <div className="flex h-6 shrink-0 items-center gap-3 border-t bg-card px-3 text-[11px] text-muted-foreground">
        <span>{wordCount} kata</span>
        <span className="text-muted-foreground/50">·</span>
        <span>{active ? active.path : "—"}</span>
        {settings.autoCompile && (
          <span className="flex items-center gap-1 text-emerald-400">
            <Circle className="size-2 fill-current" /> auto-compile
          </span>
        )}
      </div>

      <LogPanel />
    </div>
  );
}

/* --------------------------- Collab indicator --------------------------- */

function CollabIndicator({
  status,
  users,
  active,
}: {
  status: string;
  users: { name: string; color: string; clientId: number }[];
  active: boolean;
}) {
  const connected = status === "connected";
  const connecting = status === "connecting";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1.5">
          {/* Avatar presence */}
          <div className="flex -space-x-1.5">
            {users.slice(0, 4).map((u, i) => (
              <div
                key={`${u.clientId}-${i}`}
                className="flex size-5 items-center justify-center rounded-full border border-card text-[9px] font-bold text-white"
                style={{ backgroundColor: u.color }}
                title={u.name}
              >
                {u.name.slice(0, 1).toUpperCase()}
              </div>
            ))}
          </div>
          {connecting ? (
            <Loader2 className="size-3.5 animate-spin text-amber-400" />
          ) : connected ? (
            <Users className="size-3.5 text-emerald-400" />
          ) : (
            <WifiOff className="size-3.5 text-muted-foreground" />
          )}
        </div>
      </TooltipTrigger>
      <TooltipContent>
        {connected
          ? `Kolaborasi aktif — ${users.length} online`
          : connecting
            ? "Menyambung kolaborasi…"
            : active
              ? "Kolaborasi terputus"
              : "Kolaborasi nonaktif"}
      </TooltipContent>
    </Tooltip>
  );
}

/* ------------------------------ Log Panel ------------------------------ */

const levelIcon = {
  error: <AlertCircle className="size-3.5 shrink-0 text-red-400" />,
  warning: <AlertTriangle className="size-3.5 shrink-0 text-amber-400" />,
  info: <Info className="size-3.5 shrink-0 text-muted-foreground" />,
} as const;

function LogPanel() {
  const result = useStore((s) => s.result);
  const compiling = useStore((s) => s.compiling);
  const openFile = useStore((s) => s.openFile);
  const [filter, setFilter] = useState("all");

  const logs = (result?.logs ?? []).filter(
    (l) => filter === "all" || l.level === filter,
  );
  const errors = result?.logs.filter((l) => l.level === "error").length ?? 0;
  const warnings = result?.logs.filter((l) => l.level === "warning").length ?? 0;

  const openLog = (l: LogEntry) => {
    if (l.file) {
      const base = l.file.split(/[\\/]/).pop() ?? l.file;
      void openFile(base);
    }
  };

  return (
    <div className="flex h-44 shrink-0 flex-col border-t bg-card">
      <Tabs
        value={filter}
        onValueChange={setFilter}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <div className="flex h-9 shrink-0 items-center gap-2 border-b px-2">
          <TabsList className="h-7">
            <TabsTrigger value="all" className="h-6 px-2.5 text-xs">
              Semua
            </TabsTrigger>
            <TabsTrigger value="error" className="h-6 gap-1 px-2.5 text-xs">
              Error
              <Badge
                variant={errors ? "destructive" : "secondary"}
                className="h-4 min-w-4 rounded-full px-1 text-[10px]"
              >
                {errors}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="warning" className="h-6 gap-1 px-2.5 text-xs">
              Warning
              <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[10px]">
                {warnings}
              </Badge>
            </TabsTrigger>
          </TabsList>
          <span className="ml-auto pr-1 text-[11px] text-muted-foreground">
            {compiling
              ? "Compiling…"
              : result?.durationMs != null
                ? `Compile: ${result.durationMs} ms`
                : ""}
          </span>
        </div>

        <TabsContent value={filter} className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="py-1 font-mono text-[11.5px]">
              {!result && (
                <p className="px-3 py-2 text-muted-foreground">Belum ada compile.</p>
              )}
              {result && logs.length === 0 && (
                <p className="px-3 py-2 text-muted-foreground">
                  {result.status === "success"
                    ? "Compile sukses. Tidak ada pesan."
                    : "Tidak ada pesan log."}
                </p>
              )}
              {logs.map((l, i) => (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  onClick={() => openLog(l)}
                  onKeyDown={(e) => e.key === "Enter" && openLog(l)}
                  className="flex cursor-pointer items-baseline gap-2 px-3 py-0.5 hover:bg-accent"
                >
                  <span className="translate-y-0.5">{levelIcon[l.level]}</span>
                  {l.file && (
                    <span className="shrink-0 text-primary">
                      {l.file.split(/[\\/]/).pop()}
                      {l.line ? `:${l.line}` : ""}
                    </span>
                  )}
                  <span>{l.message}</span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}
