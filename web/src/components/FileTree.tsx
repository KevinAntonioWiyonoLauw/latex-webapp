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

interface NodeProps {
  node: FileNode;
  depth: number;
  rootFile: string;
  onRequestDelete: (node: FileNode) => void;
}

function TreeNode({ node, depth, rootFile, onRequestDelete }: NodeProps) {
  const [open, setOpen] = useState(true);
  const activePath = useStore((s) => s.activePath);
  const openFile = useStore((s) => s.openFile);
  const setRootFile = useStore((s) => s.setRootFile);

  const isRoot = node.type === "file" && node.path === rootFile;
  const isTex = node.path.toLowerCase().endsWith(".tex");
  const isActive = node.path === activePath;
  const Icon = node.type === "dir" ? (open ? FolderOpen : Folder) : fileIcon(node.name);

  const onClick = () => {
    if (node.type === "dir") setOpen((o) => !o);
    else void openFile(node.path);
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => e.key === "Enter" && onClick()}
        title={isRoot ? "File root (di-compile)" : node.path}
        className={cn(
          "group flex h-7 cursor-pointer items-center gap-1.5 rounded-md pr-1 pl-2 text-[13px] select-none",
          "hover:bg-accent hover:text-accent-foreground",
          isActive && "bg-accent text-accent-foreground",
        )}
        style={{ marginLeft: depth * 12 }}
      >
        {node.type === "dir" ? (
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

        {node.type === "file" && (
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
        )}
      </div>
      {node.type === "dir" &&
        open &&
        node.children?.map((c) => (
          <TreeNode
            key={c.path}
            node={c}
            depth={depth + 1}
            rootFile={rootFile}
            onRequestDelete={onRequestDelete}
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
  const uploadRef = useRef<HTMLInputElement>(null);

  const [dialog, setDialog] = useState<null | "file" | "folder">(null);
  const [value, setValue] = useState("");
  const [pendingDelete, setPendingDelete] = useState<FileNode | null>(null);

  const submitDialog = async () => {
    const v = value.trim();
    if (!v) return;
    try {
      if (dialog === "file") await createFile(v.endsWith(".tex") || v.includes(".") ? v : `${v}.tex`);
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
        <div className="p-1.5">
          {tree.map((n) => (
            <TreeNode
              key={n.path}
              node={n}
              depth={0}
              rootFile={project?.rootFile ?? ""}
              onRequestDelete={setPendingDelete}
            />
          ))}
          {tree.length === 0 && (
            <p className="p-3 text-xs text-muted-foreground">Tidak ada file.</p>
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
