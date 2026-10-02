# Deploy — LaTeX Web Editor (Homelab / Portainer)

Panduan men-deploy di homelab: image ditarik dari **GHCR** (hasil GitHub Actions),
di-orchestrate oleh **Portainer**, dan dipublikasikan lewat **Traefik** yang sudah ada.

```
Internet
  │
  └─ Cloudflare (latex.kevinio.my.id)   ← DNS + TLS edge
       │
       └─ Traefik (:80, entrypoint "web")   ← network "proxy"
            ├─ /api      → server:5174
            ├─ /ws       → server:5174   (WebSocket compile)
            ├─ /collab   → collab:1234   (WebSocket Yjs)
            └─ /         → web:80        (SPA nginx)
                            │
                            └─ internal: postgres, redis, server, collab
```

---

## 1. Yang dibangun GitHub Actions

Tiga image dipublikasikan ke GHCR setiap push ke `main`:

| Image | Isi |
|---|---|
| `ghcr.io/kevinantoniowiyonolauw/latex-webapp-server` | Fastify API + **Tectonic** + **pandoc** |
| `ghcr.io/kevinantoniowiyonolauw/latex-webapp-collab` | Hocuspocus / Yjs (Node 22) |
| `ghcr.io/kevinantoniowiyonolauw/latex-webapp-web` | SPA statis di nginx |

Tag: `latest` (branch default), `main`, `sha-<short>`, dan `X.Y.Z` bila push tag `v*`.

> **Penting:** `Tectonic` di image server adalah binary Linux (musl) yang diunduh
> saat build. Repo **tidak** menyertakan `tectonic.exe` (Windows, 51 MB) — itu hanya
> untuk pengembangan lokal.

---

## 2. Prasyarat di homelab

1. **Network `proxy` sudah ada** (dipakai Traefik):
   ```bash
   docker network ls | grep proxy
   ```
   Kalau belum ada:
   ```bash
   docker network create proxy
   ```

2. **Portainer** berjalan dan terhubung ke Docker host.

3. **Folder data di host** untuk dokumen user:
   ```bash
   sudo mkdir -p /opt/latex-webapp/data
   ```

---

## 3. Deploy lewat Portainer (cara utama)

### 3.1 Buat stack

Portainer → **Stacks** → **Add stack** → nama: `latex-webapp` →
pilih **Web editor** → tempel isi `docker-compose.prod.yml` dari repo.

### 3.2 Isi Environment variables

Di bagian **Environment variables** Portainer, tambahkan:

| Variable | Nilai | Wajib |
|---|---|---|
| `DOMAIN` | `latex.kevinio.my.id` | ✅ |
| `POSTGRES_PASSWORD` | password kuat pilihan Anda | ✅ |
| `BETTER_AUTH_SECRET` | hasil `openssl rand -hex 32` | ✅ |
| `POSTGRES_USER` | `latex` | – |
| `POSTGRES_DB` | `latex` | – |
| `LATEX_DATA_PATH` | `/opt/latex-webapp/data` | – |
| `TZ` | `Asia/Jakarta` | – |
| `COOKIE_SECURE` | `true` (default; jangan diubah bila lewat HTTPS) | – |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | dari Google Cloud Console | opsional |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | dari GitHub OAuth App | opsional |

> **OAuth itu opsional.** Login email/password tetap berfungsi tanpa kredensial OAuth.
> Bila diisi, daftarkan redirect URI:
> - `https://latex.kevinio.my.id/api/auth/callback/google`
> - `https://latex.kevinio.my.id/api/auth/callback/github`

### 3.3 Deploy

Klik **Deploy the stack**. Portainer akan menarik ketiga image dari GHCR.

### 3.4 Jadikan package GHCR publik (atau login)

Image publik bisa ditarik tanpa login. Bila package-nya **private**, tambahkan
registry credential di Portainer:

Portainer → **Registries** → **Add registry** → Custom:
- Registry URL: `ghcr.io`
- Username: `KevinAntonioWiyonoLauw` (username GitHub)
- Password: Personal Access Token (classic) dengan scope `read:packages`

---

## 4. Skema database (otomatis)

**Tidak perlu langkah manual.** Server menjalankan migrasi Drizzle saat start
(`runMigrations()` di `server/src/db/index.ts`), dan sifatnya idempoten — Drizzle
mencatat migrasi yang sudah dijalankan di tabel `__drizzle_migrations`.

Cek di log container server:
```bash
docker logs latex-webapp-prod-server-1 2>&1 | grep -i "migrasi"
# -> [db] migrasi selesai.
```

Bila ingin menjalankan migrasi manual (mis. DB eksternal):
```bash
docker run --rm \
  --network latex-webapp-prod_internal \
  -e DATABASE_URL="postgres://latex:<PASSWORD>@postgres:5432/latex" \
  ghcr.io/kevinantoniowiyonolauw/latex-webapp-server:latest \
  bunx drizzle-kit push --config=drizzle.config.ts
```

> Cek nama container/network dengan `docker ps` dan `docker network ls`
> (Portainer memberi prefix nama stack).

---

## 5. Verifikasi

```bash
# health backend (lewat Traefik)
curl -s https://latex.kevinio.my.id/api/health
# -> {"ok":true,"tectonic":true,"db":true,...}
```

Lalu buka `https://latex.kevinio.my.id`, daftar akun, buat project,
dan tekan **Compile** — PDF harus muncul di preview.

---

## 6. Update ke versi baru

Karena image di-tag `latest`:

Portainer → Stacks → `latex-webapp` → **Pull and redeploy**
(centang *Re-pull image*).

Atau via CLI:
```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

### Rollback / pin versi

Setiap build punya tag `sha-<short>`. Untuk pin versi tertentu, set:

```
LATEX_IMAGE_SERVER=ghcr.io/kevinantoniowiyonolauw/latex-webapp-server:sha-a1b2c3d
LATEX_IMAGE_COLLAB=ghcr.io/kevinantoniowiyonolauw/latex-webapp-collab:sha-a1b2c3d
LATEX_IMAGE_WEB=ghcr.io/kevinantoniowiyonolauw/latex-webapp-web:sha-a1b2c3d
```

---

## 7. Backup

Semua dokumen user ada di `LATEX_DATA_PATH` (default `/opt/latex-webapp/data`),
di dalamnya per project: `workspace/` (file sumber + `.git`), `.output/` (PDF),
dan `.collab/` (snapshot Yjs).

```bash
tar czf latex-backup-$(date +%F).tar.gz -C /opt/latex-webapp data
```

Database (user, project, share link) ada di volume `pgdata`:
```bash
docker exec latex-webapp-prod-postgres-1 \
  pg_dump -U latex latex > latex-db-$(date +%F).sql
```

---

## 8. Catatan teknis

- **Cloudflare → Traefik lewat HTTP.** Traefik dikonfigurasi hanya pada entrypoint
  `web` (:80) dengan `rule=Host(...)`, jadi request dari Cloudflare langsung cocok.
  Tidak ada konflik router: aturan `/api`, `/ws`, `/collab` bersifat spesifik,
  sedangkan `/` adalah catch-all.
- **`COOKIE_SECURE=true`** di-set karena domain dilayani HTTPS oleh Cloudflare.
  Pastikan Cloudflare SSL/TLS mode **Full** (atau Full Strict bila Traefik juga TLS).
- **Redis saat ini belum dipakai kode** (hanya didefinisikan di config). Container
  tetap disertakan agar siap untuk cache compile / pub-sub antar-instance.
- **`--untrusted`** dipakai saat memanggil Tectonic sehingga dokumen berbahaya
  (mis. `\write18`) tidak dieksekusi.
