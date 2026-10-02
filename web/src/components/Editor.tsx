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
  Code2,
  Eye,
  ImagePlus,
} from "lucide-react";
import { useStore } from "../store";
import { useSettings } from "../store/settings";
import { useSession } from "../auth/client";
import { createCollab, colorForUser, type CollabHandle } from "../hooks/useCollab";
import { setCompletionContext } from "../monaco";
import { setActiveEditor, wrapSelection } from "../monaco-bridge";
import { countWords, extractLabels, extractBibKeys } from "../latexLanguage";
import { FormatToolbar } from "./FormatToolbar";
import { VisualEditor } from "./VisualEditor";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  /** Mode tampilan editor: kode (Monaco) atau visual (seperti Word). */
  const [mode, setMode] = useState<"code" | "visual">("code");
  /** File gambar yang menunggu konfirmasi penyisipan setelah drag & drop. */
  const [droppedImages, setDroppedImages] = useState<File[]>([]);

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
    // Pintasan pemformatan ala editor biasa.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyB, () => {
      wrapSelection("\\textbf{");
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyI, () => {
      wrapSelection("\\textit{");
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyU, () => {
      wrapSelection("\\underline{");
    });
    // Ctrl+E -> rumus inline.
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyE, () => {
      wrapSelection("$", "$");
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

  /**
   * Tangani drop file ke editor.
   *
   * Untuk GAMBAR: tampilkan dialog konfirmasi (ukuran, caption, folder) lalu
   * unggah + sisipkan kode `figure` di posisi kursor. Untuk file lain:
   * unggah langsung tanpa mengubah kode.
   */
  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    if (!project) return;
    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      // Munculkan popup; unggahan dilakukan setelah user menekan "Sisipkan".
      setDroppedImages(images);
      return;
    }

    try {
      await useStore.getState().uploadFiles(files, "images");
      toast.success(`${files.length} file di-upload ke images/`);
    } catch (err) {
      toast.error("Gagal upload file", { description: (err as Error).message });
    }
  };

  /** Unggah gambar yang di-drop lalu sisipkan kode LaTeX-nya di kursor. */
  const insertDroppedImages = async (opts: {
    folder: string;
    width: string;
    caption: string;
    label: string;
    asFigure: boolean;
  }) => {
    const files = droppedImages;
    setDroppedImages([]);
    if (!files.length) return;
    try {
      await useStore.getState().uploadFiles(files, opts.folder);
      const ed = editorRef.current;
      if (ed) {
        const snippet = files
          .map((f) => {
            const path = opts.folder ? `${opts.folder}/${f.name}` : f.name;
            if (!opts.asFigure) {
              return `\\includegraphics[width=${opts.width}]${"{"}${path}${"}"}`;
            }
            return [
              "\\begin{figure}[h]",
              "  \\centering",
              `  \\includegraphics[width=${opts.width}]{${path}}`,
              `  \\caption{${opts.caption || f.name}}`,
              `  \\label{${opts.label || "fig:" + f.name.replace(/\.[^.]+$/, "")}}`,
              "\\end{figure}",
            ].join("\n");
          })
          .join("\n");
        const pos = ed.getPosition();
        if (pos) {
          ed.executeEdits("drop-image", [
            {
              range: {
                startLineNumber: pos.lineNumber,
                startColumn: pos.column,
                endLineNumber: pos.lineNumber,
                endColumn: pos.column,
              },
              text: snippet,
            },
          ]);
          ed.focus();
        }
      }
      toast.success(
        `${files.length} gambar di-upload ke ${opts.folder || "root"} dan disisipkan ke kode`,
      );
    } catch (err) {
      toast.error("Gagal mengunggah gambar", { description: (err as Error).message });
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

        {/* Pemilih mode + status kolaborasi */}
        <div className="ml-auto flex items-center gap-2 pr-2">
          {active && /\.tex$/i.test(active.path) && (
            <div className="flex items-center gap-0.5 rounded-md bg-muted p-0.5">
              <button
                type="button"
                onClick={() => setMode("code")}
                title="Mode kode (LaTeX)"
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
                  mode === "code"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                <Code2 className="size-3" />
                Kode
              </button>
              <button
                type="button"
                onClick={() => setMode("visual")}
                title="Mode visual (seperti Word)"
                className={cn(
                  "flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
                  mode === "visual"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                <Eye className="size-3" />
                Visual
              </button>
            </div>
          )}
          <CollabIndicator status={collabStatus} users={others} active={collabActive} />
        </div>
      </div>

      {/* Toolbar pemformatan — hanya di mode kode untuk file .tex. */}
      {mode === "code" && active && /\.tex$/i.test(active.path) && <FormatToolbar />}

      {/* Editor */}
      <div
        className="relative flex min-h-0 flex-1 flex-col"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
      >
        {!active ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            Pilih file untuk mulai mengedit
          </div>
        ) : mode === "visual" && /\.tex$/i.test(active.path) ? (
          <VisualEditor />
        ) : (
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
        )}
      </div>

      {/* Dialog konfirmasi gambar hasil drag & drop */}
      <Dialog
        open={droppedImages.length > 0}
        onOpenChange={(o) => !o && setDroppedImages([])}
      >
        <ImageDropDialog
          files={droppedImages}
          onCancel={() => setDroppedImages([])}
          onConfirm={insertDroppedImages}
        />
      </Dialog>

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

/* ---------------------- Dialog gambar (drag & drop) ---------------------- */

/**
 * Konfirmasi sebelum gambar hasil drag & drop diunggah & disisipkan.
 *
 * User memilih folder tujuan, lebar, caption, label, dan apakah dibungkus
 * `figure` (dengan caption) atau hanya `\includegraphics` saja.
 */
function ImageDropDialog({
  files,
  onCancel,
  onConfirm,
}: {
  files: File[];
  onCancel: () => void;
  onConfirm: (opts: {
    folder: string;
    width: string;
    caption: string;
    label: string;
    asFigure: boolean;
  }) => void;
}) {
  const [folder, setFolder] = useState("images");
  const [width, setWidth] = useState("0.8\\textwidth");
  const [caption, setCaption] = useState("");
  const [label, setLabel] = useState("");
  const [asFigure, setAsFigure] = useState(true);
  const [busy, setBusy] = useState(false);

  const widths: [string, string][] = [
    ["0.5\\textwidth", "50%"],
    ["0.8\\textwidth", "80%"],
    ["\\textwidth", "100%"],
    ["0.3\\textwidth", "30%"],
  ];

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ImagePlus className="size-4" />
          Sisipkan {files.length} gambar
        </DialogTitle>
        <DialogDescription>
          Gambar akan diunggah lalu kode LaTeX-nya disisipkan di posisi kursor.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="rounded border bg-muted/40 p-2">
          <p className="mb-1 text-[11px] font-medium text-muted-foreground">
            File ({files.length})
          </p>
          <ul className="max-h-24 space-y-0.5 overflow-auto">
            {files.map((f) => (
              <li key={f.name} className="truncate font-mono text-[11px]">
                {f.name}{" "}
                <span className="text-muted-foreground">
                  ({(f.size / 1024).toFixed(0)} KB)
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              Folder tujuan
            </span>
            <Input
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              placeholder="images"
              className="h-8 text-xs"
            />
          </label>
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
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-medium text-muted-foreground">
            Lebar gambar
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
          Bungkus dengan <code className="rounded bg-muted px-1">figure</code>{" "}
          (dengan caption &amp; label)
        </label>

        {asFigure && (
          <label className="block space-y-1">
            <span className="text-[11px] font-medium text-muted-foreground">
              Label (untuk \ref&#123;…&#125;)
            </span>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="fig:nama"
              className="h-8 text-xs"
            />
          </label>
        )}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onCancel} disabled={busy}>
          Batal
        </Button>
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            onConfirm({ folder: folder.trim(), width, caption, label, asFigure });
          }}
        >
          {busy ? <Loader2 className="animate-spin" /> : <ImagePlus />}
          Unggah &amp; sisipkan
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
