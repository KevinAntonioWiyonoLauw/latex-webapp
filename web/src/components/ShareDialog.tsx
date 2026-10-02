import { useEffect, useState } from "react";
import type { ProjectMember, ShareLink } from "@latex/shared";
import { toast } from "sonner";
import {
  Copy,
  Link2,
  Loader2,
  Share2,
  Trash2,
  UserPlus,
} from "lucide-react";
import { api } from "@/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_LABEL: Record<string, string> = {
  owner: "Pemilik",
  editor: "Editor",
  viewer: "Hanya lihat",
};

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function ShareDialog({ projectId }: { projectId: string }) {
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [linkRole, setLinkRole] = useState("viewer");
  const [creating, setCreating] = useState(false);
  const [inviting, setInviting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [m, l] = await Promise.all([
        api.listMembers(projectId),
        api.listShareLinks(projectId),
      ]);
      setMembers(m);
      setLinks(l);
    } catch (e) {
      toast.error("Gagal memuat info share", { description: (e as Error).message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) void load();
  }, [open, projectId]);

  const invite = async () => {
    const email = inviteEmail.trim().toLowerCase();
    if (!email) return;
    setInviting(true);
    try {
      const m = await api.addMember(projectId, email, inviteRole);
      setMembers(m);
      setInviteEmail("");
      toast.success(`${email} ditambahkan sebagai ${ROLE_LABEL[inviteRole]}`);
    } catch (e) {
      toast.error("Gagal mengundang", { description: (e as Error).message });
    } finally {
      setInviting(false);
    }
  };

  const changeRole = async (userId: string, role: string) => {
    try {
      const m = await api.updateMemberRole(projectId, userId, role);
      setMembers(m);
      toast.success("Role diperbarui");
    } catch (e) {
      toast.error("Gagal mengubah role", { description: (e as Error).message });
    }
  };

  const removeMember = async (userId: string, name: string) => {
    try {
      await api.removeMember(projectId, userId);
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
      toast.success(`${name} dihapus dari kolaborator`);
    } catch (e) {
      toast.error("Gagal menghapus", { description: (e as Error).message });
    }
  };

  const createLink = async () => {
    setCreating(true);
    try {
      const link = await api.createShareLink(projectId, linkRole);
      setLinks((prev) => [link, ...prev]);
      toast.success("Link dibuat");
    } catch (e) {
      toast.error("Gagal membuat link", { description: (e as Error).message });
    } finally {
      setCreating(false);
    }
  };

  const revokeLink = async (token: string) => {
    try {
      await api.revokeShareLink(projectId, token);
      setLinks((prev) => prev.filter((l) => l.token !== token));
      toast.success("Link dicabut");
    } catch (e) {
      toast.error("Gagal mencabut", { description: (e as Error).message });
    }
  };

  const copyLink = async (token: string) => {
    const url = `${location.origin}/#/share/${token}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link disalin");
    } catch {
      toast.info(url);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Share2 />
          <span className="hidden lg:inline">Share</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="size-4" /> Bagikan project
          </DialogTitle>
          <DialogDescription>
            Undang kolaborator atau buat link publik untuk berbagi.
          </DialogDescription>
        </DialogHeader>

        {/* Kolaborator */}
        <section className="space-y-3">
          <h4 className="text-sm font-medium">Kolaborator</h4>
          <div className="flex gap-2">
            <Input
              placeholder="email@contoh.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && invite()}
            />
            <Select value={inviteRole} onValueChange={setInviteRole}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Hanya lihat</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={invite} disabled={inviting || !inviteEmail.trim()}>
              {inviting ? <Loader2 className="animate-spin" /> : <UserPlus />}
            </Button>
          </div>

          <div className="space-y-1.5">
            {loading && members.length === 0 && (
              <div className="flex justify-center py-3">
                <Spinner className="text-muted-foreground" />
              </div>
            )}
            {members.map((m) => (
              <div
                key={m.userId}
                className="flex items-center gap-2.5 rounded-md border px-2.5 py-1.5"
              >
                <Avatar className="size-7">
                  <AvatarFallback className="text-[10px]">
                    {initials(m.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {m.email}
                  </p>
                </div>
                {m.role === "owner" ? (
                  <Badge variant="secondary">{ROLE_LABEL.owner}</Badge>
                ) : (
                  <>
                    <Select
                      value={m.role}
                      onValueChange={(v) => changeRole(m.userId, v)}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="viewer">Hanya lihat</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive"
                      onClick={() => removeMember(m.userId, m.name)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>
        </section>

        <Separator />

        {/* Link publik */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">Link publik</h4>
            <div className="flex items-center gap-2">
              <Select value={linkRole} onValueChange={setLinkRole}>
                <SelectTrigger className="h-8 w-32 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Hanya lihat</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="secondary" onClick={createLink} disabled={creating}>
                {creating ? <Loader2 className="animate-spin" /> : <Link2 />}
                Buat link
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            {links.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Belum ada link publik.
              </p>
            )}
            {links.map((l) => (
              <div
                key={l.token}
                className="flex items-center gap-2 rounded-md border px-2.5 py-1.5"
              >
                <Badge variant="outline" className="shrink-0">
                  {ROLE_LABEL[l.role] ?? l.role}
                </Badge>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted-foreground">
                  /#/share/{l.token}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  title="Salin link"
                  onClick={() => copyLink(l.token)}
                >
                  <Copy className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7 text-destructive"
                  title="Cabut link"
                  onClick={() => revokeLink(l.token)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </section>
      </DialogContent>
    </Dialog>
  );
}
