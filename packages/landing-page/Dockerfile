# syntax=docker/dockerfile:1.7
#
# The public site, as its own image: nginx serving the three prerendered pages.
#
# Deliberately separate from the app's image (packages/web/Dockerfile). Someone
# self-hosting Miel builds the app, not the owner's public site, so no landing
# HTML belongs in that image — and no dependency of the app belongs in this one.
# The domain is path-routed across the two containers instead; see DEPLOY.md and
# src/deploy/topology.ts.
#
# Build context is the repo ROOT, not this directory:
#   docker build -f packages/landing-page/Dockerfile -t miel-landing .
ARG BUN_VERSION=1.3.4

FROM oven/bun:${BUN_VERSION}-alpine AS builder
WORKDIR /repo

# No build args and no runtime environment: this image must build for anyone who
# clones the repo. The install is filtered to this package, so none of the app's
# dependencies — none of which this page uses — are fetched into it.
#
# Every workspace manifest still has to be present: `--frozen-lockfile` compares
# the lockfile against all of them, and rejects a tree where one is missing.
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages/core/package.json         packages/core/package.json
COPY packages/api/package.json          packages/api/package.json
COPY packages/web/package.json          packages/web/package.json
COPY packages/cli/package.json          packages/cli/package.json
COPY packages/landing-page/package.json packages/landing-page/package.json
RUN bun install --frozen-lockfile --filter=@miel/landing-page

# @miel/core is the one workspace dependency, reached through leaf subpaths
# (@miel/core/googleScopes, @miel/core/claudeUsage, @miel/core/appBasePath) which
# resolve to its TypeScript source — so core needs no build step here, and the
# permission table cannot disagree with the scopes the app requests.
COPY packages/core         ./packages/core
COPY packages/landing-page ./packages/landing-page

# The package's own build script, not a bare `vite build`: it prerenders, then
# staticizes into dist/public, then verifies that each built page carries its
# whole text as raw HTML. A regression to client-only rendering fails the image
# build rather than reaching a reader with scripts disabled.
RUN cd packages/landing-page && bun run build

FROM nginx:1.27-alpine AS runner
# Static config, no envsubst template: this container proxies nothing and takes
# no runtime environment, so there is nothing to set in the dashboard.
COPY packages/landing-page/nginx.conf /etc/nginx/conf.d/default.conf
# dist/public — self-contained HTML only. dist/client still holds the hydrating
# bundle the prerenderer produced; copying that would put back the scripts and
# the fetchable subresources staticize removed.
COPY --from=builder /repo/packages/landing-page/dist/public /usr/share/nginx/html
EXPOSE 80
