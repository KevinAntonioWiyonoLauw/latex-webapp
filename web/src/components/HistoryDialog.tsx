import { useEffect, useState } from "react";
import { toast } from "sonner";
import { History, RotateCcw, GitCommitHorizontal, Loader2 } from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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

interface Revision {
  hash: string;
  message: string;
  author: string;
  date: number;
}

export function HistoryDialog({
  projectId,
  onRestored,
}: {
  projectId: string;
  onRestored: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Revision[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Revision | null>(null);
  const [diff, setDiff] = useState("");
  const [diffLoading, setDiffLoading] = useState(false);
  const [pendingRestore, setPendingRestore] = useState<Revision | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setItems(await api.listRevisions(projectId));
    } catch (e) {
      toast.error("Gagal memuat riwayat", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, projectId]);

  const showDiff = async (r: Revision) => {
    setSelected(r);
    setDiffLoading(true);
    try {
      setDiff(await api.revisionDiff(projectId, r.hash));
    } catch (e) {
      setDiff(`Gagal memuat diff: ${(e as Error).message}`);
    } finally {
      setDiffLoading(false);
    }
  };

  const doRestore = async () => {
    if (!pendingRestore) return;
    const r = pendingRestore;
    setPendingRestore(null);
    try {
      await api.restoreRevision(projectId, r.hash);
      toast.success(`Dipulihkan ke revisi ${r.hash.slice(0, 7)}`);
      onRestored();
      await load();
      setSelected(null);
      setDiff("");
    } catch (e) {
      toast.error("Gagal memulihkan", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" title="Riwayat revisi">
          <History className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="size-4" /> Riwayat revisi
          </DialogTitle>
          <DialogDescription>
            Setiap compile sukses membuat snapshot otomatis (git lokal).
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[240px_1fr]">
          {/* Timeline */}
          <div className="rounded-md border">
            <ScrollArea className="h-[50vh]">
              <div className="p-1.5">
                {loading && (
                  <div className="flex justify-center py-6">
                    <Spinner className="text-muted-foreground" />
                  </div>
                )}
                {!loading && items.length === 0 && (
                  <p className="p-3 text-xs text-muted-foreground">
                    Belum ada revisi. Compile dulu untuk membuat snapshot.
                  </p>
                )}
                {items.map((r) => (
                  <button
                    key={r.hash}
                    type="button"
                    onClick={() => void showDiff(r)}
                    className={`flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent ${
                      selected?.hash === r.hash ? "bg-accent" : ""
                    }`}
                  >
                    <span className="flex items-center gap-1.5 font-medium">
                      <GitCommitHorizontal className="size-3.5 text-muted-foreground" />
                      {r.message}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {r.hash.slice(0, 7)} ·{" "}
                      {new Date(r.date).toLocaleString("id-ID")}
                    </span>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </div>

          {/* Diff */}
          <div className="flex min-w-0 flex-col rounded-md border">
            <div className="flex items-center justify-between border-b px-3 py-1.5">
              <span className="text-xs text-muted-foreground">
                {selected ? `Diff ${selected.hash.slice(0, 7)}` : "Pilih revisi"}
              </span>
              {selected && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setPendingRestore(selected)}
                >
                  <RotateCcw className="size-3.5" />
                  Pulihkan
                </Button>
              )}
            </div>
            <ScrollArea className="h-[50vh]">
              <pre className="p-3 text-[11px] leading-relaxed whitespace-pre-wrap">
                {diffLoading ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="size-3 animate-spin" /> Memuat diff…
                  </span>
                ) : (
                  diff || (
                    <span className="text-muted-foreground">
                      Pilih revisi untuk melihat perbedaan.
                    </span>
                  )
                )}
              </pre>
            </ScrollArea>
          </div>
        </div>

        <AlertDialog
          open={!!pendingRestore}
          onOpenChange={(o) => !o && setPendingRestore(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Pulihkan ke revisi ini?</AlertDialogTitle>
              <AlertDialogDescription>
                Seluruh file akan dikembalikan ke revisi{" "}
                <span className="font-mono">
                  {pendingRestore?.hash.slice(0, 7)}
                </span>
                . Perubahan saat ini akan digantikan (tetap bisa dilihat di
                riwayat).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={doRestore}>Pulihkan</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}
