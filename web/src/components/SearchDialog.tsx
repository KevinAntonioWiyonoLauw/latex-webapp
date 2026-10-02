import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { api } from "@/api";
import { useStore } from "../store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Hit {
  file: string;
  line: number;
  column: number;
  text: string;
}

export function SearchDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [regex, setRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const run = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await api.search(projectId, query, { regex, caseSensitive });
      setHits(res);
    } catch {
      setHits([]);
    } finally {
      setLoading(false);
    }
  };

  const goto = (hit: Hit) => {
    void useStore.getState().openFile(hit.file);
    useStore.getState().jumpToSource(hit.file, hit.line);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" title="Cari di semua file">
          <Search className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="size-4" /> Pencarian lintas file
          </DialogTitle>
          <DialogDescription>
            Cari teks di seluruh file project.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input
            autoFocus
            placeholder="Kata kunci…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && run()}
          />
          <Button onClick={run} disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="animate-spin" /> : <Search />}
            Cari
          </Button>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-2">
            <Switch id="regex" checked={regex} onCheckedChange={setRegex} />
            <Label htmlFor="regex" className="text-xs">
              Regex
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="case"
              checked={caseSensitive}
              onCheckedChange={setCaseSensitive}
            />
            <Label htmlFor="case" className="text-xs">
              Peka huruf besar/kecil
            </Label>
          </div>
        </div>

        <div className="rounded-md border">
          <ScrollArea className="h-[45vh]">
            <div className="p-2 font-mono text-[11px]">
              {loading && (
                <div className="flex justify-center py-6">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && searched && hits.length === 0 && (
                <p className="p-2 text-muted-foreground">Tidak ada hasil.</p>
              )}
              {!searched && (
                <p className="p-2 text-muted-foreground">
                  Masukkan kata kunci lalu tekan Enter.
                </p>
              )}
              {hits.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => goto(h)}
                  className="flex w-full flex-col items-start rounded px-2 py-1 text-left hover:bg-accent"
                >
                  <span className="text-primary">
                    {h.file}:{h.line}:{h.column}
                  </span>
                  <span className="line-clamp-1 opacity-80">{h.text.trim()}</span>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
