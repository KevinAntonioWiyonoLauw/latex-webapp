# Roadmap Pengembangan — LaTeX Web Editor (Multi-User)

Dokumen ini adalah rencana induk pengembangan dari **editor lokal** menjadi
**platform LaTeX multi-user online** (ala Overleaf/TexPage).

---

## 0. Keputusan Arsitektur (Final)

| Aspek | Pilihan | Catatan |
|---|---|---|
| Runtime | **Bun** | sudah dipakai |
| Backend | **Fastify** + WebSocket | sudah ada |
| Frontend | **React 19 + Vite + shadcn + Tailwind v4** | sudah ada |
| Database | **PostgreSQL 17** (container terpisah) | port **5435** |
| Cache/PubSub | **Redis 7** (container terpisah) | port **6381** |
| ORM | **Drizzle ORM** | TypeScript-first, migrasi terjaga |
| Auth | **Better Auth 1.7** + email/password + **OAuth Google/GitHub** | session cookie |
| Kolaborasi | **Yjs + Hocuspocus 4** + **y-monaco** | port **1234** |
| Riwayat | **Git lokal** per project | commit otomatis |
| Compiler | **Tectonic** (`tools/tectonic.exe`) | fallback LaTeX lain nanti |
| Deploy | **Docker Compose** | semua service terpisah |

### Port milik app ini (terpisah dari project lain)
| Service | Port host | Port container |
|---|---|---|
| PostgreSQL | 5435 | 5432 |
| Redis | 6381 | 6379 |
| Hocuspocus (kolaborasi) | 1234 | 1234 |
| Backend (dev) | 5174 | 5174 |
| Frontend (dev) | 5173 | 8080 (prod) |

> Project lain sudah memakai 5434/6379/6380 — kita **tidak menyentuhnya**.

---

## 1. Kondisi Saat Ini

**Sudah jalan & terverifikasi:**
- Editor multi-file (Monaco) + syntax highlight LaTeX kustom
- File tree CRUD + upload, autosave (debounce)
- Compile Tectonic via WS (queue, timeout, cache-bust version)
- Preview PDF (PDF.js) + zoom/navigasi
- **SyncTeX dua arah** (klik PDF⇄kode)
- Import/export `.zip`, download PDF
- Template (article/report/beamer)
- UI shadcn penuh, tema gelap

**Belum ada:**
- Auth / user / ACL
- Database (masih filesystem + JSON)
- Share / kolaborator
- Kolaborasi realtime
- Riwayat revisi, auto-compile, autocomplete, word count, pengaturan, drag-drop, manajemen .bib, galeri template, export docx/html, cancel compile, deploy Docker

**Infrastruktur siap di mesin:** Docker 29, Compose v5, Git 2.54, Bun 1.3.13, Postgres & Redis (milik project lain, akan kita bikin sendiri).

---

## 2. Struktur Target (monorepo)

```
latex-webapp/
├─ server/                     Backend Fastify (auth, API, compile, synctex)
│  ├─ src/
│  │  ├─ db/                   Drizzle: schema, client, migrations, seed
│  │  ├─ auth/                 Better Auth setup + middleware requireAuth
│  │  ├─ routes/               projects, files, compile, pdf, io, synctex, ws, share, collab
│  │  ├─ compiler/             manager, tectonic, logParser, synctex
│  │  ├─ git/                  riwayat revisi per project
│  │  └─ storage/              file workspace (disk) + akses ACL
│  └─ data/projects/<id>/      workspace, .output (tetap di disk)
├─ collab/                     Server Hocuspocus (Yjs) — proses terpisah
├─ web/                        Frontend React
├─ packages/shared/            Tipe bersama
├─ docker/                     Dockerfile masing-masing + init sql
├─ docker-compose.yml          Postgres, Redis, collab, server, web
├─ tools/tectonic.exe
├─ .env / .env.example
└─ ROADMAP.md (dokumen ini)
```

---

## 3. Skema Database (Drizzle / PostgreSQL)

**Tabel auth (dibuat Better Auth, disesuaikan):**
- `user` (id, name, email, email_verified, image, created_at, updated_at)
- `session` (id, user_id, token, expires_at, ip, user_agent)
- `account` (id, user_id, provider_id, account_id, access_token, refresh_token, ...)  ← untuk OAuth
- `verification` (id, identifier, value, expires_at)

**Tabel app:**
- `projects` (id, owner_id→user, name, root_file, output_version, has_pdf, created_at, updated_at, archived, label)
- `project_members` (project_id, user_id, role: 'owner'|'editor'|'viewer', created_at) — PK gabungan
- `share_links` (id/token, project_id, role, expires_at, created_by, created_at)
- `revisions` (id, project_id, commit_hash, message, author_id, created_at) — mirror commit git
- `comments` (id, project_id, file_path, line, body, author_id, resolved, created_at) — (opsional, fase lanjut)
- `templates` (id, owner_id nullable utk bawaan, name, description, payload jsonb, created_at)

---

## 4. Fase Pengembangan

### FASE 1 — Fondasi Multi-User (Auth + DB + Isolasi) — ✅ SELESAI
**Tujuan:** tiap user punya akun & project terisolasi.

