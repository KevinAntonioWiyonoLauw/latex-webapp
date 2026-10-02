import { create } from "zustand";
import type {
  CompileResult,
  FileNode,
  LogEntry,
  Project,
} from "@latex/shared";
import { api } from "../api";

export interface EditorTab {
  path: string;
  content: string;
  /** konten telah dimuat. */
  loaded: boolean;
  /** ada perubahan belum tersimpan. */
  dirty: boolean;
  saving: boolean;
}

interface State {
  /* project */
  project: Project | null;
  tree: FileNode[];

  /* editor */
  tabs: EditorTab[];
  activePath: string | null;

  /* compile */
  compiling: boolean;
  result: CompileResult | null;
  pdfVersion: number;

  /* synctex target dari PDF -> source */
  syncTarget: { path: string; line: number; nonce: number } | null;

  /* ------------------------------ actions ---------------------------- */
  loadProject: (id: string) => Promise<void>;
  refreshTree: () => Promise<void>;
  openFile: (path: string) => Promise<void>;
  setFileContent: (path: string, content: string) => void;
  saveFile: (path: string) => Promise<void>;
  closeTab: (path: string) => void;
  setActive: (path: string) => void;
  createFile: (path: string, content?: string) => Promise<void>;
  createFolder: (path: string) => Promise<void>;
  deletePath: (path: string) => Promise<void>;
  uploadFiles: (files: File[], basePath?: string) => Promise<void>;
  setRootFile: (path: string) => Promise<void>;

  compile: () => Promise<void>;
  cancelCompile: () => Promise<void>;
  onCompileStarted: () => void;
  onCompileLog: (entry: LogEntry) => void;
  onCompileFinished: (result: CompileResult) => void;

  jumpToSource: (path: string, line: number) => void;
  clearSyncTarget: () => void;
}

/** Path file yang sedang dalam proses dibuka (cegah duplikasi tab). */
const openInFlight = new Set<string>();

export const useStore = create<State>((set, get) => ({
  project: null,
  tree: [],
  tabs: [],
  activePath: null,
  compiling: false,
  result: null,
  pdfVersion: 0,
  syncTarget: null,

  async loadProject(id) {
    const project = await api.getProject(id);
    set({
      project,
      tabs: [],
      activePath: null,
      result: null,
      pdfVersion: 0,
      compiling: false,
    });
    await get().refreshTree();
    // buka file root otomatis
    await get().openFile(project.rootFile);
    // ambil status compile terakhir
    try {
      const st = await api.compileStatus(id);
      if (st.result) {
        set({ result: st.result, pdfVersion: st.result.outputVersion });
      }
    } catch {
      /* ignore */
    }
  },

  async refreshTree() {
    const p = get().project;
    if (!p) return;
    const tree = await api.getTree(p.id);
    set({ tree });
  },

  async openFile(path) {
    const p = get().project;
    if (!p) return;
    const existing = get().tabs.find((t) => t.path === path);
    if (existing) {
      set({ activePath: path });
      return;
    }
    // Hindari duplikasi saat dua panggilan paralel (React StrictMode / cepat).
    if (openInFlight.has(path)) {
      set({ activePath: path });
      return;
    }
    openInFlight.add(path);
    try {
      const content = await api.readFile(p.id, path);
      set((s) => {
        // cek lagi: mungkin sudah ditambahkan saat menunggu fetch
        if (s.tabs.some((t) => t.path === path)) {
          return { activePath: path };
        }
        return {
          tabs: [
            ...s.tabs,
            { path, content, loaded: true, dirty: false, saving: false },
          ],
          activePath: path,
        };
      });
    } finally {
      openInFlight.delete(path);
    }
  },

  setFileContent(path, content) {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.path === path ? { ...t, content, dirty: true } : t,
      ),
    }));
  },

  async saveFile(path) {
    const p = get().project;
    if (!p) return;
    const tab = get().tabs.find((t) => t.path === path);
    if (!tab || !tab.dirty) return;
    set((s) => ({
      tabs: s.tabs.map((t) => (t.path === path ? { ...t, saving: true } : t)),
    }));
    try {
      await api.writeFile(p.id, path, tab.content);
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path ? { ...t, dirty: false, saving: false } : t,
        ),
      }));
    } catch (err) {
      // Self-heal: server menolak menyimpan (mis. menolak konten kosong karena
      // file di server masih berisi). Kondisi ini muncul bila tab di browser
      // memegang salinan kosong yang basi. Muat ulang isi dari server supaya
      // editor sinkron kembali, bukan terus mencoba menulis kekosongan.
      const msg = err instanceof Error ? err.message : String(err);
      if (/Ditolak|kosong/i.test(msg)) {
        try {
          const fresh = await api.readFile(p.id, path);
          set((s) => ({
            tabs: s.tabs.map((t) =>
              t.path === path
                ? { ...t, content: fresh, dirty: false, saving: false }
                : t,
            ),
          }));
          return;
        } catch {
          /* lanjut ke penanganan error biasa */
        }
      }
      set((s) => ({
        tabs: s.tabs.map((t) =>
          t.path === path ? { ...t, saving: false } : t,
        ),
      }));
      throw err;
    }
  },

  closeTab(path) {
    set((s) => {
      const tabs = s.tabs.filter((t) => t.path !== path);
      let activePath = s.activePath;
      if (activePath === path) {
        activePath = tabs.length ? tabs[tabs.length - 1].path : null;
      }
      return { tabs, activePath };
    });
  },

  setActive(path) {
    set({ activePath: path });
  },

  async createFile(path, content = "") {
    const p = get().project;
    if (!p) return;
    await api.writeFile(p.id, path, content);
    await get().refreshTree();
    await get().openFile(path);
  },

  async createFolder(path) {
    const p = get().project;
    if (!p) return;
    await api.mkdir(p.id, path);
    await get().refreshTree();
  },

  async deletePath(path) {
    const p = get().project;
    if (!p) return;
    await api.deletePath(p.id, path);
    set((s) => ({
      tabs: s.tabs.filter((t) => t.path !== path),
      activePath: s.activePath === path ? null : s.activePath,
    }));
    await get().refreshTree();
  },

  async uploadFiles(files, basePath = "") {
    const p = get().project;
    if (!p) return;
    for (const f of files) {
      const rel = basePath ? `${basePath}/${f.name}` : f.name;
      await api.uploadFile(p.id, rel, f);
    }
    await get().refreshTree();
  },

  async setRootFile(path) {
    const p = get().project;
    if (!p) return;
    const project = await api.updateProject(p.id, { rootFile: path });
    set({ project });
  },

  async compile() {
    const p = get().project;
    if (!p) return;
    // simpan semua tab dirty dulu
    for (const t of get().tabs) {
      if (t.dirty) await get().saveFile(t.path).catch(() => {});
    }
    await api.compile(p.id);
  },

  async cancelCompile() {
    const p = get().project;
    if (!p) return;
    try {
      await api.cancelCompile(p.id);
    } catch {
      /* ignore */
    }
  },

  onCompileStarted() {
    set({ compiling: true });
  },

  onCompileLog(_entry) {
    // log streamed; kita andalkan result akhir untuk daftar lengkap
  },

  onCompileFinished(result) {
    set((s) => ({
      compiling: false,
      result,
      pdfVersion:
        result.status === "success" ? result.outputVersion : s.pdfVersion,
    }));
  },

  jumpToSource(path, line) {
    set({ syncTarget: { path, line, nonce: Date.now() } });
    void get().openFile(path);
  },

  clearSyncTarget() {
    set({ syncTarget: null });
  },
}));
