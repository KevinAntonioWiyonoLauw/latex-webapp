/**
 * Launcher untuk collab server.
 *
 * Hocuspocus 4 memakai crossws yang MENOLAK berjalan di Bun (butuh adapter
 * Node asli). Saat dijalankan via `bun run`, Bun memasang shim `node` di PATH
 * sehingga `node` ter-intercept ke Bun. Skrip ini menghapus shim tersebut lalu
 * menjalankan Node asli untuk server collab.
 *
 * Dijalankan dengan: bun run scripts/collab-launcher.ts [--watch]
 */
import path from "node:path";
import fs from "node:fs";
import { spawn } from "node:child_process";

// Bersihkan PATH dari folder shim bun-node-*.
const sep = process.platform === "win32" ? ";" : ":";
const cleanPath = (process.env.PATH ?? "")
  .split(sep)
  .filter((p) => !/bun-node-[0-9a-f]+\/?$/i.test(p.replace(/\\/g, "/")))
  .join(sep);

// Cari node asli (bukan shim). Utamakan NVM_SYMLINK & lokasi umum.
function findRealNode(): string {
  const fromEnv = process.env.NVM_SYMLINK
    ? path.join(process.env.NVM_SYMLINK, "node.exe")
    : "";
  const fromNvmHome = process.env.NVM_HOME
    ? path.join(process.env.NVM_HOME, "nodejs", "node.exe")
    : "";
  const candidates = [
    fromEnv,
    "C:\\nvm4w\\nodejs\\node.exe",
    fromNvmHome,
  ].filter(Boolean);
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch {
      /* ignore */
    }
  }
  return "node"; // fallback: andalkan PATH bersih
}

const nodeBin = findRealNode();
console.log(`[collab-launcher] memakai node: ${nodeBin}`);
const args = ["--experimental-strip-types"];
if (process.argv.includes("--watch")) args.push("--watch");
args.push(path.resolve("collab/src/index.ts"));

const child = spawn(nodeBin, args, {
  stdio: "inherit",
  env: { ...process.env, PATH: cleanPath },
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
