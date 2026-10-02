# Dockerfile backend (Bun + Fastify) & collab (Hocuspocus).
#
# Target:
#   --target server  -> backend + Tectonic + pandoc
#   --target collab  -> server Hocuspocus (butuh Node asli, bukan Bun)
#
# CATATAN PENTING soal node_modules:
# Bun workspace meng-install dependensi PER-PACKAGE, bukan hanya di root.
# Tiap package (server/, collab/, web/) punya `node_modules/` sendiri yang berisi
# symlink relatif ke store root (`../../node_modules/.bun/...`). Karena itu setiap
# stage WAJIB menyalin node_modules milik package-nya sendiri dari stage `deps`,
# bukan hanya root node_modules — kalau tidak, `import "fastify"` akan gagal.

FROM oven/bun:1.3.13 AS base
WORKDIR /app

# --- Install dependencies (monorepo) ---
FROM base AS deps
COPY package.json bun.lock bunfig.toml ./
COPY server/package.json server/
COPY collab/package.json collab/
COPY web/package.json web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile || bun install

# --- Server runtime ---
FROM base AS server
WORKDIR /app
# Root node_modules (berisi store .bun) + node_modules milik package server.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/server/node_modules ./server/node_modules
COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY server ./server

# Tectonic: binary Linux statis (musl) -> jalan tanpa dependensi tambahan.
# pandoc: dipakai untuk export docx/html/odt/pptx/epub.
ARG TECTONIC_VERSION=0.17.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils pandoc git \
 && curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
      | tar -xz -C /usr/local/bin tectonic \
 && chmod +x /usr/local/bin/tectonic \
 && tectonic --version \
 && pandoc --version | head -1 \
 && git --version \
 && rm -rf /var/lib/apt/lists/*

# Pre-warm cache bundle TeX supaya compile pertama tidak perlu unduh ulang.
# Dijalankan sebagai root agar cache mendarat di /root/.cache/Tectonic
# (proses server di container ini juga berjalan sebagai root).
#
# Dokumen warmup sengaja memuat paket yang dipakai template bawaan aplikasi
# (amsmath, graphicx, hyperref) plus paket umum lain. Tanpa ini, cache hanya
# berisi article.cls dan compile pertama pengguna memakan ~30 detik.
#
# Warmup ini hanya OPTIMASI, bukan syarat: bila jaringan sedang bermasalah,
# build tetap harus sukses dan Tectonic akan mengunduh bundle saat runtime.
# Karena itu kegagalannya sengaja tidak menggagalkan build (retry 3x lalu `true`).
COPY docker/warmup.tex /tmp/warm.tex
RUN mkdir -p /tmp/warm-out \
 && for i in 1 2 3; do \
      tectonic -X compile /tmp/warm.tex --outdir /tmp/warm-out && break; \
      echo "[warmup] percobaan $i gagal, ulangi..."; sleep 5; \
    done || true \
 && rm -rf /tmp/warm.tex /tmp/warm-out

RUN mkdir -p /data/projects
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=5174
ENV TECTONIC_BIN=/usr/local/bin/tectonic
ENV LATEX_DATA_DIR=/data/projects
EXPOSE 5174
WORKDIR /app/server
CMD ["bun", "run", "src/index.ts"]

# --- Collab runtime (butuh Node, bukan Bun, karena crossws) ---
FROM node:22-alpine AS collab
WORKDIR /app
# Root node_modules + node_modules milik package collab.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/collab/node_modules ./collab/node_modules
COPY package.json ./
COPY packages ./packages
COPY collab ./collab
COPY scripts ./scripts
ENV NODE_ENV=production
ENV COLLAB_HOST=0.0.0.0
ENV COLLAB_PORT=1234
EXPOSE 1234
CMD ["node", "--experimental-strip-types", "collab/src/index.ts"]
