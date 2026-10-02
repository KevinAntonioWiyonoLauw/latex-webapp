import fsp from "node:fs/promises";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { Storage } from "../storage/index.js";
import { projectRepo } from "../db/projects.repo.js";
import { currentUser } from "../auth/middleware.js";

/** Ekstensi teks yang dicari. */
const TEXT_EXT = new Set([
  ".tex",
  ".bib",
  ".sty",
  ".cls",
  ".def",
  ".cfg",
  ".txt",
  ".md",
]);

export async function searchRoutes(
  app: FastifyInstance,
  storage: Storage,
): Promise<void> {
  /** Pencarian lintas file dalam sebuah project. */
  app.get<{
    Params: { id: string };
    Querystring: { q?: string; caseSensitive?: string; regex?: string };
  }>("/api/projects/:id/search", async (req, reply) => {
    const user = currentUser(req);
    const role = await projectRepo.roleOf(req.params.id, user.id);
    if (!role) return reply.code(404).send({ error: "Project tidak ditemukan" });

    const query = req.query.q ?? "";
    if (!query.trim()) return { results: [], count: 0 };
    if (query.length > 200)
      return reply.code(400).send({ error: "Query terlalu panjang" });

    const caseSensitive = req.query.caseSensitive === "true";
    const useRegex = req.query.regex === "true";

    let matcher: RegExp;
    try {
      const flags = caseSensitive ? "g" : "gi";
      const pattern = useRegex
        ? query
        : query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      matcher = new RegExp(pattern, flags);
    } catch {
      return reply.code(400).send({ error: "Pola regex tidak valid" });
    }

    const ws = storage.workspaceDir(req.params.id);
    const results: {
      file: string;
      line: number;
      column: number;
      text: string;
    }[] = [];

    async function walk(dir: string, rel: string): Promise<void> {
      let entries: import("node:fs").Dirent[];
      try {
        entries = await fsp.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const e of entries) {
        if (e.name.startsWith(".")) continue;
        const abs = path.join(dir, e.name);
        const childRel = rel ? `${rel}/${e.name}` : e.name;
        if (e.isDirectory()) {
          await walk(abs, childRel);
        } else if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (!TEXT_EXT.has(ext)) continue;
          let content: string;
          try {
            content = await fsp.readFile(abs, "utf8");
          } catch {
            continue;
          }
          const lines = content.split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            matcher.lastIndex = 0;
            const m = matcher.exec(lines[i]);
            if (m) {
              results.push({
                file: childRel,
                line: i + 1,
                column: m.index + 1,
                text: lines[i].slice(0, 200),
              });
              if (results.length >= 500) return;
            }
          }
        }
      }
    }

    await walk(ws, "");
    return { results, count: results.length };
  });
}
