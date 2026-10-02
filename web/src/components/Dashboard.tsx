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
  Search,
  ArrowUpDown,
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
import { cn } from "@/lib/utils";

type SortKey = "name" | "updated" | "rootFile";

/** Format waktu ringkas & mudah dibaca (mis. "2 Okt 2026, 21.10"). */
function fmtTime(ts: number): string {
  try {
    return new Date(ts).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "-";
  }
}

export function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [templates, setTemplates] = useState<{ id: string; label: string }[]>([]);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("article");
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
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

  /* --------------------------- filter & urut --------------------------- */
  const q = query.trim().toLowerCase();
  const shown = projects
    .filter((p) => !q || p.name.toLowerCase().includes(q) || p.rootFile.toLowerCase().includes(q))
    .sort((a, b) => {
      if (sortKey === "name") return a.name.localeCompare(b.name, "id");
      if (sortKey === "rootFile") return a.rootFile.localeCompare(b.rootFile, "id");
      return b.updatedAt - a.updatedAt; // terbaru dulu
    });

  /** Tombol urut untuk header kolom. */
  const SortHeader = ({
    label,
    k,
    className,
  }: {
    label: string;
    k: SortKey;
    className?: string;
  }) => (
    <button
      type="button"
      onClick={() => setSortKey(k)}
      className={cn(
        "inline-flex items-center gap-1 hover:text-foreground",
        sortKey === k ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {label}
      <ArrowUpDown className="size-3" />
    </button>
  );

  return (
    <div className="min-h-full overflow-auto bg-background">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <header className="mb-8 flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FileCode2 className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">
              LaTeX Web Editor
            </h1>
            <p className="truncate text-sm text-muted-foreground">
              Tulis, compile, dan preview LaTeX di browser.
            </p>
          </div>
          <div className="ml-auto shrink-0">
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

        <div className="mb-3 flex flex-wrap items-center gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            Project Anda ({projects.length})
          </h2>
          <div className="relative ml-auto w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cari project…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8"
            />
          </div>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
            <FolderOpen className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Belum ada project. Buat project baru atau import file .zip.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border">
            {/* Tabel (desktop & tablet) */}
            <table className="hidden w-full table-fixed border-collapse text-sm md:table">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs">
                  <th className="w-[42%] px-3 py-2 font-medium">
                    <SortHeader label="Nama project" k="name" />
                  </th>
                  <th className="w-[22%] px-3 py-2 font-medium">
                    <SortHeader label="File utama" k="rootFile" />
                  </th>
                  <th className="w-[24%] px-3 py-2 font-medium">
                    <SortHeader label="Terakhir diubah" k="updated" />
                  </th>
                  <th className="w-[12%] px-3 py-2 text-right font-medium text-muted-foreground">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr
                    key={p.id}
                    onClick={() => navigate(`/project/${p.id}`)}
                    className="group cursor-pointer border-b last:border-0 hover:bg-accent/50"
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <FileCode2 className="size-4 shrink-0 text-amber-400" />
                        <span className="truncate font-medium" title={p.name}>
                          {p.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className="block truncate font-mono text-xs text-muted-foreground"
                        title={p.rootFile}
                      >
                        {p.rootFile}
                      </span>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {fmtTime(p.updatedAt)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <ProjectMenu
                        project={p}
                        onDelete={() => setPendingDelete(p)}
                        alwaysVisible={false}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Daftar (mobile) */}
            <ul className="divide-y md:hidden">
              {shown.map((p) => (
                <li
                  key={p.id}
                  onClick={() => navigate(`/project/${p.id}`)}
                  className="flex cursor-pointer items-center gap-3 px-3 py-3 active:bg-accent/50"
                >
                  <FileCode2 className="size-4 shrink-0 text-amber-400" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {p.rootFile} · {fmtTime(p.updatedAt)}
                    </p>
                  </div>
                  <ProjectMenu
                    project={p}
                    onDelete={() => setPendingDelete(p)}
                    alwaysVisible
                  />
                </li>
              ))}
            </ul>

            {shown.length === 0 && (
              <p className="p-6 text-center text-sm text-muted-foreground">
                Tidak ada project yang cocok dengan “{query}”.
              </p>
            )}
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

/** Menu aksi (duplikat / export / hapus) untuk satu project. */
function ProjectMenu({
  project,
  onDelete,
  alwaysVisible,
}: {
  project: Project;
  onDelete: () => void;
  alwaysVisible: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "size-7 shrink-0",
            !alwaysVisible &&
              "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
          onClick={(e) => e.stopPropagation()}
          title="Aksi project"
        >
          <MoreVertical className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem
          onSelect={async () => {
            try {
              const c = await api.cloneProject(project.id);
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
          onSelect={() => window.open(api.exportUrl(project.id), "_blank")}
        >
          <FileArchive />
          Export .zip
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 />
          Hapus project
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
