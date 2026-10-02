import { useRef, useState } from "react";
import type { FileNode } from "@latex/shared";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  FileCode2,
  FileText,
  FilePlus2,
  FolderPlus,
  Folder,
  FolderOpen,
  MoreVertical,
  Pencil,
  Target,
  Trash2,
  Upload,
} from "lucide-react";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

function fileIcon(name: string) {
  if (name.endsWith(".tex")) return FileCode2;
  if (name.endsWith(".bib")) return FileText;
  return FileText;
}

/** Ambil nama file dari sebuah path. */
function baseName(p: string): string {
  return p.includes("/") ? p.slice(p.lastIndexOf("/") + 1) : p;
}

/** Apakah `child` berada di dalam `parent` (atau sama dengannya)? */
function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/** MIME khusus supaya drag dari luar (OS) bisa dibedakan. */
const DND_MIME = "application/x-latex-path";

interface NodeProps {
  node: FileNode;
  depth: number;
  rootFile: string;
  onRequestDelete: (node: FileNode) => void;
  onRequestRename: (node: FileNode) => void;
  dragging: string | null;
  setDragging: (p: string | null) => void;
  dropTarget: string | null;
  setDropTarget: (p: string | null) => void;
}

function TreeNode({
  node,
  depth,
  rootFile,
  onRequestDelete,
  onRequestRename,
  dragging,
  setDragging,
  dropTarget,
  setDropTarget,
}: NodeProps) {
  const [open, setOpen] = useState(true);
  const activePath = useStore((s) => s.activePath);
  const openFile = useStore((s) => s.openFile);
  const setRootFile = useStore((s) => s.setRootFile);
  const movePath = useStore((s) => s.movePath);

  const isRoot = node.type === "file" && node.path === rootFile;
  const isTex = node.path.toLowerCase().endsWith(".tex");
  const isActive = node.path === activePath;
  const isDir = node.type === "dir";
  const Icon = isDir ? (open ? FolderOpen : Folder) : fileIcon(node.name);

  const isDragging = dragging === node.path;
  // Folder ini valid sebagai tujuan drop?
  const canDropHere =
    isDir &&
    dragging !== null &&
    !isInside(node.path, dragging) && // jangan ke dalam dirinya sendiri
    node.path !== dragging;
  const isDropTarget = dropTarget === node.path;

  const onClick = () => {
    if (isDir) setOpen((o) => !o);
    else void openFile(node.path);
  };

  /** Pindahkan item yang sedang di-drag ke dalam folder ini. */
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropTarget(null);

    // 1) Drag file dari OS -> upload ke folder ini.
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) {
      try {
        await useStore.getState().uploadFiles(files, node.path);
        toast.success(`${files.length} file di-upload ke ${baseName(node.path)}/`);
      } catch (err) {
        toast.error("Gagal upload", { description: (err as Error).message });
      }
      return;
    }

    // 2) Drag internal -> pindahkan.
    const from = e.dataTransfer.getData(DND_MIME) || dragging;
    if (!from || !isDir) return;
    if (isInside(node.path, from)) {
      toast.error("Tidak bisa memindahkan folder ke dalam dirinya sendiri");
      return;
    }
    const to = `${node.path}/${baseName(from)}`;
    try {
      await movePath(from, to);
      toast.success(`"${baseName(from)}" dipindah ke ${baseName(node.path)}/`);
      setOpen(true);
    } catch (err) {
      toast.error("Gagal memindahkan", { description: (err as Error).message });
    } finally {
      setDragging(null);
    }
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        title={isRoot ? "File root (di-compile)" : node.path}
        draggable
        onDragStart={(e) => {
          e.stopPropagation();
          e.dataTransfer.setData(DND_MIME, node.path);
          e.dataTransfer.setData("text/plain", node.path);
          e.dataTransfer.effectAllowed = "move";
          setDragging(node.path);
        }}
        onDragEnd={() => {
          setDragging(null);
          setDropTarget(null);
        }}
        onDragOver={(e) => {
          if (!canDropHere) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          if (dropTarget !== node.path) setDropTarget(node.path);
        }}
        onDragLeave={() => {
          if (isDropTarget) setDropTarget(null);
        }}
        onDrop={handleDrop}
        className={cn(
          "group flex h-7 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2 text-[13px] select-none",
          "hover:bg-accent hover:text-accent-foreground",
          isActive && "bg-accent text-accent-foreground",
          isDragging && "opacity-40",
          isDropTarget && "bg-primary/20 ring-1 ring-primary ring-inset",
        )}
        style={{ marginLeft: depth * 12 }}
      >
        {isDir ? (
          open ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
          )
        ) : (
          <span className="w-3.5 shrink-0" />
        )}
        <Icon
          className={cn(
            "size-3.5 shrink-0",
            isTex ? "text-amber-300" : "text-muted-foreground",
          )}
        />
        <span className={cn("truncate", isRoot && "font-semibold")}>{node.name}</span>
        {isRoot && <Target className="size-3 shrink-0 text-emerald-400" />}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-6 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreVertical className="size-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
            {isTex && !isRoot && (
              <DropdownMenuItem
                onSelect={() => {
                  void setRootFile(node.path);
                  toast.success(`File root diubah ke ${node.name}`);
                }}
              >
                <Target />
                Jadikan file root
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => onRequestRename(node)}>
              <Pencil />
              Ganti nama
            </DropdownMenuItem>
            {node.path !== rootFile && (
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => onRequestDelete(node)}
              >
                <Trash2 />
                Hapus
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {isDir &&
        open &&
        node.children?.map((c) => (
          <TreeNode
            key={c.path}
            node={c}
            depth={depth + 1}
            rootFile={rootFile}
            onRequestDelete={onRequestDelete}
            onRequestRename={onRequestRename}
            dragging={dragging}
            setDragging={setDragging}
            dropTarget={dropTarget}
            setDropTarget={setDropTarget}
          />
        ))}
    </>
  );
}