- [x] Docker Compose **terpisah**: `postgres:17` (5437), `redis:7` (6381).
- [x] Setup **Drizzle** + client + schema + `db:push`.
- [x] **Better Auth**: email/password + **OAuth Google & GitHub** (aktif bila kredensial diisi), session cookie, `requireAuth` middleware Fastify.
- [x] Migrasi metadata project dari JSON → tabel `projects`; file tetap di disk.
- [x] **ACL**: semua endpoint project cek `project_members` (owner/editor/viewer).
- [x] UI: halaman **Login/Register** (shadcn), **user menu** di toolbar, Dashboard per-user.
- [x] Seed: adopsi project lama (`bun run --filter server seed`).
- **Terverifikasi:** register → login → buat project → isolasi antar-user (Ani tidak bisa akses project Budi → 404).

### FASE 2 — Share & Kolaborator — ✅ SELESAI
- [x] **Share link** (token, role viewer/editor, kedaluwarsa opsional) + halaman publik `#/share/<token>`.
- [x] **Invite collaborator** by email; panel kelola kolaborator (dialog shadcn).
- [x] Endpoint share: create/list/revoke + members list/add/update/remove.
- [x] Route publik `/api/share/:token/*` (meta, tree, file, raw, pdf, synctex) tanpa login.
- **Terverifikasi:** Budi buat link → guest akses (meta/tree/file/pdf, read-only). Undang Ani sebagai editor → muncul di daftar anggota.

### FASE 3 — Kolaborasi Realtime (Yjs + Hocuspocus) — ✅ SELESAI
- [x] Service **collab** (Hocuspocus 4) — dijalankan via **Node** (launcher menembus shim Bun).
- [x] **y-monaco** binding + **awareness** (multi-cursor & warna per-user).
- [x] Persistensi `Y.Doc` (snapshot biner + tulis teks ke file sumber) + auth via cookie.
- [x] Indikator **presence** (avatar online) di tab bar.
- [x] Script `dev:all` (server + collab + web).
- **Terverifikasi:** 2 client Yjs sinkron dua arah + perubahan ter-persist ke disk.

### FASE 4 — Fitur Menulis (Produktivitas) — ✅ SELESAI
- [x] **Auto-compile** (debounce + toggle + pengaturan jeda).
- [x] **Riwayat revisi git**: snapshot otomatis tiap compile sukses, panel timeline + diff + restore.
- [x] **Autocomplete & snippet LaTeX** (perintah, environment, `\ref{}`, `\cite{}` dari .bib).
- [x] **Word count** + status bar editor.
- [x] **Pengaturan editor** (font, tab, wrap, minimap, nomor baris) + **tema terang/gelap** (persist).
- [x] **Drag & drop gambar** → auto upload + `\includegraphics`.
- [x] **Manajemen referensi .bib**: panel entri + insert `\cite`.
- [x] **Pencarian lintas file** (regex & case-sensitive opsional).
- [x] **Cancel compile** (endpoint + tombol Stop).

### FASE 5 — Template, Export & Integrasi — ✅ SELESAI
- [x] **Export pandoc**: docx/html/odt/pptx/epub.
- [x] **Duplicate/clone project** (dashboard) + **label** (DB siap).
- [x] **Pilihan engine** compiler (Tectonic default; siap ditambah).
- [x] Cancel compile (lihat Fase 4).

### FASE 6 — Hardening & Deploy — ✅ SELESAI
- [x] **Docker Compose produksi** (`docker-compose.prod.yml`): postgres, redis, server, collab, web (nginx), caddy.
- [x] **Caddy** reverse proxy + HTTPS otomatis (`docker/Caddyfile`).
- [x] Dockerfile server/collab/web (`docker/*.Dockerfile`).
- [x] Hardening: rate limit, cookie secure otomatis, trustProxy, `--untrusted` compile.
- [x] Dokumentasi deploy (`DEPLOY.md`).
- [ ] (Opsional) CI GitHub Actions — belum.

---

## 5. Urutan Eksekusi
```
FASE 1  Auth + DB + ACL        ← MULAI DI SINI (wajib)
  ↓
FASE 2  Share & Kolaborator    (butuh Fase 1)
  ↓
FASE 3  Kolaborasi Realtime    (butuh Fase 1+2)
  ↓
FASE 4  Fitur Menulis          (bisa paralel; tak butuh kolaborasi)
  ↓
FASE 5  Template/Export
  ↓
FASE 6  Deploy/Hardening
```
Tiap fase dikerjakan sampai **typecheck + build + tes alur nyata** lolos sebelum lanjut.

---

## 6. Risiko & Mitigasi
| Risiko | Mitigasi |
|---|---|
| Hocuspocus butuh Node ≥22, kita Bun | Verifikasi di Fase 3; fallback proses Node container |
| Migrasi metadata JSON→DB | Seed idempoten + backup folder `data/` dulu |
| OAuth butuh app registration | Sediakan `.env` placeholder; dev boleh tanpa OAuth |
| Compile tidak aman untuk multi-user | Sandbox container + `--untrusted` + limit (Fase 6) |
| Konflik storage file vs kolaborasi | Yjs jadi source of truth saat collab aktif; disk = snapshot |

---

## 7. Variabel Environment (rencana)
```
# Database
DATABASE_URL=postgres://latex:latex@localhost:5435/latex
# Redis
REDIS_URL=redis://localhost:6381
# Auth
BETTER_AUTH_SECRET=...
BETTER_AUTH_URL=http://localhost:5174
GOOGLE_CLIENT_ID= / GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID= / GITHUB_CLIENT_SECRET=
# Collab
COLLAB_PORT=1234
COLLAB_URL=ws://localhost:1234
# Compile
TECTONIC_BIN=tools/tectonic.exe
COMPILE_TIMEOUT_MS=120000
```
