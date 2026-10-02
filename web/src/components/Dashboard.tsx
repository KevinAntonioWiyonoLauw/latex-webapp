import { useEffect, useRef, useState } from "react";
import type { Project } from "@latex/shared";
import { toast } from "sonner";
import {
  FileCode2,
  FilePlus2,
  FolderOpen,
  Loader2,
  MoreVertical,
  Plus,
  Trash2,
  Copy,
  FileArchive,
} from "lucide-react";
import { api } from "@/api";
import { navigate } from "@/App";
import { UserMenu } from "./UserMenu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { Separator } from "@/components/ui/separator";

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<{ id: string; label: string }[]>([]);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("article");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const zipRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    try {
      const [p, t] = await Promise.all([api.listProjects(), api.listTemplates()]);
      setProjects(p);
      setTemplates(t);
    } catch (e) {
      toast.error("Gagal memuat daftar project", {
        description: (e as Error).message,
      });
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await api.createProject(name.trim(), template);
      navigate(`/project/${p.id}`);
    } catch (e) {
      toast.error("Gagal membuat project", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (file: File) => {
    setBusy(true);
    const t = toast.loading("Meng-import project…");
    try {
      const p = await api.importZip(file, file.name.replace(/\.zip$/i, ""));
      toast.success("Project berhasil di-import", { id: t });
      navigate(`/project/${p.id}`);
    } catch (e) {
      toast.error("Gagal meng-import project", {
        id: t,
        description: (e as Error).message,
      });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    try {
      await api.deleteProject(target.id);
      toast.success(`Project "${target.name}" dihapus`);
      await load();
    } catch (e) {
      toast.error("Gagal menghapus project", { description: (e as Error).message });
    }
  };

  return (
    <div className="min-h-full overflow-auto bg-background">
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-8 flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileCode2 className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">LaTeX Web Editor</h1>
            <p className="text-sm text-muted-foreground">
              Tulis, compile, dan preview LaTeX di browser.
            </p>
          </div>
          <div className="ml-auto">
            <UserMenu onSignedOut={() => navigate("/")} />
          </div>
        </header>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-base">Project Baru</CardTitle>
            <CardDescription>
              Buat project dari template atau import file .zip yang sudah ada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                placeholder="Nama project…"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && create()}
                className="w-full sm:w-64"
              />
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={create} disabled={busy || !name.trim()}>
                {busy ? <Loader2 className="animate-spin" /> : <Plus />}
                Buat
              </Button>
              <div className="mx-1 hidden h-6 sm:block">
                <Separator orientation="vertical" />
              </div>
              <Button
                variant="outline"
                onClick={() => zipRef.current?.click()}
                disabled={busy}
              >
                <FilePlus2 />
                Import .zip
              </Button>
              <input
                ref={zipRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void onImport(f);
                  e.target.value = "";
                }}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-medium text-muted-foreground">
            Project Anda ({projects.length})
          </h2>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <FolderOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Belum ada project. Buat project baru atau import file .zip.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((p) => (
              <Card
                key={p.id}
                className="group cursor-pointer transition-colors hover:border-primary/60"
                onClick={() => navigate(`/project/${p.id}`)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="truncate text-base">{p.name}</CardTitle>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <DropdownMenuItem
                          onSelect={async () => {
                            try {
                              const c = await api.cloneProject(p.id);
                              toast.success("Project diduplikat");
                              navigate(`/project/${c.id}`);
                            } catch (err) {
                              toast.error("Gagal menduplikat", {
                                description: (err as Error).message,
                              });
                            }
                          }}
                        >
                          <Copy />
                          Duplikat
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            window.open(api.exportUrl(p.id), "_blank")
                          }
                        >
                          <FileArchive />
                          Export .zip
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setPendingDelete(p)}
                        >
                          <Trash2 />
                          Hapus project
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <CardDescription className="truncate font-mono text-xs">
                    {p.rootFile}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    Diubah {new Date(p.updatedAt).toLocaleString("id-ID")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <AlertDialog
        open={!!pendingDelete}
        onOpenChange={(o) => !o && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus project?</AlertDialogTitle>
            <AlertDialogDescription>
              Project <span className="font-medium">{pendingDelete?.name}</span>{" "}
              beserta seluruh file di dalamnya akan dihapus permanen. Tindakan ini
              tidak bisa dibatalkan.
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
    </div>
  );
}
