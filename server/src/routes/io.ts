import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import AdmZip from "adm-zip";
import type { FastifyInstance } from "fastify";
import { nanoid } from "nanoid";
import type { Storage } from "../storage/index.js";
import { BLOCKED_EXTENSIONS, MAX_UPLOAD_BYTES } from "../config.js";
import { projectRepo } from "../db/projects.repo.js";
import { currentUser } from "../auth/middleware.js";

const execFileAsync = promisify(execFile);

function extOf(p: string): string {
  const i = p.lastIndexOf(".");
  return i >= 0 ? p.slice(i).toLowerCase() : "";
}

/** Buang prefix folder umum pada entri zip (mis. "myproject/"). */
function detectCommonRoot(entries: string[]): string {
  const parts = entries.map((e) => e.split("/")[0]);
  const first = parts[0];
  if (first && parts.every((p) => p === first) && entries.some((e) => e.includes("/"))) {
    return first;
  }
  return "";
}

export async function ioRoutes(
  app: FastifyInstance,
  storage: Storage,
): Promise<void> {

  /** Import project dari zip. */
  app.post<{ Querystring: { name?: string } }>(
    "/api/projects/import",
    async (req, reply) => {
      const user = currentUser(req);
      const data = await req.file();
      if (!data) return reply.code(400).send({ error: "File zip tidak ada" });
      const buf = await data.toBuffer();
      if (buf.length > MAX_UPLOAD_BYTES)
        return reply.code(413).send({ error: "Zip terlalu besar" });

      let zip: AdmZip;
      try {
        zip = new AdmZip(buf);
      } catch {
        return reply.code(400).send({ error: "Zip tidak valid" });
      }

      const entries = zip
        .getEntries()
        .filter((e) => !e.isDirectory)
        .map((e) => e.entryName.replace(/\\/g, "/"));

      const root = detectCommonRoot(entries);
      // Validasi keamanan
      for (const name of entries) {
        if (name.includes("..") || name.startsWith("/")) {
          return reply.code(400).send({ error: "Zip berisi path tidak aman" });
        }
        if (BLOCKED_EXTENSIONS.has(extOf(name))) {
          return reply
            .code(400)
            .send({ error: `Ekstensi terlarang: ${name}` });
        }
      }

      const projectName =
        req.query.name ||
        (root || "Imported").replace(/[^\w.-]+/g, "_");

      const id = nanoid(12);
      await projectRepo.create({
        id,
        ownerId: user.id,
        name: projectName,
        rootFile: "main.tex",
      });
      await storage.ensureProjectDirs(id);

      let mainTex = "";
      for (const entry of zip.getEntries()) {
        if (entry.isDirectory) continue;
        let rel = entry.entryName.replace(/\\/g, "/");
        if (root && rel.startsWith(root + "/")) rel = rel.slice(root.length + 1);
        if (!rel) continue;
        if (BLOCKED_EXTENSIONS.has(extOf(rel))) continue;
        const content = entry.getData();
        await storage.writeFileBuffer(id, rel, content);
        if (!mainTex && rel.toLowerCase().endsWith(".tex")) {
          const text = content.toString("utf8");
          if (/\\documentclass/.test(text)) mainTex = rel;
        }
      }
      if (!mainTex) {
        const tree = await storage.tree(id);
        const first = findFirstTex(tree);
        if (first) mainTex = first;
      }
      const updated = await projectRepo.update(id, {
        rootFile: mainTex || "main.tex",
      });

      return reply.code(201).send({ project: updated });
    },
  );

  /** Export project sebagai zip. */
  app.get<{ Params: { id: string } }>(
    "/api/projects/:id/export",
    async (req, reply) => {
      const user = currentUser(req);
      const p = await projectRepo.getForUser(req.params.id, user.id);
      if (!p) return reply.code(404).send({ error: "Project tidak ditemukan" });
      const ws = storage.workspaceDir(req.params.id);
      const zip = new AdmZip();
      if (fs.existsSync(ws)) zip.addLocalFolder(ws, "");
      const buffer = zip.toBuffer();
      const name = (p.name || "project").replace(/[^\w.-]+/g, "_");
      reply.header("Content-Type", "application/zip");
      reply.header(
        "Content-Disposition",
        `attachment; filename="${name}.zip"`,
      );
      return reply.send(buffer);
    },
  );

  /** Export via pandoc (docx/html). Memakai PDF/sumber yang ada. */
  app.get<{
    Params: { id: string };
    Querystring: { format?: string };
  }>("/api/projects/:id/export/pandoc", async (req, reply) => {
    const user = currentUser(req);
    const project = await projectRepo.getForUser(req.params.id, user.id);
    if (!project) return reply.code(404).send({ error: "Project tidak ditemukan" });

    const format = (req.query.format ?? "docx").toLowerCase();
    const allowed = ["docx", "html", "odt", "pptx", "epub"];
    if (!allowed.includes(format))
      return reply.code(400).send({ error: `Format tidak didukung: ${format}` });

    const pandocBin = process.env.PANDOC_BIN || "pandoc";
    const ws = storage.workspaceDir(req.params.id);
    const rootFile = path.join(ws, project.rootFile);
    const outFile = path.join(
      storage.outputDir(req.params.id),
      `export.${format}`,
    );

    try {
      await execFileAsync(
        pandocBin,
        [rootFile, "-o", outFile, "--standalone"],
        { cwd: ws, maxBuffer: 20 * 1024 * 1024, windowsHide: true },
      );
    } catch (err) {
      return reply.code(500).send({
        error:
          "Gagal menjalankan pandoc. Pastikan pandoc terpasang dan ada di PATH.",
        detail: (err as Error).message,
      });
    }

    const name = (project.name || "document").replace(/[^\w.-]+/g, "_");
    reply.header(
      "Content-Type",
      format === "html" ? "text/html" : "application/octet-stream",
    );
    reply.header(
      "Content-Disposition",
      `attachment; filename="${name}.${format}"`,
    );
    return reply.send(fs.createReadStream(outFile));
  });
}

function findFirstTex(nodes: import("@latex/shared").FileNode[]): string | null {
  for (const n of nodes) {
    if (n.type === "file" && n.path.toLowerCase().endsWith(".tex")) return n.path;
    if (n.type === "dir" && n.children) {
      const r = findFirstTex(n.children);
      if (r) return r;
    }
  }
  return null;
}
