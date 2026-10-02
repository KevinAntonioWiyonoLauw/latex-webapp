# Panduan Deploy — LaTeX Web Editor

Panduan men-deploy aplikasi ke server produksi dengan Docker + Caddy (HTTPS otomatis).

## Arsitektur Produksi

```
                  Internet
                     │
        ┌────────────▼────────────┐
        │   Caddy (443/80)        │  HTTPS otomatis (Let's Encrypt)
        │   <domain>              │
        └────┬────────┬───────┬───┘
             │        │       │
      / (web)    /api/*    /ws      /collab
             │        │       │          │
        ┌────▼──┐ ┌───▼────┐  │     ┌────▼─────┐
        │ web   │ │ server │◄─┘     │ collab   │
        │ nginx │ │ Bun    │        │ Node(Js) │
        └───────┘ └───┬────┘        └────┬─────┘
                      │                  │
              ┌───────┴───────┐          │
         ┌────▼─────┐    ┌────▼───┐      │
         │ Postgres │    │ Redis  │      │
         └──────────┘    └────────┘      │
                                        │
                     volume bersama ────┘
                     (server/data)
```

> **Catatan**: collab dijalankan dengan **Node**, bukan Bun, karena Hocuspocus/crossws
> menolak adapter Node di runtime Bun.

## Prasyarat

1. **Server** (VPS) dengan Docker & Docker Compose.
2. **Domain** yang mengarah ke IP server (A record), mis. `latex.kevinio.my.id`.
3. **DNS** sudah propagasi.
4. Port 80 & 443 terbuka.

## Langkah Deploy

### 1. Clone & konfigurasi

```bash
git clone <repo> latex-webapp
cd latex-webapp
cp .env.example .env
```

Edit `.env`:

```env
# Domain publik
DOMAIN=latex.kevinio.my.id

# Secret auth (WAJIB diganti, minimal 32 karakter acak)
BETTER_AUTH_SECRET=ganti-dengan-string-acak-panjang

# Kredensial Postgres produksi
POSTGRES_USER=latex
POSTGRES_PASSWORD=password-kuat-anda
POSTGRES_DB=latex

# OAuth (opsional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

> `BETTER_AUTH_URL` akan otomatis `https://${DOMAIN}` di compose produksi.

### 2. (Opsional) Tectonic

Backend butuh binary `tectonic`. Dua cara:

**A. Mount dari host** (disarankan, cepat):
```
# tools/tectonic sudah ada, tambahkan volume di server service:
# - ./tools/tectonic:/usr/local/bin/tectonic:ro
# lalu set TECTONIC_BIN=/usr/local/bin/tectonic
```

**B. Unduh ke volume** (unduh sekali di server):
```bash
docker compose -f docker-compose.prod.yml run --rm server \
  sh -c "apk add curl unzip && curl -L -o /tmp/t.zip <url> && unzip -o /tmp/t.zip -d /usr/local/bin"
```

### 3. OAuth redirect URI

Daftarkan di Google/GitHub Console:
```
https://<DOMAIN>/api/auth/callback/google
https://<DOMAIN>/api/auth/callback/github
```

### 4. Jalankan

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### 5. Migrasi database (sekali)

```bash
docker compose -f docker-compose.prod.yml exec server \
  bun run drizzle-kit push
```

### 6. Selesai

Buka `https://<DOMAIN>` — Caddy otomatis menerbitkan sertifikat HTTPS.

## Perintah Berguna

```bash
# Lihat log
docker compose -f docker-compose.prod.yml logs -f server

# Restart service tertentu
docker compose -f docker-compose.prod.yml restart server

# Update setelah perubahan kode
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Hentikan
docker compose -f docker-compose.prod.yml down
```

## Backup

```bash
# Database
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U latex latex > backup-$(date +%F).sql

# File project (volume latex-prod-data)
docker run --rm -v latex-webapp-prod_latex-prod-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/projects-$(date +%F).tar.gz -C /data .
```

## Hardening yang Sudah Diterapkan

- HTTPS otomatis (Caddy + Let's Encrypt).
- Cookie session `Secure` + `SameSite=Lax` di produksi.
- Rate limit global (300 req/menit per IP).
- Compile LaTeX dengan flag `--untrusted` + timeout.
- Validasi path & ekstensi file (anti path traversal).
- Isolasi project per-user (ACL).
- Backend & database tidak diekspos publik (hanya lewat Caddy).

## Troubleshooting

| Gejala | Solusi |
|---|---|
| 502 dari Caddy | Cek `docker compose logs server` — mungkin DB belum siap |
| Login gagal (cookie) | Pastikan `DOMAIN` benar & HTTPS aktif |
| Collab tidak nyambung | Cek `docker compose logs collab`; pastikan route `/collab` |
| Compile error "tectonic not found" | Set `TECTONIC_BIN` / mount binary |
| OAuth redirect_uri_mismatch | Daftarkan URI `https://<DOMAIN>/api/auth/callback/...` |

## Pengembangan Lokal (bukan produksi)

```bash
docker compose up -d postgres redis      # infra
bun run --filter server db:push          # migrasi
bun run dev:all                          # server + collab + web
```
