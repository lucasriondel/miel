# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.3.4
ARG NODE_VERSION=22

FROM oven/bun:${BUN_VERSION}-alpine AS runner

WORKDIR /repo
ENV NODE_ENV=production \
    CLAUDE_BIN=claude \
    CLAUDE_CONFIG_DIR=/home/app/.claude

# nodejs/npm for the Claude Code CLI; tini for signal handling. Gmail I/O is now
# done in-process via googleapis (pure JS) — no external binary to install.
RUN apk add --no-cache nodejs npm ca-certificates tini

# Claude Code CLI -> /usr/local/bin/claude (invoked headlessly with
# CLAUDE_CODE_OAUTH_TOKEN injected at spawn time; no interactive login needed).
RUN npm install -g @anthropic-ai/claude-code

# Install JS deps (root + workspaces) using only the manifests for cache
# friendliness. Every workspace manifest, not just the ones this image runs:
# `--frozen-lockfile` compares the lockfile against all of them and fails on a
# tree where one is missing, without naming it.
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages/core/package.json         packages/core/package.json
COPY packages/api/package.json          packages/api/package.json
COPY packages/web/package.json          packages/web/package.json
COPY packages/cli/package.json          packages/cli/package.json
COPY packages/landing-page/package.json packages/landing-page/package.json
# The whole workspace resolves from the public registry: this install needs no
# credential, so the image takes no build argument at all.
RUN bun install --frozen-lockfile

# Source we actually need at runtime
COPY packages/core ./packages/core
COPY packages/api  ./packages/api

# A writable HOME for the Claude CLI's incidental state. Google refresh tokens
# live (encrypted) in Postgres and the Claude token is a runtime env var, so no
# auth state needs to persist on disk across rebuilds any more.
RUN adduser -D -h /home/app app \
    && mkdir -p /home/app/.claude \
    && chown -R app:app /home/app /repo
USER app
ENV HOME=/home/app

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "packages/api/src/index.ts"]
