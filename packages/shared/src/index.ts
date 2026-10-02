/**
 * Tipe data bersama antara server dan web.
 */

/** Node pada file-tree project. */
export interface FileNode {
  /** Nama file/folder (relatif terhadap parent). */
  name: string;
  /** Path relatif terhadap root project, selalu pakai "/". */
  path: string;
  type: "file" | "dir";
  /** Ukuran bytes (khusus file). */
  size?: number;
  /** Terakhir diubah (epoch ms). */
  mtime?: number;
  /** Anak-anak (khusus dir). */
  children?: FileNode[];
}

/** Metadata project. */
export interface Project {
  id: string;
  name: string;
  /** Path relatif file utama (.tex) yang dipakai untuk compile. */
  rootFile: string;
  createdAt: number;
  updatedAt: number;
}

/** Role anggota project. */
export type MemberRole = "owner" | "editor" | "viewer";

/** Anggota project (kolaborator). */
export interface ProjectMember {
  userId: string;
  role: MemberRole;
  createdAt: number;
  name: string;
  email: string;
  image?: string | null;
}

/** Share link publik. */
export interface ShareLink {
  token: string;
  projectId: string;
  role: string;
  createdBy: string;
  expiresAt: number | null;
  createdAt: number;
}

/** Level pesan dari log compile. */
export type LogLevel = "error" | "warning" | "info";

/** Satu baris pesan hasil parse log. */
export interface LogEntry {
  level: LogLevel;
  message: string;
  /** File sumber terkait (jika bisa dideteksi). */
  file?: string;
  /** Baris sumber terkait (1-based, jika bisa dideteksi). */
  line?: number;
}

/** Status sebuah job compile. */
export type CompileStatus = "queued" | "running" | "success" | "error";

/** Hasil compile lengkap. */
export interface CompileResult {
  projectId: string;
  status: CompileStatus;
  /** Versi output, naik tiap compile sukses (untuk cache-busting PDF). */
  outputVersion: number;
  /** Waktu mulai & selesai (epoch ms). */
  startedAt: number;
  finishedAt?: number;
  /** Durasi ms. */
  durationMs?: number;
  logs: LogEntry[];
  /** Pesan ringkas error (jika status = error). */
  errorMessage?: string;
  /** Ada PDF terbaru yang bisa diambil? */
  hasPdf: boolean;
}

/** Titik SyncTeX hasil query PDF -> source. */
export interface SynctexEditResult {
  file: string;
  line: number;
  column: number;
}

/** Titik SyncTeX hasil query source -> PDF. */
export interface SynctexViewResult {
  page: number;
  /** Koordinat dalam big point (72 dpi). */
  x: number;
  y: number;
  width: number;
  height: number;
}

/* ------------------------- WebSocket events ------------------------- */

export type ServerEvent =
  | { type: "compile:started"; projectId: string; startedAt: number }
  | { type: "compile:log"; projectId: string; entry: LogEntry }
  | {
      type: "compile:finished";
      projectId: string;
      result: CompileResult;
    }
  | { type: "file:changed"; projectId: string; path: string }
  | { type: "error"; message: string };

export type ClientEvent =
  | { type: "subscribe"; projectId: string }
  | { type: "unsubscribe"; projectId: string };
