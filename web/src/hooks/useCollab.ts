import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import type { editor as MonacoNs } from "monaco-editor";
import { MonacoBinding } from "y-monaco";

/** URL server collab. Dev: langsung ke :1234; produksi: same-origin /collab. */
function collabWsUrl(): string {
  const explicit = import.meta.env.VITE_COLLAB_URL as string | undefined;
  if (explicit) return explicit;
  const proto = location.protocol === "https:" ? "wss:" : "ws:";
  if (import.meta.env.DEV) {
    return `${proto}//${location.hostname}:1234`;
  }
  return `${proto}//${location.host}/collab`;
}

export interface CollabUser {
  name: string;
  color: string;
}

export interface CollabHandle {
  provider: HocuspocusProvider;
  doc: Y.Doc;
  /** Binding baru tersedia setelah provider selesai sync (bisa null). */
  readonly binding: MonacoBinding | null;
  destroy: () => void;
}

/** Warna untuk tiap user (dipilih deterministik dari nama). */
export function colorForUser(seed: string): string {
  const palette = [
    "#f87171",
    "#fb923c",
    "#facc15",
    "#4ade80",
    "#34d399",
    "#22d3ee",
    "#60a5fa",
    "#a78bfa",
    "#f472b6",
  ];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}

/**
 * Buat binding kolaborasi antara Monaco editor & Y.Doc via Hocuspocus.
 * Dokumen: "<projectId>::<filePath>".
 */
export function createCollab(opts: {
  projectId: string;
  file: string;
  editor: MonacoNs.IStandaloneCodeEditor;
  monaco: typeof import("monaco-editor");
  user: CollabUser;
  onStatus?: (status: string) => void;
  onAwareness?: (
    users: { name: string; color: string; clientId: number }[],
  ) => void;
}): CollabHandle {
  const doc = new Y.Doc();
  const provider = new HocuspocusProvider({
    url: collabWsUrl(),
    name: `${opts.projectId}::${opts.file}`,
    document: doc,
    onStatus: ({ status }) => opts.onStatus?.(status),
    onAuthenticationFailed: () => opts.onStatus?.("failed"),
  });

  // Set user awareness (nama + warna) untuk presence & cursor.
  provider.setAwarenessField("user", {
    name: opts.user.name,
    color: opts.user.color,
  });

  const awareness = provider.awareness;
  if (awareness) {
    awareness.on("change", () => {
      const states = awareness.getStates();
      const users: { name: string; color: string; clientId: number }[] = [];
      states.forEach((state, clientId) => {
        const u = state.user as { name?: string; color?: string } | undefined;
        if (u?.name) {
          users.push({
            name: u.name,
            color: u.color ?? colorForUser(u.name),
            clientId,
          });
        }
      });
      opts.onAwareness?.(users);
    });
  }

  const model = opts.editor.getModel();
  if (!model) throw new Error("Monaco model tidak tersedia");

  /**
   * Binding Yjs <-> Monaco HANYA dibuat setelah provider selesai sync.
   *
   * PENTING: `MonacoBinding` langsung memanggil `monacoModel.setValue(ytext)`
   * saat dibuat. Bila dipanggil sebelum sync selesai, `ytext` masih KOSONG,
   * sehingga editor yang sudah berisi dokumen (dari `defaultValue`) akan
   * DIKOSONGKAN. Perubahan kosong itu lalu dikirim ke server dan menimpa
   * file asli menjadi kosong -> kehilangan data.
   */
  let binding: MonacoBinding | null = null;
  const attachBinding = () => {
    if (binding) return;
    const m = opts.editor.getModel();
    if (!m) return;
    binding = new MonacoBinding(
      doc.getText("content"),
      m,
      new Set([opts.editor]),
      awareness ?? undefined,
    );
  };

  if (provider.synced) {
    attachBinding();
  } else {
    const onSynced = () => {
      attachBinding();
      provider.off("synced", onSynced);
    };
    provider.on("synced", onSynced);
  }

  return {
    provider,
    doc,
    get binding() {
      return binding;
    },
    destroy: () => {
      try {
        binding?.destroy();
      } catch {
        /* ignore */
      }
      try {
        provider.destroy();
      } catch {
        /* ignore */
      }
      try {
        doc.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
