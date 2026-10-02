import { useEffect, useState } from "react";
import { useSession } from "./auth/client";
import { useSettings } from "./store/settings";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import { Workspace } from "./components/Workspace";
import { SharePage } from "./components/SharePage";
import { Spinner } from "@/components/ui/spinner";

/** Router sederhana berbasis hash: #/project/<id>, #/share/<token> */
export function App() {
  const { data: session, isPending } = useSession();
  const theme = useSettings((s) => s.theme);
  const [route, setRoute] = useState(() => location.hash);

  useEffect(() => {
    const onHash = () => setRoute(location.hash);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // Terapkan tema ke root (shadcn dark class).
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  // Halaman share publik: bisa diakses tanpa login.
  const shareMatch = /^#\/share\/([\w-]+)/.exec(route);
  if (shareMatch) {
    return <SharePage token={shareMatch[1]} key={shareMatch[1]} />;
  }

  if (isPending) {
    return (
      <div className="flex min-h-full items-center justify-center bg-background">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    );
  }

  if (!session?.user) {
    return <AuthPage onSuccess={() => {}} />;
  }

  const m = /^#\/project\/([\w-]+)/.exec(route);
  if (m) {
    return <Workspace projectId={m[1]} key={m[1]} />;
  }
  return <Dashboard />;
}

export function navigate(path: string): void {
  location.hash = path;
}
