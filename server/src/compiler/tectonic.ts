import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { COMPILE_TIMEOUT_MS, TECTONIC_BIN } from "../config.js";

export interface TectonicRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Jalankan tectonic pada file root di dalam workspace.
 * Output (pdf, synctex, log) ditulis ke `outDir`.
 */
export function runTectonic(opts: {
  rootFile: string; // path absolut file .tex utama
  workspaceDir: string; // cwd untuk resolusi relative path
  outDir: string; // folder output
  onSpawn?: (child: import("node:child_process").ChildProcess) => void;
}): Promise<TectonicRunResult> {
  return new Promise((resolve) => {
    const args = [
      "-X",
      "compile",
      opts.rootFile,
      "--synctex",
      "--keep-logs",
      "--outdir",
      opts.outDir,
      "--untrusted",
    ];

    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = spawn(TECTONIC_BIN, args, {
      cwd: opts.workspaceDir,
      windowsHide: true,
      env: { ...process.env },
    });
    opts.onSpawn?.(child);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, COMPILE_TIMEOUT_MS);

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout,
        stderr: stderr + `\n[spawn error] ${err.message}`,
        timedOut,
        durationMs: Date.now() - start,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: code,
        stdout,
        stderr,
        timedOut,
        durationMs: Date.now() - start,
      });
    });
  });
}

/** Apakah binary tectonic tersedia. */
export function tectonicAvailable(): boolean {
  try {
    return fs.existsSync(TECTONIC_BIN);
  } catch {
    return false;
  }
}

/** Cari file PDF & synctex di outDir. */
export function findOutputs(outDir: string): {
  pdf?: string;
  synctex?: string;
  log?: string;
} {
  const res: { pdf?: string; synctex?: string; log?: string } = {};
  for (const name of ["main.pdf"]) {
    const p = path.join(outDir, name);
    if (fs.existsSync(p)) res.pdf = p;
  }
  for (const name of ["main.synctex.gz", "main.synctex"]) {
    const p = path.join(outDir, name);
    if (fs.existsSync(p)) {
      res.synctex = p;
      break;
    }
  }
  const log = path.join(outDir, "main.log");
  if (fs.existsSync(log)) res.log = log;
  // fallback: ambil file .pdf / .log pertama apa saja
  if (!res.pdf) {
    try {
      const f = fs
        .readdirSync(outDir)
        .find((n) => n.endsWith(".pdf"));
      if (f) res.pdf = path.join(outDir, f);
    } catch {
      /* ignore */
    }
  }
  return res;
}
