import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { COMPILE_TIMEOUT_MS, TECTONIC_BIN } from "../config.js";

export interface TectonicRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

/**
 * Shim kompatibilitas pdfTeX -> XeTeX.
 *
 * Tectonic memakai engine XeTeX, yang TIDAK punya primitif pdfTeX seperti
 * `\pdfcompresslevel`, `\pdfoptionpdfminorversion`, atau `\pdfgentounicode`.
 * Banyak template kampus (mis. yang memakai paket `axessibility` dengan opsi
 * `accsupp`, seperti template KU Leuven / UGM) memanggil primitif itu TANPA
 * penjaga engine, sehingga compile langsung mati dengan
 * "! Undefined control sequence." di tengah dokumen.
 *
 * Shim ini mendefinisikan primitif tersebut sebagai no-op SEBELUM file utama
 * di-input. Efeknya nol terhadap hasil PDF (opsi-opsi itu hanya menyetel
 * kompresi/penanda aksesibilitas di pdfTeX), tetapi membuat dokumen template
 * tersebut bisa dikompilasi.
 *
 * Semua definisi dibungkus `\ifdefined ... \else ... \fi` agar engine yang
 * memang punya primitif itu (pdfTeX asli) tidak tertimpa.
 *
 * PENTING: JANGAN mendefinisikan `\pdftexversion`, `\pdftexrevision`,
 * `\pdfoutput`, atau `\pdfdraftmode`. Paket seperti `iftex`/`pdftexcmds`
 * memakai penanda itu untuk menyimpulkan "ini pdfTeX", lalu mengambil cabang
 * kode pdfTeX yang memanggil LEBIH BANYAK primitif yang tidak ada di XeTeX —
 * akibatnya compile justru makin rusak. Cukup definisikan primitif yang
 * benar-benar dipanggil tanpa penjaga engine.
 */
const PDFTEX_SHIM = [
  "\\ifdefined\\pdfcompresslevel\\else\\newcount\\pdfcompresslevel\\fi",
  "\\ifdefined\\pdfoptionpdfminorversion\\else\\newcount\\pdfoptionpdfminorversion\\fi",
  "\\ifdefined\\pdfminorversion\\else\\newcount\\pdfminorversion\\fi",
  "\\ifdefined\\pdfobjcompresslevel\\else\\newcount\\pdfobjcompresslevel\\fi",
  "\\ifdefined\\pdfgentounicode\\else\\newcount\\pdfgentounicode\\fi",
  "\\ifdefined\\pdfsuppressptexinfo\\else\\newcount\\pdfsuppressptexinfo\\fi",
  "\\ifdefined\\pdfglyphtounicode\\else\\def\\pdfglyphtounicode#1#2{}\\fi",
  "\\ifdefined\\pdfcatalog\\else\\def\\pdfcatalog#1{}\\fi",
  "\\ifdefined\\pdfextension\\else\\def\\pdfextension#1{}\\fi",
].join("\n");

/**
 * Jalankan tectonic pada file root di dalam workspace.
 *
 * Strategi:
 *  1. Coba compile file root APA ADANYA (perilaku lama).
 *  2. Bila gagal, compile ulang lewat shim yang dikirim via STDIN (lihat
 *     `runWrapped`). Shim ini (a) mendefinisikan primitif pdfTeX yang hilang,
 *     dan (b) membuat direktori basis = root workspace — sehingga file
 *     pendukung di root (mis. `kultem.sty`) DAN sub-folder
 *     (mis. `contents/Bab1.tex`) dua-duanya bisa ditemukan.
 *
 * Output (pdf, synctex, log) ditulis ke `outDir`.
 */
export async function runTectonic(opts: {
  rootFile: string; // path absolut file .tex utama
  workspaceDir: string; // cwd untuk resolusi relative path
  outDir: string; // folder output
  onSpawn?: (child: import("node:child_process").ChildProcess) => void;
}): Promise<TectonicRunResult> {
  const direct = await runOnce(opts, opts.rootFile, opts.outDir);
  if (direct.exitCode === 0 && !direct.timedOut) {
    // Tectonic menamai output mengikuti nama file root (mis. `thesis.pdf`),
    // sedangkan route PDF selalu membaca `main.pdf`. Normalkan namanya.
    await normalizeOutputs(opts.outDir, path.basename(opts.rootFile));
    return direct;
  }

  // Compile gagal — coba lagi lewat shim, tapi hanya bila masuk akal
  // (mis. error "not found" / undefined control sequence), bukan timeout.
  if (direct.timedOut) return direct;

  const wrapped = await runWrapped(opts);
  if (wrapped) return wrapped;
  return direct;
}

/**
 * Pastikan file output bernama `main.*` seperti yang diharapkan storage.
 * Bila `main.pdf` sudah ada, tidak melakukan apa-apa.
 */
