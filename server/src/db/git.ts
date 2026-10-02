import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "./index.js";
import { revisions } from "./schema.js";

const execFileAsync = promisify(execFile);

/**
 * Riwayat revisi per project menggunakan Git lokal.
 * Folder git = workspace project. Setiap snapshot = commit.
 */
export class GitHistory {
  constructor(private readonly dataDir: string) {}

  private ws(projectId: string): string {
    return path.join(this.dataDir, projectId, "workspace");
  }

  /** Jalankan git di workspace project. */
  private async git(
    projectId: string,
    args: string[],
  ): Promise<{ stdout: string; stderr: string }> {
    const cwd = this.ws(projectId);
    return execFileAsync("git", args, {
      cwd,
      maxBuffer: 10 * 1024 * 1024,
      windowsHide: true,
    });
  }

  /** Pastikan repo git ada di workspace. */
  async ensureRepo(projectId: string): Promise<void> {
    const ws = this.ws(projectId);
    if (!fs.existsSync(ws)) return;
    if (fs.existsSync(path.join(ws, ".git"))) return;
    try {
      await this.git(projectId, ["init"]);
      await this.git(projectId, ["config", "user.email", "collab@latex.local"]);
      await this.git(projectId, ["config", "user.name", "LaTeX Editor"]);
      // Jangan commit file output.
      fs.writeFileSync(
        path.join(ws, ".gitignore"),
        ".output/\n.collab/\n",
        "utf8",
      );
    } catch (err) {
      console.error("[git] gagal init repo", projectId, err);
    }
  }

  /**
   * Buat snapshot (commit). Mengembalikan hash bila ada perubahan,
   * null bila tidak ada yang berubah.
   */
  async snapshot(
    projectId: string,
    message: string,
    authorId: string | null,
  ): Promise<{ hash: string; message: string; createdAt: number } | null> {
    await this.ensureRepo(projectId);
    const ws = this.ws(projectId);
    if (!fs.existsSync(path.join(ws, ".git"))) return null;

    try {
      await this.git(projectId, ["add", "-A"]);
      // Cek apakah ada perubahan untuk di-commit.
      const { stdout: status } = await this.git(projectId, [
        "status",
        "--porcelain",
      ]);
      if (!status.trim()) return null;

      await this.git(projectId, [
        "commit",
        "-m",
        message || "snapshot",
        "--no-verify",
      ]);
      const { stdout: hashOut } = await this.git(projectId, [
        "rev-parse",
        "HEAD",
      ]);
      const hash = hashOut.trim();

      // Simpan metadata ke DB.
      const id = nanoid(12);
      await db.insert(revisions).values({
        id,
        projectId,
        commitHash: hash,
        message: message || "snapshot",
        authorId,
      });

      return { hash, message, createdAt: Date.now() };
    } catch (err) {
      console.error("[git] snapshot gagal", projectId, err);
      return null;
    }
  }

  /** Daftar revisi dari git log. */
  async list(projectId: string): Promise<
    { hash: string; message: string; author: string; date: number }[]
  > {
    await this.ensureRepo(projectId);
    const ws = this.ws(projectId);
    if (!fs.existsSync(path.join(ws, ".git"))) return [];
    try {
      const { stdout } = await this.git(projectId, [
        "log",
        "--pretty=format:%H%x09%an%x09%at%x09%s",
        "-n",
        "100",
      ]);
      return stdout
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          const [hash, author, at, ...rest] = line.split("\t");
          return {
            hash,
            author,
            date: Number(at) * 1000,
            message: rest.join("\t"),
          };
        });
    } catch {
      return [];
    }
  }

  /** Diff sebuah commit terhadap parent-nya (atau HEAD). */
  async diff(projectId: string, hash: string): Promise<string> {
    try {
      const { stdout } = await this.git(projectId, [
        "show",
        hash,
        "--stat",
        "--patch",
        "--no-color",
      ]);
      return stdout;
    } catch (err) {
      return `Gagal mengambil diff: ${(err as Error).message}`;
    }
  }

  /** Isi file pada sebuah commit. */
  async fileAt(
    projectId: string,
    hash: string,
    file: string,
  ): Promise<string> {
    try {
      const { stdout } = await this.git(projectId, [
        "show",
        `${hash}:${file.replace(/\\/g, "/")}`,
      ]);
      return stdout;
    } catch (err) {
      throw new Error(`Gagal membaca file di revisi: ${(err as Error).message}`);
    }
  }

  /**
   * Pulihkan seluruh workspace ke sebuah commit (soft restore):
   * tulis ulang semua file pada commit itu, lalu commit baru.
   */
  async restore(
    projectId: string,
    hash: string,
    authorId: string | null,
  ): Promise<boolean> {
    await this.ensureRepo(projectId);
    try {
      // checkout isi tree ke working dir (tanpa pindah HEAD)
      await this.git(projectId, ["checkout", hash, "--", "."]);
      await this.snapshot(
        projectId,
        `restore ke revisi ${hash.slice(0, 7)}`,
        authorId,
      );
      return true;
    } catch (err) {
      console.error("[git] restore gagal", projectId, err);
      return false;
    }
  }

  /** Hapus riwayat metadata (dipakai saat project dihapus). */
  async removeForProject(projectId: string): Promise<void> {
    try {
      await db.delete(revisions).where(eq(revisions.projectId, projectId));
    } catch {
      /* ignore */
    }
  }
}
