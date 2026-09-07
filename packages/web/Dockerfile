# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.3.4

FROM oven/bun:${BUN_VERSION}-alpine AS builder
WORKDIR /repo

# Build args -> Vite env (baked into the bundle).
# VITE_API_BASE defaults to /api: the SPA calls the API same-origin and nginx
# proxies /api -> the API container (see runner stage). Keeps the browser off a
# cross-origin host, which would trip Cloudflare Access on the CORS preflight.
ARG VITE_API_BASE=/api
ARG VITE_API_SECRET
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_API_SECRET=$VITE_API_SECRET

# Every dependency resolves from the public registry, so this image — like the
# landing one — builds for anyone who clones the repo, with no credential.
#
# Every workspace manifest has to be here, not just the ones this image builds:
# `--frozen-lockfile` compares the lockfile against all of them and fails on a
# tree where one is missing, without naming it.
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages/core/package.json         packages/core/package.json
COPY packages/api/package.json          packages/api/package.json
COPY packages/web/package.json          packages/web/package.json
COPY packages/cli/package.json          packages/cli/package.json
COPY packages/landing-page/package.json packages/landing-page/package.json
RUN bun install --frozen-lockfile

# core is imported by web for shared types
COPY packages/core ./packages/core
COPY packages/web  ./packages/web

RUN cd packages/web && bun run build

FROM nginx:1.27-alpine AS runner
# http{}-context map for WebSocket upgrade (00- prefix loads before the server).
COPY packages/web/upgrade-map.conf /etc/nginx/conf.d/00-upgrade-map.conf
# Server config as a template: the nginx image runs envsubst on
# /etc/nginx/templates/*.template at boot, writing to /etc/nginx/conf.d/.
# NGINX_ENVSUBST_FILTER restricts substitution to API_UPSTREAM so nginx's own
# runtime vars ($host, $remote_addr, $connection_upgrade, ...) are left intact.
COPY packages/web/nginx.conf.template /etc/nginx/templates/default.conf.template
ENV API_UPSTREAM=miel-api:3001 \
    NGINX_ENVSUBST_FILTER=API_UPSTREAM
# The app is served under /app, so its bundle sits in the matching subdirectory
# of the document root; / is left free for the public landing pages.
COPY --from=builder /repo/packages/web/dist /usr/share/nginx/html/app
EXPOSE 80
