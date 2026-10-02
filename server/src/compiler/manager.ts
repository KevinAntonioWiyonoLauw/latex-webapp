import path from "node:path";
import type { CompileResult, ServerEvent } from "@latex/shared";
import { Storage } from "../storage/index.js";
import { projectRepo } from "../db/projects.repo.js";
import { runTectonic } from "./tectonic.js";
import { firstErrorMessage, parseLog } from "./logParser.js";

type EventListener = (event: ServerEvent) => void;

interface JobState {
  running: boolean;
  pending: boolean;
  aborted: boolean;
  last?: CompileResult;
  child?: import("node:child_process").ChildProcess;
}

/**
 * Manajer compile: menjamin satu compile berjalan per project,
 * mendukung cancel (compile baru membatalkan yang lama via flag),
 * dan membroadcast event ke listener (WebSocket).
 */
export class CompilerManager {
  private readonly jobs = new Map<string, JobState>();
  private readonly listeners = new Set<EventListener>();
  /** Callback opsional dipanggil setelah compile sukses (mis. snapshot git). */
  private onSuccess: ((projectId: string) => void | Promise<void>) | null = null;

  constructor(private readonly storage: Storage) {}

  /** Daftarkan callback setelah compile sukses. */
  setOnSuccess(fn: (projectId: string) => void | Promise<void>): void {
    this.onSuccess = fn;
  }

  /** Tambah listener event (WebSocket). */
  onEvent(fn: EventListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(event: ServerEvent): void {
    for (const fn of this.listeners) {
      try {
        fn(event);
      } catch {
        /* ignore listener error */
      }
    }
  }

  /** Hasil terakhir sebuah project. */
  lastResult(projectId: string): CompileResult | undefined {
    return this.jobs.get(projectId)?.last;
  }

  isRunning(projectId: string): boolean {
    return this.jobs.get(projectId)?.running ?? false;
  }

  /** Batalkan compile yang sedang berjalan (kill proses). */
  cancel(projectId: string): boolean {
    const job = this.jobs.get(projectId);
    if (!job || !job.running) return false;
    job.aborted = true;
    job.pending = false;
    try {
      job.child?.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    return true;
  }

  /**
   * Minta compile. Jika sedang berjalan, tandai pending agar dijalankan ulang
   * setelah selesai (coalescing).
   */
  async request(projectId: string): Promise<void> {
    const job = this.jobs.get(projectId) ?? {
      running: false,
      pending: false,
      aborted: false,
    };
    this.jobs.set(projectId, job);

    if (job.running) {
      job.pending = true;
      return;
    }
    await this.runLoop(projectId, job);
  }

  private async runLoop(projectId: string, job: JobState): Promise<void> {
    job.running = true;
    try {
      do {
        job.pending = false;
        await this.execute(projectId, job);
      } while (job.pending && !job.aborted);
    } finally {
      job.running = false;
    }
  }

  private async execute(projectId: string, job: JobState): Promise<void> {
    const meta = await projectRepo.getById(projectId);
    if (!meta) {
      const result: CompileResult = {
        projectId,
        status: "error",
        outputVersion: 0,
        startedAt: Date.now(),
        finishedAt: Date.now(),
        logs: [],
        errorMessage: "Project tidak ditemukan",
        hasPdf: false,
      };
      job.last = result;
      this.emit({ type: "compile:finished", projectId, result });
      return;
    }

    const startedAt = Date.now();
    this.emit({ type: "compile:started", projectId, startedAt });

    const workspaceDir = this.storage.workspaceDir(projectId);
    const outDir = this.storage.outputDir(projectId);
    const rootFile = path.join(workspaceDir, meta.rootFile);

    const run = await runTectonic({
      rootFile,
      workspaceDir,
      outDir,
      onSpawn: (child) => {
        job.child = child;
      },
    });
    job.child = undefined;

    // Baca log (tectonic menulis main.log; juga pakai stderr).
    let rawLog = "";
    try {
      const logFile = this.storage.logPath(projectId);
      const fs = await import("node:fs/promises");
      rawLog = await fs.readFile(logFile, "utf8");
    } catch {
      rawLog = "";
    }
    const combined = `${run.stderr}\n${rawLog}`;
    const logs = parseLog(combined);

    const success = run.exitCode === 0 && !run.timedOut;
    let errorMessage: string | undefined;
    if (!success) {
      if (run.timedOut) errorMessage = "Compile timeout";
      else errorMessage = firstErrorMessage(logs) ?? "Compile gagal";
    }

    let outputVersion = meta.outputVersion;
    if (success) {
      outputVersion = await projectRepo.bumpOutputVersion(projectId);
      // Snapshot riwayat revisi (git) setelah compile sukses.
      if (this.onSuccess) {
        try {
          await this.onSuccess(projectId);
        } catch {
          /* jangan gagalkan compile karena snapshot */
        }
      }
    }

    const result: CompileResult = {
      projectId,
      status: success ? "success" : "error",
      outputVersion,
      startedAt,
      finishedAt: Date.now(),
      durationMs: run.durationMs,
      logs,
      errorMessage,
      hasPdf: success ? true : meta.hasPdf,
    };

    job.last = result;
    for (const entry of logs.slice(0, 50)) {
      this.emit({ type: "compile:log", projectId, entry });
    }
    this.emit({ type: "compile:finished", projectId, result });
  }
}
