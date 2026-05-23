# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.3.4
ARG NODE_VERSION=22
ARG GOGCLI_VERSION=0.19.0

FROM oven/bun:${BUN_VERSION}-alpine AS runner

ARG GOGCLI_VERSION
WORKDIR /repo
ENV NODE_ENV=production \
    GOG_BIN=/usr/local/bin/gog \
    CLAUDE_BIN=claude \
    GOG_KEYRING_BACKEND=file

# nodejs/npm for the Claude Code CLI; curl/tar/jq for gogcli install + diagnostics
RUN apk add --no-cache nodejs npm ca-certificates curl tar jq tini

# Claude Code CLI -> /usr/local/bin/claude
RUN npm install -g @anthropic-ai/claude-code

# gogcli (linux/amd64) -> /usr/local/bin/gog
RUN set -eux; \
    arch="$(uname -m)"; \
    case "$arch" in \
      x86_64)  goarch="amd64" ;; \
      aarch64) goarch="arm64" ;; \
      *) echo "unsupported arch: $arch" >&2; exit 1 ;; \
    esac; \
    url="https://github.com/openclaw/gogcli/releases/download/v${GOGCLI_VERSION}/gogcli_${GOGCLI_VERSION}_linux_${goarch}.tar.gz"; \
    curl -fsSL "$url" -o /tmp/gog.tgz; \
    tar -xzf /tmp/gog.tgz -C /tmp; \
    install -m 0755 /tmp/gog /usr/local/bin/gog; \
    rm -rf /tmp/gog.tgz /tmp/gog; \
    /usr/local/bin/gog version

# Install JS deps (root + workspaces) using only the manifests for cache friendliness
COPY package.json bun.lock turbo.json tsconfig.base.json ./
COPY packages/core/package.json packages/core/package.json
COPY packages/api/package.json  packages/api/package.json
COPY packages/web/package.json  packages/web/package.json
COPY packages/cli/package.json  packages/cli/package.json
RUN bun install --frozen-lockfile

# Source we actually need at runtime
COPY packages/core ./packages/core
COPY packages/api  ./packages/api

# Persistent home for gog token store + Claude credentials
RUN adduser -D -h /home/app app \
    && mkdir -p /home/app/.config/gogcli /home/app/.claude \
    && chown -R app:app /home/app /repo
USER app
ENV HOME=/home/app
VOLUME ["/home/app/.config/gogcli", "/home/app/.claude"]

EXPOSE 3001

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["bun", "run", "packages/api/src/index.ts"]
