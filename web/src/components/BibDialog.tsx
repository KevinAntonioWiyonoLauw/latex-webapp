import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookMarked, Copy, Loader2, Plus } from "lucide-react";
import { api } from "@/api";
import type { FileNode } from "@latex/shared";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface BibEntry {
  type: string;
  key: string;
  fields: Record<string, string>;
}

/** Parse entri BibTeX sederhana. */
function parseBib(content: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const re = /@(\w+)\s*\{\s*([^,\s]+)\s*,([\s\S]*?)\n\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const type = m[1];
    const key = m[2];
    const body = m[3];
    const fields: Record<string, string> = {};
    const fieldRe = /(\w+)\s*=\s*\{([^}]*)\}/g;
    let fm: RegExpExecArray | null;
    while ((fm = fieldRe.exec(body))) fields[fm[1].toLowerCase()] = fm[2];
    entries.push({ type, key, fields });
  }
  return entries;
}

function flatten(nodes: FileNode[]): FileNode[] {
  const out: FileNode[] = [];
  for (const n of nodes) {
    out.push(n);
    if (n.type === "dir" && n.children) out.push(...flatten(n.children));
  }
  return out;
}

export function BibDialog({
  projectId,
  onCite,
}: {
  projectId: string;
  onCite: (keys: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<BibEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const tree = await api.getTree(projectId);
      const bibFiles = flatten(tree).filter(
        (n) => n.type === "file" && n.path.endsWith(".bib"),
      );
      const all: BibEntry[] = [];
      for (const f of bibFiles) {
        const content = await api.readFile(projectId, f.path);
        all.push(...parseBib(content));
      }
      setEntries(all);
    } catch (e) {
      toast.error("Gagal memuat referensi", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, projectId]);

  const cite = (key: string) => {
    onCite(key);
    toast.success(`\\cite{${key}} disisipkan`);
    setOpen(false);
  };

  const copy = async (key: string) => {
    try {
      await navigator.clipboard.writeText(`\\cite{${key}}`);
      toast.success("Disalin");
    } catch {
      /* ignore */
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          title="Referensi (.bib)"
        >
          <BookMarked className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookMarked className="size-4" /> Referensi
          </DialogTitle>
          <DialogDescription>
            Entri dari file .bib dalam project. Klik untuk menyisipkan \cite.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[50vh] rounded-md border">
          <div className="p-2">
            {loading && (
              <div className="flex justify-center py-6">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
            {!loading && entries.length === 0 && (
              <p className="p-3 text-sm text-muted-foreground">
                Tidak ada entri. Buat file <code>.bib</code> dan tambahkan entri
                BibTeX.
              </p>
            )}
            {entries.map((e) => (
              <div
                key={e.key}
                className="flex items-center gap-2 rounded-md border-b px-2 py-2 last:border-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-medium">{e.key}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {e.type}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {e.fields.title ?? e.fields.author ?? ""}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cite(e.key)}
                >
                  <Plus className="size-3.5" />
                  Cite
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8"
                  title="Salin \cite"
                  onClick={() => copy(e.key)}
                >
                  <Copy className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
