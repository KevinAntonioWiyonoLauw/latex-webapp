import { lazy, Suspense, useEffect, useState } from "react";
import { useSession } from "./auth/client";
import { useSettings } from "./store/settings";
import { AuthPage } from "./components/AuthPage";
import { Dashboard } from "./components/Dashboard";
import { Spinner } from "@/components/ui/spinner";

/**
 * Workspace & SharePage di-lazy-load karena keduanya menarik Monaco Editor
 * (~3 MB) dan PDF.js. Tanpa ini, halaman login/dashboard ikut memuatnya
 * sehingga pembukaan awal terasa lambat — terutama di jaringan mobile.
 */
const Workspace = lazy(() =>
  import("./components/Workspace").then((m) => ({ default: m.Workspace })),
);
const SharePage = lazy(() =>
  import("./components/SharePage").then((m) => ({ default: m.SharePage })),
);

function Loading() {
  return (
    <div className="flex min-h-full items-center justify-center bg-background">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  );
}

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
    return (
      <Suspense fallback={<Loading />}>
        <SharePage token={shareMatch[1]} key={shareMatch[1]} />
      </Suspense>
    );
  }

  if (isPending) {
    return <Loading />;
  }

  if (!session?.user) {
    return <AuthPage onSuccess={() => {}} />;
  }

  const m = /^#\/project\/([\w-]+)/.exec(route);
  if (m) {
    return (
      <Suspense fallback={<Loading />}>
        <Workspace projectId={m[1]} key={m[1]} />
      </Suspense>
    );
  }
  return <Dashboard />;
}

export function navigate(path: string): void {
  location.hash = path;
}
