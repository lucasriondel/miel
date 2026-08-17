# Deploying miel to Dokploy + Cloudflare Access

One worked deployment, written down end to end — not the only way to run miel.
It is the maintainer's own, so the hostnames below are that install's: substitute
your own throughout. The host is configuration, not source (`SITE_HOST`, see
`.env.example`); it defaults to the host used here, so this deployment keeps
working unset.

Target: VPS running Dokploy, x86_64 Linux. The browser-facing hostname is
**path-routed across two containers**; the API also keeps a host of its own for
CLI use:

| Path | Container | Serves |
|---|---|---|
| `miel.gousse.cool/` | `miel-landing` | `@miel/landing-page` — prerendered static HTML, **public** |
| `miel.gousse.cool/app/*` | `miel-web` | `@miel/web` — the SPA, behind Cloudflare Access |
| `miel.gousse.cool/api/*` | `miel-web` | nginx proxy -> `@miel/api`, behind Cloudflare Access |
| `miel-api.gousse.cool` | `miel-api` | `@miel/api` direct (Bun + Hono on :3001), CLI/headless only |

Two images, not one. The landing pages are **not** copied into the app's image:
someone self-hosting Miel builds the app, not the owner's public site, so
`packages/web/Dockerfile` carries no landing content and
`packages/landing-page/Dockerfile` carries none of the app's dependencies (it
builds with no registry token at all). The split is written down as data in
`packages/landing-page/src/deploy/topology.ts`, which the package's test suite
checks this document against.

The SPA is served under `/app`, not at the root. nginx in the web container
answers `/app/*` (SPA, with a deep-link fallback) and `/api/*` (proxy to the API
container) and 404s everything else; nginx in the landing container serves the
three static pages and 404s everything else. No redirects exist from the old
root-level app URLs.

On `miel.gousse.cool`, Cloudflare Access gates `/app/*` and `/api/*` only (the
separate `miel-api.gousse.cool` host stays gated in full). The landing pages are
publicly readable, and they reference no external stylesheet, font, image or
script — so no subresource of a public page can end up behind the gate.

---

## 1. Dokploy applications

Create three **Applications** in Dokploy, all pointing at this repo:

### 1.1 `miel-api`

