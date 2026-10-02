# Dockerfile backend (Bun + Fastify) & collab (Hocuspocus).
#
# Target:
#   --target server  -> backend + Tectonic + pandoc
#   --target collab  -> server Hocuspocus (butuh Node asli, bukan Bun)

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
COPY --from=deps /app/node_modules ./node_modules
COPY package.json bunfig.toml ./
COPY packages ./packages
COPY server ./server

# Tectonic: binary Linux statis (musl) -> jalan tanpa dependensi tambahan.
# pandoc: dipakai untuk export docx/html/odt/pptx/epub.
ARG TECTONIC_VERSION=0.17.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl xz-utils pandoc \
 && curl -fsSL "https://github.com/tectonic-typesetting/tectonic/releases/download/tectonic%40${TECTONIC_VERSION}/tectonic-${TECTONIC_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
      | tar -xz -C /usr/local/bin tectonic \
 && chmod +x /usr/local/bin/tectonic \
 && tectonic --version \
 && pandoc --version | head -1 \
 && rm -rf /var/lib/apt/lists/*

# Pre-warm cache bundle TeX supaya compile pertama tidak perlu unduh ulang.
# Dijalankan sebagai root agar cache mendarat di /root/.cache/Tectonic
# (proses server di container ini juga berjalan sebagai root).
RUN printf '\\documentclass{article}\\begin{document}warmup\\end{document}\n' > /tmp/warm.tex \
 && mkdir -p /tmp/warm-out \
 && tectonic -X compile /tmp/warm.tex --outdir /tmp/warm-out \
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
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages ./packages
COPY collab ./collab
COPY scripts ./scripts
ENV NODE_ENV=production
ENV COLLAB_HOST=0.0.0.0
ENV COLLAB_PORT=1234
EXPOSE 1234
CMD ["node", "--experimental-strip-types", "collab/src/index.ts"]
