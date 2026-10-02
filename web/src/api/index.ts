import type {
  CompileResult,
  FileNode,
  Project,
  ProjectMember,
  ShareLink,
  SynctexEditResult,
  SynctexViewResult,
} from "@latex/shared";

/**
 * Base URL backend.
 * Default: relatif ("") -> lewat Vite proxy (dev) atau reverse proxy (prod),
 * sehingga cookie auth bersifat same-origin dan aman.
 */
const BASE = import.meta.env.VITE_API_URL ?? "";

/** fetch dengan cookie (auth) disertakan. */
function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(`${BASE}${path}`, { credentials: "include", ...init });
}

async function json<T>(resPromise: Response | Promise<Response>): Promise<T> {
  const res = await resPromise;
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.error) msg = body.error;
      else if (body.message) msg = body.message;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

const JSON_HEADERS = { "Content-Type": "application/json" };

export const api = {
  /* ----------------------------- projects ----------------------------- */
  listProjects: () =>
    json<{ projects: Project[] }>(apiFetch("/api/projects")).then(
      (r) => r.projects,
    ),

  listTemplates: () =>
    json<{ templates: { id: string; label: string }[] }>(
      apiFetch("/api/templates"),
    ).then((r) => r.templates),

  getProject: (id: string) =>
    json<{ project: Project }>(apiFetch(`/api/projects/${id}`)).then(
      (r) => r.project,
    ),

  createProject: (name: string, template: string) =>
    json<{ project: Project }>(
      apiFetch(`/api/projects`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name, template }),
      }),
    ).then((r) => r.project),

  updateProject: (id: string, patch: { name?: string; rootFile?: string }) =>
    json<{ project: Project }>(
      apiFetch(`/api/projects/${id}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(patch),
      }),
    ).then((r) => r.project),

  deleteProject: (id: string) =>
    json<{ ok: boolean }>(
      apiFetch(`/api/projects/${id}`, { method: "DELETE" }),
    ),

  cloneProject: (id: string, name?: string) =>
    json<{ project: Project }>(
      apiFetch(`/api/projects/${id}/clone`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ name }),
      }),
    ).then((r) => r.project),

  pandocExportUrl: (id: string, format: string) =>
    `${BASE}/api/projects/${id}/export/pandoc?format=${format}`,

  /* ------------------------------- files ------------------------------ */
  getTree: (id: string) =>
    json<{ tree: FileNode[] }>(apiFetch(`/api/projects/${id}/tree`)).then(
      (r) => r.tree,
    ),

  readFile: (id: string, path: string) =>
    json<{ path: string; content: string }>(
      apiFetch(`/api/projects/${id}/file?path=${encodeURIComponent(path)}`),
    ).then((r) => r.content),

  writeFile: (id: string, path: string, content: string) =>
    json<{ ok: boolean }>(
      apiFetch(`/api/projects/${id}/file`, {
        method: "PUT",
        headers: JSON_HEADERS,
        body: JSON.stringify({ path, content }),
      }),
    ),

  mkdir: (id: string, path: string) =>
    json<{ ok: boolean }>(
      apiFetch(`/api/projects/${id}/folder`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ path }),
      }),
    ),

  deletePath: (id: string, path: string) =>
    json<{ ok: boolean }>(
      apiFetch(`/api/projects/${id}/path?path=${encodeURIComponent(path)}`, {
        method: "DELETE",
      }),
    ),

  rename: (id: string, from: string, to: string) =>
    json<{ ok: boolean }>(
      apiFetch(`/api/projects/${id}/rename`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ from, to }),
      }),
    ),

  uploadFile: (id: string, path: string, file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    return json<{ ok: boolean }>(
      apiFetch(`/api/projects/${id}/upload?path=${encodeURIComponent(path)}`, {
        method: "POST",
        body: fd,
      }),
    );
  },

  /** URL file biner (gambar) — cookie dikirim otomatis oleh browser. */
  rawUrl: (id: string, path: string) =>
    `${BASE}/api/projects/${id}/raw?path=${encodeURIComponent(path)}`,

  /* ------------------------------ compile ----------------------------- */
  compile: (id: string) =>
    json<{ ok: boolean; queued: boolean }>(
      apiFetch(`/api/projects/${id}/compile`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: "{}",
      }),
    ),

  compileStatus: (id: string) =>
    json<{ running: boolean; result: CompileResult | null }>(
      apiFetch(`/api/projects/${id}/compile/status`),
    ),

  cancelCompile: (id: string) =>
    json<{ ok: boolean; cancelled: boolean }>(
      apiFetch(`/api/projects/${id}/compile/cancel`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: "{}",
      }),
    ),

  /* ---------------------------- revisions ------------------------------ */
  listRevisions: (id: string) =>
    json<{
      revisions: {
        hash: string;
        message: string;
        author: string;
        date: number;
      }[];
    }>(apiFetch(`/api/projects/${id}/revisions`)).then((r) => r.revisions),

  createRevision: (id: string, message: string) =>
    json<{ ok: boolean; snapshot: unknown }>(
      apiFetch(`/api/projects/${id}/revisions`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ message }),
      }),
    ),

  revisionDiff: (id: string, hash: string) =>
    json<{ diff: string }>(
      apiFetch(`/api/projects/${id}/revisions/${hash}/diff`),
    ).then((r) => r.diff),

  revisionFile: (id: string, hash: string, file: string) =>
    json<{ file: string; content: string }>(
      apiFetch(
        `/api/projects/${id}/revisions/${hash}/file?file=${encodeURIComponent(file)}`,
      ),
    ).then((r) => r.content),

  restoreRevision: (id: string, hash: string) =>
    json<{ ok: boolean }>(
      apiFetch(`/api/projects/${id}/revisions/${hash}/restore`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: "{}",
      }),
    ),

  /* ------------------------------ search ------------------------------- */
  search: (
    id: string,
    q: string,
    opts?: { regex?: boolean; caseSensitive?: boolean },
  ) =>
    json<{
      results: { file: string; line: number; column: number; text: string }[];
      count: number;
    }>(
      apiFetch(
        `/api/projects/${id}/search?q=${encodeURIComponent(q)}&regex=${opts?.regex ?? false}&caseSensitive=${opts?.caseSensitive ?? false}`,
      ),
    ).then((r) => r.results),

  /* ------------------------------- io --------------------------------- */
  importZip: (file: File, name?: string) => {
    const fd = new FormData();
    fd.append("file", file);
    const q = name ? `?name=${encodeURIComponent(name)}` : "";
    return json<{ project: Project }>(
      apiFetch(`/api/projects/import${q}`, { method: "POST", body: fd }),
    ).then((r) => r.project);
  },

  pdfUrl: (id: string, version: number) =>
    `${BASE}/api/projects/${id}/pdf?v=${version}`,

  downloadPdfUrl: (id: string) => `${BASE}/api/projects/${id}/pdf/download`,

  exportUrl: (id: string) => `${BASE}/api/projects/${id}/export`,

  /* ----------------------------- synctex ------------------------------ */
  synctexEdit: (id: string, page: number, x: number, y: number) =>
    json<SynctexEditResult>(
      apiFetch(`/api/projects/${id}/synctex/edit?page=${page}&x=${x}&y=${y}`),
    ),

  synctexView: (id: string, file: string, line: number) =>
    json<SynctexViewResult>(
      apiFetch(
        `/api/projects/${id}/synctex/view?file=${encodeURIComponent(file)}&line=${line}`,
      ),
    ),

  /* ----------------------------- share ---------------------------------- */
  listShareLinks: (id: string) =>
    json<{ links: ShareLink[] }>(apiFetch(`/api/projects/${id}/share`)).then(
      (r) => r.links,
    ),

  createShareLink: (id: string, role: string, expiresInDays?: number) =>
    json<{ link: ShareLink }>(
      apiFetch(`/api/projects/${id}/share`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ role, expiresInDays }),
      }),
    ).then((r) => r.link),

  revokeShareLink: (id: string, token: string) =>
    json<{ ok: boolean }>(
      apiFetch(`/api/projects/${id}/share/${token}`, { method: "DELETE" }),
    ),

  /* ---------------------------- members --------------------------------- */
  listMembers: (id: string) =>
    json<{ members: ProjectMember[] }>(
      apiFetch(`/api/projects/${id}/members`),
    ).then((r) => r.members),

  addMember: (id: string, email: string, role: string) =>
    json<{ members: ProjectMember[] }>(
      apiFetch(`/api/projects/${id}/members`, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ email, role }),
      }),
    ).then((r) => r.members),

  updateMemberRole: (id: string, userId: string, role: string) =>
    json<{ members: ProjectMember[] }>(
      apiFetch(`/api/projects/${id}/members/${userId}`, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify({ role }),
      }),
    ).then((r) => r.members),

  removeMember: (id: string, userId: string) =>
    json<{ ok: boolean }>(
      apiFetch(`/api/projects/${id}/members/${userId}`, { method: "DELETE" }),
    ),

  /* --------------------------- public share ----------------------------- */
  shareMeta: (token: string) =>
    json<{
      project: {
        id: string;
        name: string;
        rootFile: string;
        outputVersion: number;
        hasPdf: boolean;
        updatedAt: number;
      };
      role: string;
    }>(apiFetch(`/api/share/${token}`)),

  shareTree: (token: string) =>
    json<{ tree: FileNode[] }>(apiFetch(`/api/share/${token}/tree`)).then(
      (r) => r.tree,
    ),

  shareReadFile: (token: string, path: string) =>
    json<{ path: string; content: string }>(
      apiFetch(`/api/share/${token}/file?path=${encodeURIComponent(path)}`),
    ).then((r) => r.content),

  sharePdfUrl: (token: string, version: number) =>
    `${BASE}/api/share/${token}/pdf?v=${version}`,

  shareSynctexView: (token: string, file: string, line: number) =>
    json<SynctexViewResult>(
      apiFetch(
        `/api/share/${token}/synctex/view?file=${encodeURIComponent(file)}&line=${line}`,
      ),
    ),
};
