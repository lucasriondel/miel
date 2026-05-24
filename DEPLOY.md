# Deploying miel to Dokploy + Cloudflare Access

Target: VPS running Dokploy, x86_64 Linux. App reachable at:

- `miel.gousse.cool` -> `@miel/web` (nginx + static SPA)
- `miel-api.gousse.cool` -> `@miel/api` (Bun + Hono on :3001)

All HTTP traffic is gated by Cloudflare Access (Google login, email-restricted).

---

## 1. Dokploy applications

Create two **Applications** in Dokploy, both pointing at this repo:

### 1.1 `miel-api`

- Build type: **Dockerfile**
- Dockerfile path: `packages/api/Dockerfile`
- Build context: repo root (`.`)
- Exposed port: `3001`
- Domain: `miel-api.gousse.cool` (Traefik handles TLS via Let's Encrypt or Cloudflare origin cert)

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
| `VITE_API_BASE` | `/api` |
| `VITE_API_SECRET` | same value as the API's `API_SECRET` |

> **Why `/api`, not the API host.** The SPA calls the API **same-origin** under
> `https://miel.gousse.cool/api/*`; nginx in the web container proxies `/api`
> to the API container (stripping the prefix). This avoids a cross-origin
> request, which is fatal here: a CORS preflight (`OPTIONS`) is sent without
> credentials, and Cloudflare Access rejects it with a 403/login redirect that
> carries no `Access-Control-Allow-Origin` header → the browser reports a CORS
> failure. Same-origin sidesteps preflight entirely.

**Runtime env** (set in Dokploy > Environment for `miel-web`):

| Key | Value |
|---|---|
| `API_UPSTREAM` | `miel-api:3001` (Docker-internal host:port of the API container; defaults to this in the Dockerfile, override if the container name differs) |

> nginx resolves `API_UPSTREAM` at request time via Docker's embedded DNS
> (`127.0.0.11`), so the web container boots even if the API isn't up yet. The
> web and API apps must share a Docker network (Dokploy's default
> `dokploy-network`) for the name to resolve.

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

## 3. Cloudflare Access (as built)

The app is fronted by a **Cloudflare Tunnel** + **Cloudflare Access**. There are
no public inbound ports in the intended end state — all browser/API traffic
enters through the tunnel, and every request is gated by Access (Google login,
restricted to one email). This is the actual deployed topology, not a sketch.

```
browser ──TLS──▶ Cloudflare edge ──Access challenge (Google login)──▶
   └─▶ cloudflared (outbound tunnel, on the VPS) ──HTTPS+localhost:443──▶ Traefik ──▶ web / api container
```

Prereqs: `gousse.cool` zone in Cloudflare; a Zero Trust team
(`weathered-salad-1ee9.cloudflareaccess.com`); `cloudflared` installed on the VPS.

### 3.1 Hostnames — why `miel-api`, not `api.miel`

| Host | Serves | Notes |
|---|---|---|
| `miel.gousse.cool` | `@miel/web` | first-level subdomain |
| `miel-api.gousse.cool` | `@miel/api` | **first-level on purpose** |

> **Gotcha — Universal SSL only covers one subdomain level.** The free
> Cloudflare cert is `*.gousse.cool`, which matches `miel.gousse.cool` and
> `miel-api.gousse.cool` but **NOT** a two-level host like `api.miel.gousse.cool`
> (wildcards match one label only). A two-level host fails the edge TLS
> handshake (`sslv3 alert handshake failure`) unless you buy an Advanced
> Certificate (~$10/mo). We flattened the API host to `miel-api` to stay on the
> free cert. Don't reintroduce a two-level host without buying the cert.

### 3.2 The Tunnel

A dashboard-managed (remote) tunnel named **`miel-vps`** runs as a systemd
service on the VPS (installed via `cloudflared service install <token>`). All
routing config lives in the Cloudflare dashboard — there is **no local
`config.yml` / `cert.pem`**, so `cloudflared tunnel list` on the box errors
("Cannot determine default origin certificate path"). That's expected for a
remote-managed tunnel; manage it at **Networks → Tunnels → miel-vps**.

**Routes** (Networks → Tunnels → miel-vps → **Routes** tab — the new UI renamed
"Public Hostname" to "Routes"). Both must be identical:

| Public hostname | Service URL | TLS |
|---|---|---|
| `miel.gousse.cool` | `https://localhost:443` | **No TLS Verify: ON** |
| `miel-api.gousse.cool` | `https://localhost:443` | **No TLS Verify: ON** |

> **Gotcha — must be `https://localhost:443`, NOT `http://localhost:80`.**
> Dokploy's Traefik force-redirects HTTP→HTTPS (308). If the tunnel hits `:80`,
> cloudflared follows the 308 back to the same hostname → through the tunnel →
> `:80` again → **infinite redirect loop** (`ERR_TOO_MANY_REDIRECTS`). Pointing
> at `:443` lets Traefik serve directly, no redirect.
>
> **Gotcha — `No TLS Verify` is required.** Traefik presents a real Let's
> Encrypt cert for `miel.gousse.cool` but only its self-signed
> `TRAEFIK DEFAULT CERT` for `miel-api.gousse.cool` (no LE cert was issued for
> the API host). Without "No TLS Verify", cloudflared rejects the self-signed
> cert → **502 Bad Gateway** (origin reachable, TLS verify fails). The web host
> happened to work without it because its cert is valid; the api host needs the
> flag. Set it on **both** routes to be safe.

Saving a route as a **brand-new** hostname auto-creates a proxied CNAME to
`<tunnel-id>.cfargotunnel.com`. **Re-saving an existing route does NOT (re)create
DNS** — if you deleted/renamed records you must add the CNAME manually:

```
miel       CNAME  <tunnel-id>.cfargotunnel.com   Proxied (orange)
miel-api   CNAME  <tunnel-id>.cfargotunnel.com   Proxied (orange)
```

Proxy **must** be orange — that's what routes traffic into the tunnel and lets
Access intercept. (Tunnel ID is shown on the tunnel's Overview page.)

### 3.3 Identity provider (Google)

Integrations → **Identity providers** → Add → **Google** (the new UI moved this
out of "Authentication → Login methods").

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID
   (Web application)**.
2. Authorized redirect URI (exactly):
   `https://weathered-salad-1ee9.cloudflareaccess.com/cdn-cgi/access/callback`
3. Paste the **full Client ID** into Cloudflare's **App ID** field — the entire
   `NNN-xxxx.apps.googleusercontent.com` string, not the project name. Paste the
   **Client secret** into Client secret. Save → **Test**.

> **Gotcha — `Error 401: invalid_client` / "OAuth client was not found"** means
> Cloudflare's **App ID** field has the wrong value (e.g. the project name
> instead of the full Client ID). It is *not* a redirect-URI problem (that would
> say `redirect_uri_mismatch`). If the consent screen is in "Testing" mode, add
> your email under **Audience → Test users** or you'll hit `access_denied`.

### 3.4 Access applications

Access controls → **Applications** → Add → **Self-hosted** (new UI: "Access
controls", not "Access"):

**App — miel web**
- Application domain: `miel.gousse.cool`
- Session duration: 30 days · Identity providers: Google
- Policy "owner": Allow / `Emails == lucasrndl@gmail.com`

**App — miel api**
- Application domain: `miel-api.gousse.cool`
- Session duration: 30 days · Identity providers: Google
- Policies:
  1. "owner" — Allow / `Emails == lucasrndl@gmail.com`
  2. "cli" — Service Auth / Service Token == `miel-cli`

> **Gotcha — an Access app is bound to an exact hostname.** When the API host
> was flattened from `api.miel` to `miel-api`, the existing app kept protecting
> the old name, so `miel-api.gousse.cool` reached the origin and returned the
> API's own `401` (bearer auth) instead of a `302` to the Access login. If a host
> returns `401` from the origin instead of redirecting to
> `…cloudflareaccess.com/cdn-cgi/access/login`, the Access app is pointed at the
> wrong hostname.

### 3.5 Service token for CLI / non-browser access

Access controls → **Service credentials** (new UI name for "Service Auth") →
Create Service Token → name `miel-cli`. **Copy Client ID + Secret immediately**
(secret shown once). Attach it to the miel api app's "cli" policy.

To call the API from outside the VPS (laptop CLI, scripts), send all three
headers — the first two satisfy Access, the third satisfies the API's own
bearer auth:

```
CF-Access-Client-Id: <client-id>
CF-Access-Client-Secret: <client-secret>
Authorization: Bearer <API_SECRET>
```

### 3.6 Quick verification

```bash
# web + api: unauthenticated should 302 to the Access login, NOT load the app.
curl -sI https://miel.gousse.cool/        | grep -iE 'http/|location'
curl -sI https://miel-api.gousse.cool/    | grep -iE 'http/|location'
# -> HTTP/2 302 + location: https://weathered-salad-1ee9.cloudflareaccess.com/...

# /health is exempt from the API's bearer auth but still behind Access here.
curl -sI https://miel-api.gousse.cool/health

# From the VPS, confirm Traefik serves both hosts on :443 (origin healthy):
ssh vps 'curl -ks -o /dev/null -w "%{http_code}\n" -H "Host: miel.gousse.cool"     https://localhost:443/
          curl -ks -o /dev/null -w "%{http_code}\n" -H "Host: miel-api.gousse.cool" https://localhost:443/health'
# -> 200 / 200
```

> **Debugging a 502:** Cloudflare's 502 page shows Browser→Cloudflare→Host with
> an ✗ on Host = the origin fetch failed. Check, in order: (1) is the route
> Service URL `https://localhost:443` with **No TLS Verify ON**? (a leftover
> `http://localhost:80` causes the redirect loop, a missing No-TLS-Verify causes
> the 502); (2) does the VPS Traefik return 200 for that Host on :443 (above)?
> An *intermittent* 502 only after login usually means the **web route** was
> left on `http://localhost:80` while api was fixed — the post-auth origin fetch
> follows Traefik's 308 and fails, even though the unauthenticated curl looks
> clean.

### 3.7 TODO — close the VPS firewall

Inbound `80`/`443` are **still open directly** on the VPS public IP, so the app
is reachable bypassing Cloudflare/Access if you know the IP. The tunnel makes
these ports unnecessary. To finish hardening, restrict 80/443 to **Cloudflare IP
ranges only** (or bind Traefik to loopback). Two caveats:

- Docker publishes Traefik on `0.0.0.0` and writes its own iptables `DOCKER`
  nat rules that **bypass `ufw`** — use the **OVH Edge Network Firewall** (panel,
  pre-Docker) or bind Traefik to `127.0.0.1`, not `ufw deny`.
- The web host's LE cert renews via **HTTP-01 on port 80**. If you fully close
  80, renewal breaks in ~90 days — either keep 80 reachable from Cloudflare IPs,
  or switch Dokploy/Traefik to **DNS-01** (Cloudflare API token) challenges.

Keep SSH (**port 222**) open in any firewall change — don't lock yourself out.

---

## 4. Same-origin proxy + the WS sync endpoint

- The browser talks to the API **same-origin** at `https://miel.gousse.cool/api`.
  nginx in the web container proxies `/api/*` to the API container (`API_UPSTREAM`,
  default `miel-api:3001`), stripping the `/api` prefix. No cross-origin request
  is made, so there is **no CORS preflight** for Cloudflare Access to reject.
- `WEB_ORIGIN` (the API's CORS allowlist) is now effectively a no-op for the
  browser path since requests are same-origin; leave it set to
  `https://miel.gousse.cool` anyway — it's harmless and covers any direct
  cross-origin client.
- The WS sync endpoint is reached at `/api/sync/ws` and proxied to the API's
  `/sync/ws` (the handler accepts both paths). nginx forwards the WebSocket
  upgrade (`Upgrade`/`Connection` headers, long read timeout); Cloudflare Access
  + Tunnel pass upgrades through. It still gates on `?token=<API_SECRET>`.
- The separate `miel-api.gousse.cool` host is **no longer required by the
  browser**. Keep it if you want direct CLI/headless access to the API; otherwise
  its Access app + tunnel route can be removed.

---

## 5. Smoke test after deploy

```bash
# From your laptop (you must be logged into the Google identity in your browser
# OR send service-token headers):
curl -i https://miel-api.gousse.cool/health
# -> 200 {"ok":true}

# Browser: open https://miel.gousse.cool, Cloudflare Access challenges with
# Google login, then the SPA loads and hits https://miel.gousse.cool/api/*
# (nginx proxies these to the API container — same-origin, no CORS).
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
