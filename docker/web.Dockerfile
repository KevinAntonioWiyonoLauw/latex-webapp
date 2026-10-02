# Dockerfile frontend: build SPA lalu serve via nginx.
#
# CATATAN: sama seperti server.Dockerfile, Bun workspace meng-install dependensi
# per-package, jadi `web/node_modules` harus ikut disalin dari stage `deps`.

FROM oven/bun:1.3.13 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY server/package.json server/
COPY collab/package.json collab/
COPY web/package.json web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile || bun install

FROM build AS web-build
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/web/node_modules ./web/node_modules
COPY package.json bunfig.toml tsconfig.base.json ./
COPY packages ./packages
COPY web ./web
WORKDIR /app/web
RUN bun run build

FROM nginx:alpine AS web
COPY --from=web-build /app/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