async function normalizeOutputs(outDir: string, baseName: string): Promise<void> {
  if (fs.existsSync(path.join(outDir, "main.pdf"))) return;
  const base = baseName.replace(/\.tex$/i, "");
  const pairs: [string, string][] = [
    [`${base}.pdf`, "main.pdf"],
    [`${base}.log`, "main.log"],
    [`${base}.synctex.gz`, "main.synctex.gz"],
    [`${base}.synctex`, "main.synctex"],
  ];
  for (const [from, to] of pairs) {
    const src = path.join(outDir, from);
    const dst = path.join(outDir, to);
    try {
      if (fs.existsSync(src)) await fsp.rename(src, dst);
    } catch {
      /* ignore */
    }
  }
}

/** Jalankan tectonic sekali pada input tertentu. */
function runOnce(
  opts: {
    workspaceDir: string;
    onSpawn?: (child: import("node:child_process").ChildProcess) => void;
  },
  input: string,
  outDir: string,
): Promise<TectonicRunResult> {
  return new Promise((resolve) => {
    const args = [
      "-X",
      "compile",
      input,
      "--synctex",
      "--keep-logs",
      "--outdir",
      outDir,
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

/**
 * Compile lewat shim yang dikirim via STDIN (tanpa menyentuh workspace user).
 *
 * Kenapa shim ini perlu — dua masalah nyata pada template kampus:
 *
 *  1. RESOLUSI FILE. Tectonic mencari file pendukung relatif ke direktori
 *     file UTAMA, bukan `cwd`. Untuk project yang root file-nya di sub-folder
 *     (mis. `contents/Makalah.tex`) sementara `.sty` template ada di root
 *     project (mis. `kultem.sty`), file itu jadi "not found". Dengan meng-input
 *     dari stdin, direktori basis menjadi `cwd` (= root workspace) sehingga
 *     file di root DAN di sub-folder dua-duanya ditemukan.
 *
 *  2. PRIMITIF pdfTeX. Tectonic memakai XeTeX yang tidak punya
 *     `\pdfcompresslevel`, `\pdfoptionpdfminorversion`, `\pdfgentounicode`,
 *     `\pdfglyphtounicode`, dst. Template yang memakai paket `axessibility`
 *     (opsi `accsupp`) memanggilnya tanpa penjaga engine → compile mati di
 *     tengah dokumen. Shim mendefinisikannya sebagai no-op.
 *
 * Output shim (`texput.*`) dinamai ulang menjadi `main.*` agar sesuai yang
 * diharapkan storage. Bila shim juga gagal, hasil percobaan pertama
 * dikembalikan supaya pesan error aslinya tetap terlihat user.
 */
async function runWrapped(opts: {
  rootFile: string;
  workspaceDir: string;
  outDir: string;
  onSpawn?: (child: import("node:child_process").ChildProcess) => void;
}): Promise<TectonicRunResult | null> {
  const rel = path.relative(opts.workspaceDir, opts.rootFile);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;

  const relPosix = rel.split(path.sep).join("/");
  const body = [
    "% Shim sementara (dikirim via stdin, tidak ditulis ke workspace).",
    PDFTEX_SHIM,
    `\\input{${relPosix}}`,
    "",
  ].join("\n");

  const tmpOut = path.join(opts.outDir, ".shim");
  try {
    await fsp.rm(tmpOut, { recursive: true, force: true });
    await fsp.mkdir(tmpOut, { recursive: true });
  } catch {
    return null;
  }

  try {
    const res = await runStdin(opts, body, tmpOut);
    if (res.exitCode === 0 && !res.timedOut) {
      await moveOutputs(tmpOut, opts.outDir, "texput");
      return res;
    }
    return null;
  } finally {
    try {
      await fsp.rm(tmpOut, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

/** Jalankan tectonic dengan sumber dokumen dikirim lewat stdin (`-`). */
function runStdin(
  opts: {
    workspaceDir: string;
    onSpawn?: (child: import("node:child_process").ChildProcess) => void;
  },
  source: string,
  outDir: string,
): Promise<TectonicRunResult> {
  return new Promise((resolve) => {
    const args = [
      "-X",
      "compile",
      "-",
      "--synctex",
      "--keep-logs",
      "--outdir",
      outDir,
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

    // Kirim dokumen ke stdin lalu tutup.
    try {
      child.stdin?.end(source);
    } catch {
      /* ignore */
    }
  });
}

/** Pindahkan `<base>.pdf|.log|.synctex.gz` dari tmp ke outDir sebagai `main.*`. */
async function moveOutputs(
  tmpDir: string,
  outDir: string,
  base: string,
): Promise<void> {
  const pairs: [string, string][] = [
    [`${base}.pdf`, "main.pdf"],
    [`${base}.log`, "main.log"],
    [`${base}.synctex.gz`, "main.synctex.gz"],
    [`${base}.synctex`, "main.synctex"],
  ];
  for (const [from, to] of pairs) {
    const src = path.join(tmpDir, from);
    const dst = path.join(outDir, to);
    try {
      if (fs.existsSync(src)) await fsp.rename(src, dst);
    } catch {
      /* ignore */
    }
  }
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