export function FileTree({
  className,
  hideHeader = false,
}: {
  className?: string;
  /** Sembunyikan header bawaan (dipakai saat ditampilkan dalam drawer). */
  hideHeader?: boolean;
} = {}) {
  const tree = useStore((s) => s.tree);
  const project = useStore((s) => s.project);
  const createFile = useStore((s) => s.createFile);
  const createFolder = useStore((s) => s.createFolder);
  const uploadFiles = useStore((s) => s.uploadFiles);
  const movePath = useStore((s) => s.movePath);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [dialog, setDialog] = useState<null | "file" | "folder">(null);
  const [value, setValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<FileNode | null>(null);
  const [pendingRename, setPendingRename] = useState<FileNode | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Status drag & drop (dibagi ke semua node).
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [rootHover, setRootHover] = useState(false);

  const submitDialog = async () => {
    const v = value.trim();
    if (!v) return;
    try {
      if (dialog === "file")
        await createFile(v.endsWith(".tex") || v.includes(".") ? v : `${v}.tex`);
      else await createFolder(v);
      toast.success(`${dialog === "file" ? "File" : "Folder"} "${v}" dibuat`);
      setDialog(null);
      setValue("");
    } catch (e) {
      toast.error("Gagal membuat", { description: (e as Error).message });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await useStore.getState().deletePath(target.path);
      toast.success(`"${target.name}" dihapus`);
    } catch (e) {
      toast.error("Gagal menghapus", { description: (e as Error).message });
    }
  };

  const confirmRename = async () => {
    if (!pendingRename) return;
    const target = pendingRename;
    const newName = renameValue.trim();
    setPendingRename(null);
    if (!newName || newName === target.name) return;
    try {
      await useStore.getState().renamePath(target.path, newName);
      toast.success(`Diubah menjadi "${newName}"`);
    } catch (e) {
      toast.error("Gagal mengganti nama", { description: (e as Error).message });
    }
  };

  /** Drop di area kosong -> pindahkan ke root project. */
  const handleRootDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setRootHover(false);
    setDropTarget(null);

    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length) {
      try {
        await uploadFiles(files);
        toast.success(`${files.length} file di-upload`);
      } catch (err) {
        toast.error("Gagal upload", { description: (err as Error).message });
      }
      return;
    }

    const from = e.dataTransfer.getData(DND_MIME) || dragging;
    if (!from) return;
    if (!from.includes("/")) {
      setDragging(null);
      return; // sudah di root
    }
    const to = baseName(from);
    try {
      await movePath(from, to);
      toast.success(`"${to}" dipindah ke root`);
    } catch (err) {
      toast.error("Gagal memindahkan", { description: (err as Error).message });
    } finally {
      setDragging(null);
    }
  };

  return (
    <aside className={cn("flex w-60 shrink-0 flex-col border-r bg-card", className)}>
      {!hideHeader && (
        <div className="flex h-10 shrink-0 items-center justify-between border-b px-2">
          <span className="pl-1 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            Files
          </span>
          <div className="flex items-center gap-0.5">
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="File baru"
              onClick={() => {
                setValue("");
                setDialog("file");
              }}
            >
              <FilePlus2 className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Folder baru"
              onClick={() => {
                setValue("");
                setDialog("folder");
              }}
            >
              <FolderPlus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-7"
              title="Upload file"
              onClick={() => uploadRef.current?.click()}
            >
              <Upload className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <ScrollArea className="flex-1">
        <div
          className={cn(
            "min-h-full p-1.5 transition-colors",
            rootHover && "bg-primary/10",
          )}
          onDragOver={(e) => {
            // Hanya tangani bila bukan di atas folder (folder menangani sendiri).
            if (dragging && !dropTarget) {
              e.preventDefault();
              setRootHover(true);
            } else if (!dragging && e.dataTransfer.types.includes("Files")) {
              e.preventDefault();
              setRootHover(true);
            }
          }}
          onDragLeave={() => setRootHover(false)}
          onDrop={handleRootDrop}
        >
          {tree.map((n) => (
            <TreeNode
              key={n.path}
              node={n}
              depth={0}
              rootFile={project?.rootFile ?? ""}
              onRequestDelete={setPendingDelete}
              onRequestRename={(node) => {
                setRenameValue(node.name);
                setPendingRename(node);
              }}
              dragging={dragging}
              setDragging={setDragging}
              dropTarget={dropTarget}
              setDropTarget={setDropTarget}
            />
          ))}
          {tree.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">
              Tidak ada file. Tarik file ke sini untuk upload.
            </p>
          )}
        </div>
      </ScrollArea>

      <input
        ref={uploadRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) void uploadFiles(files);
          e.target.value = "";
        }}
      />

      <Dialog open={!!dialog} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog === "file" ? "File baru" : "Folder baru"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "file"
                ? "Masukkan nama file (mis. section1.tex)."
                : "Masukkan nama folder baru."}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            placeholder={dialog === "file" ? "main.tex" : "images"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitDialog()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              Batal
            </Button>
            <Button onClick={submitDialog} disabled={!value.trim()}>
              Buat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pendingRename} onOpenChange={(o) => !o && setPendingRename(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Ganti nama</DialogTitle>
            <DialogDescription>
              Nama baru untuk <span className="font-medium">{pendingRename?.name}</span>.
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={renameValue}
            onChange={(e) => setRenameValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && confirmRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingRename(null)}>
              Batal
            </Button>
            <Button onClick={confirmRename} disabled={!renameValue.trim()}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus file?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{pendingDelete?.name}</span> akan
              dihapus permanen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              Hapus
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </aside>
  );
}
