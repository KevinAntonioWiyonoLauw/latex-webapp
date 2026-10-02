import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SettingsState {
  /** Tema aplikasi & editor. */
  theme: "dark" | "light";
  /** Auto-compile setelah edit idle. */
  autoCompile: boolean;
  /** Delay debounce auto-compile (ms). */
  autoCompileDelay: number;
  /** Ukuran font editor. */
  fontSize: number;
  /** Ukuran tab (spasi). */
  tabSize: number;
  /** Word wrap. */
  wordWrap: boolean;
  /** Tampilkan minimap. */
  minimap: boolean;
  /** Tampilkan nomor baris. */
  lineNumbers: boolean;
  /** Aktifkan kolaborasi realtime. */
  collabEnabled: boolean;

  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: "dark",
      autoCompile: false,
      autoCompileDelay: 2500,
      fontSize: 13,
      tabSize: 2,
      wordWrap: true,
      minimap: false,
      lineNumbers: true,
      collabEnabled: true,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
    }),
    { name: "latex-settings" },
  ),
);
