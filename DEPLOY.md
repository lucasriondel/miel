# Deploying miel to Dokploy + Cloudflare Access

Target: VPS running Dokploy, x86_64 Linux. App reachable at:

- `miel.gousse.cool` -> `@miel/web` (nginx + static SPA)
- `api.miel.gousse.cool` -> `@miel/api` (Bun + Hono on :3001)

All HTTP traffic is gated by Cloudflare Access (Google login, email-restricted).

---

## 1. Dokploy applications

Create two **Applications** in Dokploy, both pointing at this repo:

### 1.1 `miel-api`

- Build type: **Dockerfile**
- Dockerfile path: `packages/api/Dockerfile`
- Build context: repo root (`.`)
- Exposed port: `3001`
- Domain: `api.miel.gousse.cool` (Traefik handles TLS via Let's Encrypt or Cloudflare origin cert)

**Runtime env vars** (set in Dokploy > Environment):

| Key | Value |
|---|---|
| `DATABASE_URL` | `postgres://miel:<password>@miel-postgres:5432/miel` (Dokploy-internal hostname) |
| `API_SECRET` | long random string |
| `API_PORT` | `3001` |
| `WEB_ORIGIN` | `https://miel.gousse.cool` |
| `GOG_BIN` | `/usr/local/bin/gog` |
| `CLAUDE_BIN` | `claude` |
| `GOG_KEYRING_BACKEND` | `file` |
| `GOG_KEYRING_PASSWORD` | long random string (Dokploy secret) |
| `ANTHROPIC_API_KEY` | your Claude API key (consumed by the `claude` CLI) |

**Volumes** (persist gog tokens + Claude credentials across deploys):

- `/home/app/.config/gogcli` -> named volume `miel-gog-config`
- `/home/app/.claude` -> named volume `miel-claude-config`

### 1.2 `miel-web`

- Build type: **Dockerfile**
- Dockerfile path: `packages/web/Dockerfile`
- Build context: repo root
- Exposed port: `80`
- Domain: `miel.gousse.cool`

**Build args** (set in Dokploy > Build Arguments — these are baked into the bundle, NOT runtime env):

| Key | Value |
|---|---|
| `VITE_API_BASE` | `https://api.miel.gousse.cool` |
| `VITE_API_SECRET` | same value as the API's `API_SECRET` |

### 1.3 Postgres

Provision a Postgres service in Dokploy (image `postgres:16`). Take note of the
internal hostname and credentials to plug into `DATABASE_URL` above. Migrations
run automatically on API container startup (see `packages/api/src/index.ts`).

---

## 2. One-time gog OAuth bootstrap

The API container starts but `gog` has no Google tokens yet. Bootstrap once:

```bash
# On the VPS, after the api container is running:
docker exec -it miel-api sh

# Copy your OAuth client_secret JSON into the container first, e.g.:
#   docker cp client_secret.json miel-api:/tmp/client.json

gog auth credentials /tmp/client.json
gog auth add lucasrndl@gmail.com --services gmail --manual
# -> opens an auth URL; paste it into your local browser, complete the flow,
#    copy the resulting callback URL, paste it back into the terminal.

# Verify
gog auth list
gog --account lucasrndl@gmail.com gmail labels list | head

rm /tmp/client.json
exit
```

The encrypted token store is written to `/home/app/.config/gogcli` — the mounted
volume — so it survives rebuilds.

> **gogcli release URL.** The API Dockerfile pulls `gogcli` from
> `https://github.com/openclaw/gogcli/releases/download/v${GOGCLI_VERSION}/gogcli_${GOGCLI_VERSION}_linux_amd64.tar.gz`
> (the repo moved from `steipete/gogcli` to `openclaw/gogcli`). To bump, set the
> `GOGCLI_VERSION` build arg to a release tag from
> https://github.com/openclaw/gogcli/releases (e.g. `0.19.0`, no `v` prefix).

---

## 3. Cloudflare Access

Prereqs: `gousse.cool` zone in Cloudflare; Zero Trust team configured.

### 3.1 DNS

Point both subdomains at Dokploy's public IP, **proxied (orange cloud ON)**:

```
miel.gousse.cool      A   <vps-ip>   proxied
api.miel.gousse.cool  A   <vps-ip>   proxied
```

> If you prefer a Tunnel (no open inbound ports), install `cloudflared` on the
> VPS and create a tunnel routing both hostnames to Traefik's internal port
> instead of opening 80/443 to the internet. Either model works with Access.

### 3.2 Access applications

In Zero Trust dashboard > **Access > Applications > Add an application > Self-hosted**:

**App A — miel web**
- Application domain: `miel.gousse.cool`
- Session duration: 30 days
- Identity providers: Google
- Policy "owner":
  - Action: Allow
  - Include: `Emails == lucasrndl@gmail.com`

**App B — miel api**
- Application domain: `api.miel.gousse.cool`
- Session duration: 30 days
- Identity providers: Google
- Policies:
  1. "owner" — Allow / `Emails == lucasrndl@gmail.com`
  2. "cli" — Service Auth / Service Token == `miel-cli`

### 3.3 Service token for CLI / non-browser access

Zero Trust > **Access > Service Auth > Create Service Token**, name it
`miel-cli`. Save the `Client ID` and `Client Secret`. Attach the token in App
B's "cli" policy above.

To call the API from outside the VPS (e.g. your laptop CLI), send these headers
on every request:

```
CF-Access-Client-Id: <client-id>
CF-Access-Client-Secret: <client-secret>
Authorization: Bearer <API_SECRET>
```

---

## 4. CORS + the WS sync endpoint

- The API's CORS allowlist is `WEB_ORIGIN` — set to `https://miel.gousse.cool`
  in prod. The browser sends `Authorization: Bearer <VITE_API_SECRET>` plus
  Access's `CF_Authorization` cookie automatically.
- The WS sync endpoint (`/sync/ws`) gates on the `?token=<API_SECRET>` query
  param. Cloudflare Access + Tunnel both pass WebSocket upgrades through, no
  config change needed.

---

## 5. Smoke test after deploy

```bash
# From your laptop (you must be logged into the Google identity in your browser
# OR send service-token headers):
curl -i https://api.miel.gousse.cool/health
# -> 200 {"ok":true}

# Browser: open https://miel.gousse.cool, Cloudflare Access challenges with
# Google login, then the SPA loads and starts hitting api.miel.gousse.cool.
```

---

## 6. Operational notes

- **Updating gog tokens.** If a refresh token expires (revoked, scope change),
  `docker exec -it miel-api gog auth add lucasrndl@gmail.com --services gmail --force-consent --manual`.
- **Rotating `API_SECRET`.** Must be changed in BOTH the API runtime env AND
  the web build args (rebuild web). The web bundle bakes the secret at build
  time.
- **Rotating `GOG_KEYRING_PASSWORD`.** Don't — the token file is encrypted with
  it. Rotating means re-authing all accounts.
- **Logs.** `docker logs miel-api` shows startup + migration logs; gog/claude
  adapter calls log under `DEBUG=miel:*`.
