# LaTeX Web Editor

Aplikasi web untuk menulis, meng-compile, dan mem-preview LaTeX — mirip Overleaf / TexPage,
berjalan **lokal** di komputer Anda.

## Fitur

- **Editor multi-file** dengan syntax highlighting LaTeX (Monaco).
- **File tree**: buat / rename / hapus / upload file & folder.
- **Autosave** (debounce 800ms) + indikator tersimpan.
- **Compile real-time** via WebSocket, dengan panel log error/warning yang bisa diklik.
- **Preview PDF** in-browser (PDF.js) dengan zoom & navigasi halaman.
- **SyncTeX dua arah**:
  - Klik di PDF → lompat ke baris kode.
  - Dari kode → highlight lokasi di PDF (via Ctrl+S lalu sumber jadi target).
- **Import / Export** project sebagai `.zip`.
- **Download PDF** hasil compile.
- Template bawaan: Article, Report, Beamer.

## Arsitektur

```
latex-webapp/
├─ server/          Backend Bun + Fastify (API, WebSocket, compile engine)
├─ web/             Frontend React + Vite + Monaco + PDF.js
├─ packages/shared/ Tipe TypeScript bersama
├─ tools/           Binary tectonic.exe
└─ server/data/projects/<id>/   Workspace tiap project
```

- **Compiler**: [Tectonic](https://tectonic-typesetting.github.io/) (`--synctex`).
- **Runtime**: [Bun](https://bun.sh/).
- **SyncTeX**: parser `.synctex.gz` sendiri (backend), dipetakan ke koordinat PDF.js.

## Prasyarat

1. **Bun** ≥ 1.2 — https://bun.sh
   ```powershell
   # Windows (PowerShell)
   powershell -c "irm bun.sh/install.ps1 | iex"
   ```
2. **Tectonic** — binary sudah disertakan di `tools/tectonic.exe`.
   Jika belum ada, unduh dari https://github.com/tectonic-typesetting/tectonic/releases
   (ambil `tectonic-<versi>-x86_64-pc-windows-msvc.zip`, ekstrak `tectonic.exe` ke `tools/`).

## Menjalankan

```powershell
# 1. Install dependency
bun install

# 2. Jalankan service pendukung (PostgreSQL + Redis) via Docker
docker compose up -d postgres redis

# 3. Siapkan database (buat tabel)
bun run --filter server db:push

# 4. Jalankan backend + frontend sekaligus
bun run dev
```

Buka **http://127.0.0.1:5173** di browser, lalu **daftar akun** baru.

- Frontend (Vite): http://127.0.0.1:5173
- Backend (Bun/Fastify): http://127.0.0.1:5174
- PostgreSQL: localhost:5437 · Redis: localhost:6381

### Menjalankan terpisah

```powershell
bun run dev:server   # hanya backend
bun run dev:web      # hanya frontend
```

### Adopsi project lama (opsional)

Bila sebelumnya sudah ada project di `server/data/projects/` (format lama),
migrasikan ke database:

```powershell
bun run --filter server seed [email-owner]
```

### OAuth (opsional)

Isi `GOOGLE_CLIENT_ID/SECRET` dan/atau `GITHUB_CLIENT_ID/SECRET` di `.env`
untuk mengaktifkan tombol "Lanjut dengan Google/GitHub". Redirect URI:
`{BETTER_AUTH_URL}/api/auth/callback/{google|github}`.

## Konfigurasi (opsional)

Set environment variable sebelum menjalankan:

| Variabel | Default | Keterangan |
|---|---|---|
| `PORT` | `5174` | Port backend |
| `HOST` | `127.0.0.1` | Host bind backend |
| `DATABASE_URL` | `postgres://latex:latex@127.0.0.1:5437/latex` | Koneksi PostgreSQL |
| `REDIS_URL` | `redis://127.0.0.1:6381` | Koneksi Redis |
| `BETTER_AUTH_SECRET` | (dev) | Secret session auth (wajib diganti di produksi) |
| `BETTER_AUTH_URL` | `http://127.0.0.1:5174` | Base URL backend untuk auth |
| `WEB_ORIGIN` | `http://127.0.0.1:5173` | Origin frontend (CORS) |
| `GOOGLE_CLIENT_ID/SECRET` | (kosong) | OAuth Google (opsional) |
| `GITHUB_CLIENT_ID/SECRET` | (kosong) | OAuth GitHub (opsional) |
| `TECTONIC_BIN` | `tools/tectonic.exe` | Path binary tectonic |
| `COMPILE_TIMEOUT_MS` | `120000` | Timeout compile |
| `MAX_UPLOAD_BYTES` | `104857600` | Batas ukuran upload |
| `LATEX_DATA_DIR` | `server/data/projects` | Lokasi penyimpanan file project |
| `VITE_API_URL` | (kosong = proxy) | Override base URL API frontend |
| `VITE_WS_URL` | (otomatis) | Override URL WebSocket frontend |

## Cara Pakai

1. Di dashboard, buat project baru (pilih template) atau import `.zip`.
2. Edit file `.tex` di editor kiri. File root ditandai titik hijau ●.
   Klik ikon ⦿ di file `.tex` lain untuk menjadikannya file root.
3. Tekan **Ctrl+S** atau tombol **Recompile** untuk compile.
4. PDF muncul di panel kanan. Klik di area PDF untuk lompat ke kode (SyncTeX).
5. **Export .zip** untuk mengunduh seluruh project, **Download PDF** untuk hasil PDF.

## Build Produksi

```powershell
bun run build          # build server + web
bun run start:server   # jalankan server (setelah build)
```

Untuk frontend produksi, hasil ada di `web/dist`. Serve secara statis
(mis. dengan `bunx serve web/dist`) dan arahkan `/api` + `/ws` ke backend.

## Endpoint API

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/health` | Status server & tectonic |
| GET | `/api/templates` | Daftar template |
| GET/POST | `/api/projects` | List / buat project |
| PATCH/DELETE | `/api/projects/:id` | Update / hapus project |
| POST | `/api/projects/import` | Import zip |
| GET | `/api/projects/:id/export` | Export zip |
| GET | `/api/projects/:id/tree` | File tree |
| GET/PUT | `/api/projects/:id/file` | Baca / tulis file |
| POST | `/api/projects/:id/folder` | Buat folder |
| DELETE | `/api/projects/:id/path` | Hapus file/folder |
| POST | `/api/projects/:id/rename` | Rename |
| POST | `/api/projects/:id/upload` | Upload file |
| POST | `/api/projects/:id/compile` | Trigger compile |
| GET | `/api/projects/:id/compile/status` | Status compile |
| GET | `/api/projects/:id/pdf` | Stream PDF |
| GET | `/api/projects/:id/pdf/download` | Download PDF |
| GET | `/api/projects/:id/synctex/edit` | PDF → source |
| GET | `/api/projects/:id/synctex/view` | source → PDF |
| WS | `/ws` | Event compile real-time |

## Catatan Teknis

- **Compile pertama lambat** (10–60s) karena Tectonic mengunduh paket LaTeX.
  Selanjutnya cache, biasanya < 3 detik.
- Keamanan: semua path divalidasi (anti path traversal), ekstensi berbahaya diblokir.
- Satu compile berjalan per project; permintaan baru saat berjalan akan di-queue.
