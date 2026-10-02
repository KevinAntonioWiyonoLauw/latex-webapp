import { LogOut, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import { authClient, useSession } from "@/auth/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function UserMenu({ onSignedOut }: { onSignedOut: () => void }) {
  const { data: session } = useSession();
  const user = session?.user;

  const onSignOut = async () => {
    await authClient.signOut();
    toast.success("Berhasil keluar");
    onSignedOut();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="size-8 rounded-full">
          <Avatar className="size-7">
            {user?.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
            <AvatarFallback className="text-[10px]">
              {user ? initials(user.name) : <UserIcon className="size-3.5" />}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="truncate text-sm font-medium">
              {user?.name ?? "Pengguna"}
            </span>
            <span className="truncate text-xs font-normal text-muted-foreground">
              {user?.email ?? ""}
            </span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onSignOut}>
          <LogOut />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
