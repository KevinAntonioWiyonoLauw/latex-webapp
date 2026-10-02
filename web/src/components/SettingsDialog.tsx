import { Settings as SettingsIcon } from "lucide-react";
import { useSettings } from "@/store/settings";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function SettingsDialog() {
  const s = useSettings();

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8" title="Pengaturan">
          <SettingsIcon className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="size-4" /> Pengaturan
          </DialogTitle>
          <DialogDescription>
            Atur tampilan editor dan perilaku compile.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <h4 className="text-sm font-medium">Tampilan</h4>
            <div className="flex items-center justify-between">
              <Label>Tema</Label>
              <Select
                value={s.theme}
                onValueChange={(v) => s.set("theme", v as "dark" | "light")}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dark">Gelap</SelectItem>
                  <SelectItem value="light">Terang</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Ukuran font</Label>
              <Select
                value={String(s.fontSize)}
                onValueChange={(v) => s.set("fontSize", Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[11, 12, 13, 14, 16, 18].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} px
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label>Ukuran tab</Label>
              <Select
                value={String(s.tabSize)}
                onValueChange={(v) => s.set("tabSize", Number(v))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[2, 4, 8].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n} spasi
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="wrap">Word wrap</Label>
              <Switch
                id="wrap"
                checked={s.wordWrap}
                onCheckedChange={(v) => s.set("wordWrap", v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="minimap">Minimap</Label>
              <Switch
                id="minimap"
                checked={s.minimap}
                onCheckedChange={(v) => s.set("minimap", v)}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="ln">Nomor baris</Label>
              <Switch
                id="ln"
                checked={s.lineNumbers}
                onCheckedChange={(v) => s.set("lineNumbers", v)}
              />
            </div>
          </section>

          <Separator />

          <section className="space-y-3">
            <h4 className="text-sm font-medium">Compile</h4>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="auto">Auto-compile</Label>
                <p className="text-xs text-muted-foreground">
                  Compile otomatis setelah berhenti mengetik.
                </p>
              </div>
              <Switch
                id="auto"
                checked={s.autoCompile}
                onCheckedChange={(v) => s.set("autoCompile", v)}
              />
            </div>
            {s.autoCompile && (
              <div className="flex items-center justify-between">
                <Label>Jeda auto-compile</Label>
                <Select
                  value={String(s.autoCompileDelay)}
                  onValueChange={(v) => s.set("autoCompileDelay", Number(v))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1500">1.5 detik</SelectItem>
                    <SelectItem value="2500">2.5 detik</SelectItem>
                    <SelectItem value="4000">4 detik</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </section>

          <Separator />

          <section className="space-y-3">
            <h4 className="text-sm font-medium">Kolaborasi</h4>
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="collab">Kolaborasi realtime</Label>
                <p className="text-xs text-muted-foreground">
                  Sinkronisasi live antar pengguna (Yjs).
                </p>
              </div>
              <Switch
                id="collab"
                checked={s.collabEnabled}
                onCheckedChange={(v) => s.set("collabEnabled", v)}
              />
            </div>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
