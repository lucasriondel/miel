# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.3.4

FROM oven/bun:${BUN_VERSION}-alpine AS builder
WORKDIR /repo

# Build args -> Vite env (baked into the bundle)
ARG VITE_API_BASE
ARG VITE_API_SECRET
ENV VITE_API_BASE=$VITE_API_BASE \
    VITE_API_SECRET=$VITE_API_SECRET

COPY package.json bun.lock turbo.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json  packages/api/package.json
COPY packages/web/package.json  packages/web/package.json
COPY packages/cli/package.json  packages/cli/package.json
RUN bun install --frozen-lockfile

# core is imported by web for shared types
COPY packages/core ./packages/core
COPY packages/web  ./packages/web

RUN cd packages/web && bun run build

FROM nginx:1.27-alpine AS runner
COPY packages/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /repo/packages/web/dist /usr/share/nginx/html
EXPOSE 80