- Build type: **Dockerfile**
- Dockerfile path: `packages/api/Dockerfile`
- Build context: repo root (`.`)
- Exposed port: `3001`
- Domain: `miel-api.gousse.cool` (Traefik handles TLS via Let's Encrypt or Cloudflare origin cert)
- Build args: **none** (see the note under `miel-web` if this app still carries one)

**Runtime env vars** (set in Dokploy > Environment):

| Key | Value |
|---|---|
| `DATABASE_URL` | `postgres://miel:<password>@miel-postgres:5432/miel` (Dokploy-internal hostname) |
| `API_SECRET` | long random string |
| `API_PORT` | `3001` |
| `WEB_ORIGIN` | `https://miel.gousse.cool` (bare scheme://host — the `/app` prefix is appended in code) |
| `GOOGLE_CLIENT_ID` | from the Google Cloud OAuth client (see §2) |
| `GOOGLE_CLIENT_SECRET` | same client (Dokploy secret) |
| `GOOGLE_REDIRECT_URI` | `https://miel.gousse.cool/api/auth/google/callback` — registered on that client verbatim |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32`. **Required in prod**: it encrypts every stored Google refresh token *and* every stored provider API key |
| `CLAUDE_BIN` | `claude` (already baked into the image; set only to override) |

> **No AI credential is an env var.** The API key of a hosted provider —
> Anthropic, Google or OpenAI (#104, #105) — and the Claude Code token from
> `claude setup-token` (#109) are all pasted once in the running app, Settings →
> AI & Triage → Credentials, one row per provider (#110), and stored encrypted in
> Postgres under `TOKEN_ENCRYPTION_KEY`. After a fresh deploy there is no
> credential until someone pastes it: a hosted vendor cannot be selected until
> its key exists, because the settings route refuses it, and `claude-code` — the
> provider a fresh install starts on — fails its first triage with a clear "not
> configured" until its token exists.
>
> Setting `CLAUDE_CODE_OAUTH_TOKEN` in the deployment environment does nothing;
> nothing reads it. An instance that used to run on it has no AI credential until
> the token is entered once in Settings — nothing is imported.

> The worp attachment-ingest integration has no env vars either (#107). Its
> base URL, its API key and any headers needed to reach it through a proxy are
> entered in the running app, Settings → Integrations → worp, with the key and
> the headers encrypted in Postgres like a provider key. After a fresh deploy
> the relay is off until someone fills it in, and the send-to-worp route answers
> `worp_not_configured` (503) until then. Upgrading from a build that read
> `WORP_*` from the environment means entering those values once in Settings —
> nothing is imported.

Everything the deployment still needs from the environment is listed in
`.env.example`; `packages/core/src/env.ts` is what actually parses it.

> **Rotating `TOKEN_ENCRYPTION_KEY` invalidates every stored refresh token** and
> every stored secret in `encrypted_secrets` — each provider API key, plus worp's
> key and proxy headers. The accounts have to be reconnected through the flow in
> §2 and each secret entered again. Treat it like the database password, not like
> a build argument.

**Volumes: none needed.** This used to be the part that broke, back when a CLI
held the Google tokens in a keyring on disk and every rebuild lost them. Neither
credential lives on disk now: Google refresh tokens are stored encrypted in
Postgres (so they persist with the database), and the Claude Code token is
a Postgres row too, injected into each `claude -p` subprocess — there is no
interactive login inside the container to preserve.
`CLAUDE_CONFIG_DIR` is baked into the image and points at a writable `HOME` for
the CLI's incidental state, which is disposable.

### 1.2 `miel-web`

- Build type: **Dockerfile**
- Dockerfile path: `packages/web/Dockerfile`
- Build context: repo root
- Exposed port: `80`
- Domains (**two entries, both with a path** — this app no longer owns the whole host):
  - `miel.gousse.cool` path `/app`
  - `miel.gousse.cool` path `/api`

**Build args** (set in Dokploy > Build Arguments — these are baked into the bundle, NOT runtime env):

| Key | Value |
|---|---|
| `VITE_API_BASE` | `/api` |
| `VITE_API_SECRET` | same value as the API's `API_SECRET` |

> **Those two, and nothing else.** Both images used to take a GitHub Packages
> read token as a build argument, for a private design-system dependency the app
> no longer has. No image reads a registry credential now, so **delete any
> leftover token build argument from the `miel-web` and `miel-api` applications**
> in Dokploy (App -> Build -> Build Arguments) — a build argument nothing
> consumes is a credential sitting in a dashboard for no reason. The PAT itself
> should be revoked at https://github.com/settings/tokens.

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

### 1.3 `miel-landing`

The public site — homepage, privacy policy, terms — as its own nginx image.

- Build type: **Dockerfile**
- Dockerfile path: `packages/landing-page/Dockerfile`
- Build context: repo root
- Exposed port: `80`
- Domain: `miel.gousse.cool` path `/`
- Build args: **none**
- Runtime env: **none**

> **Why no build args.** The image copies every workspace manifest (so `bun
> install --frozen-lockfile` resolves) but installs with
> `--filter=@miel/landing-page`, so none of the app's dependencies are fetched
> into it. If you paste the web app's build args in here out of habit, the build
> still works — they're simply unused.

The image runs `bun run build` for the package, which prerenders the three routes,
staticizes them into `dist/public` (no scripts, no fetchable subresource) and then
verifies each built page carries its whole text as raw HTML. A page that regressed
to client-only rendering **fails the image build**, so it can't reach the domain.

nginx serves `dist/public` at the document root with `try_files $uri $uri/ =404`:
`/privacy` resolves to `privacy/index.html` and anything unknown 404s rather than
being answered with the homepage — a single-page fallback would hide a routing
mistake by serving landing HTML for an app URL.

#### Path routing across the two containers

Both `miel-web` and `miel-landing` are attached to the **same host**, separated by
path. Dokploy turns each domain entry into a Traefik router:

| Traefik rule | Router | Backend |
|---|---|---|
| ``Host(`miel.gousse.cool`) && PathPrefix(`/app`)`` | web | `miel-web` |
| ``Host(`miel.gousse.cool`) && PathPrefix(`/api`)`` | web | `miel-web` |
| ``Host(`miel.gousse.cool`) && PathPrefix(`/`)`` | landing | `miel-landing` |

> **Why this works without setting priorities.** Traefik breaks ties between
> matching routers by **rule length**, longest first. ``PathPrefix(`/app`)`` is a
> longer rule than ``PathPrefix(`/`)``, so the app wins its own prefix and the
> landing container gets everything else. If a request for `/app/` ever returns
> the homepage instead, the two routers tied — set the app routers' `priority`
> explicitly (higher = evaluated first) via a Traefik label on the web app.

> **TLS.** Both apps request a certificate for the same hostname. Leave the
> certificate provider set on one of them (the web app, which already has a Let's
> Encrypt cert) and set the other to none/inherit; two resolvers racing for the
> same host is how you get rate-limited.

### 1.4 Postgres

Provision a Postgres service in Dokploy (image `postgres:16`). Take note of the
internal hostname and credentials to plug into `DATABASE_URL` above. Migrations
run automatically on API container startup (see `packages/api/src/index.ts`).

---

## 2. Connecting a Gmail account (in-app Google OAuth)

Gmail I/O is done in-process through the Gmail REST API, and accounts are
connected **from the browser** — there is no CLI to exec into and no token file
to bootstrap. Nothing has to be run on the VPS for this.

**Once, in Google Cloud Console:**

1. Enable the **Gmail API** on the project.
2. Credentials → **OAuth client ID** → type **Web application**.
3. Add both redirect URIs to that client, verbatim:
   - `https://miel.gousse.cool/api/auth/google/callback` (prod — the API is
     reached through the web container's `/api` proxy, so the URI carries it)
   - `http://localhost:3001/auth/google/callback` (local dev, if you develop
     against the same client)
4. Put the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
   in the `miel-api` environment, and the prod URI into `GOOGLE_REDIRECT_URI`.
5. While the consent screen is in **Testing**, add each address that will connect
   under **Audience → Test users**, or the flow ends in `access_denied`. Personal
   use needs no verification.

**Then, per account:** open `https://miel.gousse.cool/app`, and click **Connect
with Google** (the onboarding gate on first run, Settings → Accounts afterwards).
The API returns a consent URL carrying an opaque `state`; Google redirects the
browser back to `/api/auth/google/callback`, which verifies the state, exchanges
the code, reads the profile and upserts the account. The refresh token is
encrypted with `TOKEN_ENCRYPTION_KEY` and stored in Postgres.

The scopes requested are listed in `packages/core/src/google/scopes.ts`, which is
also what the public homepage's permission table is generated from.

> **`GOOGLE_REDIRECT_URI` must match the registered URI byte for byte** — scheme,
> host, path, no trailing slash. A mismatch surfaces as Google's
> `redirect_uri_mismatch` before the app is ever reached. `invalid_client` means
> the client ID or secret is wrong instead.

> **Re-connecting.** A revoked or expired refresh token surfaces in the app as
> the account needing re-authentication; click **Connect with Google** again for
> that address. Nothing to run in a shell, and no state on the VPS to clear.

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

Prereqs: your domain's zone in Cloudflare; a Zero Trust team; `cloudflared`
installed on the VPS.

Two names below are yours and are written as placeholders throughout, because
unlike the site host they are not configuration this repo reads — substitute
them as you go:

| Placeholder | What it is | Where to find it |
|---|---|---|
| `<cf-team>` | Your Zero Trust team name, used as `<cf-team>.cloudflareaccess.com` | Zero Trust dashboard → Settings → Custom Pages (team domain) |
| `<tunnel-name>` | The name you give the `cloudflared` tunnel | Networks → Tunnels, when you create it |

### 3.1 Hostnames — why `miel-api`, not `api.miel`

| Host | Serves | Notes |
|---|---|---|
| `miel.gousse.cool` | `@miel/landing-page` at `/`, `@miel/web` at `/app` and `/api` | first-level subdomain, path-routed across two containers |
| `miel-api.gousse.cool` | `@miel/api` | **first-level on purpose** |

> **Gotcha — Universal SSL only covers one subdomain level.** The free
> Cloudflare cert is `*.gousse.cool`, which matches `miel.gousse.cool` and
> `miel-api.gousse.cool` but **NOT** a two-level host like `api.miel.gousse.cool`
> (wildcards match one label only). A two-level host fails the edge TLS
> handshake (`sslv3 alert handshake failure`) unless you buy an Advanced
> Certificate (~$10/mo). We flattened the API host to `miel-api` to stay on the
> free cert. Don't reintroduce a two-level host without buying the cert.

### 3.2 The Tunnel

A dashboard-managed (remote) tunnel named **`<tunnel-name>`** runs as a systemd
service on the VPS (installed via `cloudflared service install <token>`). All
routing config lives in the Cloudflare dashboard — there is **no local
`config.yml` / `cert.pem`**, so `cloudflared tunnel list` on the box errors
("Cannot determine default origin certificate path"). That's expected for a
remote-managed tunnel; manage it at **Networks → Tunnels → `<tunnel-name>`**.

**Routes** (Networks → Tunnels → `<tunnel-name>` → **Routes** tab — the new UI renamed
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
   `https://<cf-team>.cloudflareaccess.com/cdn-cgi/access/callback`
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

**What the gate must cover** — this is the change the owner applies by hand when
the landing container ships. Previously one application covered the whole host;
it now has to be narrowed to the app's two prefixes, or the public pages sit
behind a login prompt:

| Path | Access coverage |
|---|---|
| `/` (and `/privacy`, `/terms`) | **none** — no Access application matches, the pages are public |
| `/app` | gated — Access application "miel app", policy "owner" |
| `/api` | gated — Access application "miel api proxy", policy "owner" |

**App — miel app** (edit the existing "miel web" app rather than adding one)
- Application domain: host `miel.gousse.cool`, **path `app`**
- Session duration: 30 days · Identity providers: Google
- Policy "owner": Allow / `Emails == <your Google address>`

**App — miel api proxy** (new)
- Application domain: host `miel.gousse.cool`, **path `api`**
- Session duration: 30 days · Identity providers: Google
- Policies:
  1. "owner" — Allow / `Emails == <your Google address>`
  2. "cli" — Service Auth / Service Token == `miel-cli` (only if you call the
     same-origin proxy from a script; the direct `miel-api.gousse.cool` host below
     already has this)

> **Gotcha — the path field, and the order of operations.** An Access application
> whose domain is the bare host matches every path on it, including `/privacy`.
> Add the path-scoped applications **first**, confirm `/app/` still challenges,
> and only then remove the host-wide one — deleting it first leaves the app
> ungated with the bearer token baked into its bundle.
>
> Access matches the most specific application, so a leftover host-wide app would
> not shadow the path-scoped ones — it would gate the landing pages, which is the
> failure this narrowing exists to prevent. Check with the curl block in §3.6.
>
> The landing pages reference no external stylesheet, font, image or script (the
> build fails if one appears), so there is no subresource to reason about: a public
> page cannot pull in a gated URL.

**App — miel api**
- Application domain: `miel-api.gousse.cool`
- Session duration: 30 days · Identity providers: Google
- Policies:
  1. "owner" — Allow / `Emails == <your Google address>`
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
# app + api: unauthenticated should 302 to the Access login, NOT load the app.
curl -sI https://miel.gousse.cool/app/     | grep -iE 'http/|location'
curl -sI https://miel.gousse.cool/api/health | grep -iE 'http/|location'
curl -sI https://miel-api.gousse.cool/     | grep -iE 'http/|location'
# -> HTTP/2 302 + location: https://<cf-team>.cloudflareaccess.com/...

# The public pages: 200 with no login, from a browser with no Access session
# (use --no-cookie-jar / a private window). Anything but 200 means the Access
# application is still host-wide, or the path routing sent / to the app.
for url in https://miel.gousse.cool/ \
           https://miel.gousse.cool/privacy \
           https://miel.gousse.cool/terms; do
  curl -s -o /dev/null -w "$url %{http_code}\n" "$url"
done
# -> 200 / 200 / 200, and each body contains its own text (no JS needed):
curl -s https://miel.gousse.cool/privacy | grep -ci 'contact'

# /health is exempt from the API's bearer auth but still behind Access here.
curl -sI https://miel-api.gousse.cool/health

# From the VPS, confirm Traefik serves both hosts on :443 (origin healthy):
ssh <vps> 'curl -ks -o /dev/null -w "%{http_code}\n" -H "Host: miel.gousse.cool"     https://localhost:443/app/
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
  nat rules that **bypass `ufw`** — use your host provider's network firewall
  (the one in its control panel, applied before Docker) or bind Traefik to
  `127.0.0.1`, not `ufw deny`.
- The web host's LE cert renews via **HTTP-01 on port 80**. If you fully close
  80, renewal breaks in ~90 days — either keep 80 reachable from Cloudflare IPs,
  or switch Dokploy/Traefik to **DNS-01** (Cloudflare API token) challenges.

Keep your SSH port open in any firewall change — don't lock yourself out.

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
- **Path-routing the host across two containers does not touch any of this.**
  `/api` is routed to `miel-web`, which proxies it on; the landing container is
  never in that path and proxies nothing. The one rule to keep: `/api` must stay
  *outside* `/app` and on the *same host* as the app, or the bundle starts making
  cross-origin calls again and the preflight failure above comes back.

---

## 5. Smoke test after deploy

```bash
# From your laptop (you must be logged into the Google identity in your browser
# OR send service-token headers):
curl -i https://miel-api.gousse.cool/health
# -> 200 {"ok":true}

# Browser: open https://miel.gousse.cool/app, Cloudflare Access challenges with
# Google login, then the SPA loads and hits https://miel.gousse.cool/api/*
# (nginx proxies these to the API container — same-origin, no CORS).
#
# Deep links must survive a reload — nginx falls back to /app/index.html:
curl -s -o /dev/null -w "%{http_code}\n" https://miel.gousse.cool/app/settings

# The bare /app (no trailing slash) redirects to /app/ with a RELATIVE location.
# An absolute `http://…` here means `absolute_redirect off;` fell out of the web
# container's nginx config: the visitor gets bounced off HTTPS and back through
# Traefik's 308 on the way into the app.
curl -sI https://miel.gousse.cool/app | grep -i '^location:'
# -> location: /app/

# Private window, no Access session: the landing container answers the root and
# the two legal pages with 200 and the full text in the HTML.
curl -s -o /dev/null -w "%{http_code}\n" https://miel.gousse.cool/
curl -s https://miel.gousse.cool/terms | grep -c 'AS IS'
# An unknown path under / is a 404 from the landing container, not the homepage:
curl -s -o /dev/null -w "%{http_code}\n" https://miel.gousse.cool/nope
```

> **If `/` shows the app's 404 instead of the homepage**, the landing app's
> Traefik router isn't attached to the host — check its Domain entry (host
> `miel.gousse.cool`, path `/`) rather than the container, which is serving fine.
> `docker exec miel-landing curl -sI localhost/privacy` tells the two apart.

---

## 6. Operational notes

- **Re-connecting a Google account.** A refresh token that was revoked or lost a
  scope shows up in the app as the account needing re-authentication: click
  **Connect with Google** for that address (§2). Nothing to run on the VPS.
- **Rotating `API_SECRET`.** Must be changed in BOTH the API runtime env AND
  the web build args (rebuild web). The web bundle bakes the secret at build
  time.
- **Rotating `TOKEN_ENCRYPTION_KEY`.** Only with a reason — every stored refresh
  token is encrypted with it, so rotating means reconnecting every account.
- **Logs.** `docker logs miel-api` shows startup + migration logs; the Gmail and
  Claude services log under `DEBUG=miel:*`.
- **Changing the public pages.** Redeploy `miel-landing` only — it shares nothing
  with the app at runtime. Editing a Google scope in `@miel/core` changes the
  homepage's permission table, so redeploy it after a scope change too, or the
  published disclosure lags the consent screen.
- **Changing `/app` or `/api`.** `APP_BASE_PATH` in
  `packages/core/src/appBasePath.ts` is the app's prefix, and
  `packages/landing-page/src/deploy/topology.ts` is the routing table. Both feed
  tests that read this file, so a prefix change fails the suite until the Dokploy
  domain entries and the Access application paths above are updated to match.
