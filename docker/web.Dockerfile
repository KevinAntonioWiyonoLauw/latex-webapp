# Dockerfile frontend: build SPA lalu serve via nginx.

FROM oven/bun:1.3.13 AS build
WORKDIR /app
COPY package.json bun.lock bunfig.toml ./
COPY server/package.json server/
COPY collab/package.json collab/
COPY web/package.json web/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile || bun install
COPY packages ./packages
COPY web ./web
WORKDIR /app/web
RUN bun run build

FROM nginx:alpine AS web
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
