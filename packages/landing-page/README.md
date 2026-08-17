# @miel/landing-page

The public site for Miel — homepage, privacy policy and terms of service — a
TanStack Start app that is **prerendered** to static HTML at build time rather
than served by a running Nitro server.

| Route | Built file | What it says |
|---|---|---|
| `/` | `dist/public/index.html` | What Miel is, why it exists, how to install it, how to contribute, the Google permissions it asks for, what goes to the AI provider |
| `/privacy` | `dist/public/privacy/index.html` | What is fetched and stored, what leaves the machine, tokens, retention, deletion |
| `/terms` | `dist/public/terms/index.html` | As-is with no warranty, self-hoster responsibility, licensing, no uptime commitment |

Each page links to the other two: the homepage from the footer and from under
the AI-provider disclosure, the legal pages from the footer and the wordmark.

The homepage's own sections — motivation, installation, how to contribute — are
navigated by a side menu (`SideMenu.tsx`) styled as the app's sidebar. It is
plain `#anchor` links, since the page ships no JavaScript: there is no scroll
spy, and `section:target` is the only active state, which is the honest one. On
a narrow viewport it collapses from a sticky column into a row of pills that
scrolls inside itself rather than widening the page. The copy lives in
`src/content/guide.ts` as data, derived from the root `README.md`.

## How it looks like the app without depending on it

It carries none of the app's UI dependencies — not the gousse design system the
app vendors, not Tailwind, not React Router — so its image builds from this
package's manifest alone. Styles are hand-written in `src/styles.ts` and inlined
into a `<style>` element.

What it does share is the *look*. The tokens at the top of `src/styles.ts` are
the light and dark values of `--gousse-bg`, `--gousse-panel`, `--gousse-ink` and
`--gousse-line`, **copied** from `packages/web/src/styles/gousse/tokens.css`
rather than imported — importing them would be the dependency this package
exists not to have. They can therefore drift; `src/styles.test.ts` holds the
contrast floor either way.

The side menu borrows the app's sidebar shape, and the screenshot beside the
hero copy is the app itself, so the page reads as the same product without
linking to a line of its code. That hero row is the only thing on the page
allowed past the 66rem column: it extends rightward into the margin so the
screenshot is large enough to read, while its left edge stays on the line every
section below starts at. Under 52rem it stacks, copy above image.

## The images, and why they are inlined the way they are

Two of the app's own images appear on the homepage — the real files, not a
redrawing of them:

- `BeeMark.tsx` — the app icon, `packages/web/public/miel.webp`.
- `AppPreview.tsx` — the inbox screenshot the root README opens with, in both
  schemes: `docs/miel-light.webp` and `docs/miel-dark.webp`.

They reach the page as base64 `data:` URIs in `src/content/assets.ts`, which is
**generated** — regenerate it with `bun run encode-assets` after changing any
source image. `src/content/assets.test.ts` re-encodes the sources and compares,
so a source that changed without a regeneration fails the suite rather than
shipping a stale picture.

The awkward part is where the URI is allowed to sit, and it is worth knowing
before editing either component:

| Form | Verdict |
|---|---|
| `<img src="data:...">` | **Rejected.** The build's scan reports every `<img>`, data URI or not. |
| `url(data:...)` in `styles.ts` | **Rejected.** `styles.test.ts` asserts the stylesheet contains no `url(` at all. |
| `style="background-image:url(data:...)"` | **Accepted** — and what both components use. |

A style attribute cannot be switched by a media query, so `AppPreview` renders
both screenshots and the stylesheet shows one, exactly as the README's
`<picture>` does with its `prefers-color-scheme` source. A dark-mode reader gets
the dark screenshot rather than a light one.

Carrying pixels costs page weight: the homepage is ~158 KB against ~25 KB for
the legal pages. `encode-assets` is what keeps that bounded, and the width it
encodes to is **2x the largest CSS size the page renders each image at** — a
retina display asks for two device pixels per CSS pixel, and anything less gets
upscaled, which reads as a blurry screenshot rather than a smaller one.

That multiplier is the thing to recompute when the layout changes. The
screenshot's widest case is the hero at its 82rem ceiling, where the image track
is 6/10 of (82rem − 3rem gap) ≈ 758 CSS px, so it ships at 1520. Change the
hero's max width or its column ratio and this width has to follow;
`scripts/encode-assets.ts` carries the arithmetic beside the numbers.
`assets.test.ts` holds a ceiling on the total payload to catch a re-encode at
the sources' full 1800px, which buys nothing because nothing renders them that
large.

## The one workspace dependency

`@miel/core` — imported only through leaf subpaths, `@miel/core/googleScopes` and
`@miel/core/claudeUsage`, so no db or env code comes with it. The permission
table's rows are generated from `GOOGLE_SCOPES`, the same array the OAuth consent
URL is built from, and the AI-provider disclosure quotes the batch-size and
truncation constants the sync and reply services apply. Neither can drift from
what the app actually does without failing a test here.

Those subpaths resolve to core's TypeScript source, not its emitted `dist`, so
`turbo.json` drops the default `^build` edge for this package's build, test and
typecheck. The public page stays buildable even when another package does not
compile.

## Build output

```bash
bun run build
```

1. `vite build` prerenders every page listed in `vite.config.ts`'s `pages` into
   `dist/client`, alongside a client bundle for hydration.
2. `scripts/staticize.ts` rewrites each page into `dist/public`, dropping the
   hydration scripts and inlining anything the browser would otherwise fetch. It
   throws if a page still references an external asset afterwards.
3. `scripts/verify-prerendered.ts` reads the three built files back and checks
   each against its contract in `src/build/verifyPrerendered.ts`. The build fails
   if a page stopped carrying its own text.

`dist/public` is what gets copied into the nginx document root. Every file in it
renders completely with JavaScript disabled and references no external
stylesheet, font, image, or script — verifiable with `grep` on the built HTML.
The images the homepage shows are inline `data:` URIs, which the browser never
fetches; see the images section above.

## The prerendered-output check

`bun run verify` (or the last step of `bun run build`) asserts, per page, that
the app name, every scope's consent wording and feature explanation, the
AI-provider disclosure, the contact address, the GitHub link and the cross-links
between the three pages are all in the raw HTML.

Two things make it stronger than a `grep`:

- It compares against the page's **rendered text** — script and style contents
  removed, tags dropped, entities decoded — so copy that survives only inside a
  hydration payload counts as missing. That, plus an external-reference scan, an
  empty-mount-element scan and a floor on how much text a page renders relative
  to what it must state, is what makes a regression to client-only rendering
  fail rather than ship.
- The contracts are derived from the content modules the pages render from —
  `SCOPE_DISCLOSURES` above all, itself derived from core's `GOOGLE_SCOPES` — so
  adding a scope extends the check by itself. There is no second list.

It lives in the build rather than in `bun test` because it needs the build to
have run; `bun test` stays runnable on a clean checkout. Run on its own without
a build, it prints which command to run instead of failing obscurely, and it
accepts a directory argument (`bun run verify path/to/public`) so a copy of the
output can be checked in place.

The legal pages are emitted as directory indexes — `privacy/index.html`, not
`privacy.html` — while the links to them are extensionless (`/privacy`). Whatever
serves them therefore needs the usual `$uri/` fallback, which `nginx.conf` here
provides.

## The container, and how the domain is split

`Dockerfile` builds this package into its own nginx image. It is **not** part of
the app's image: someone self-hosting Miel builds the app, not the owner's public
site, so `packages/web/Dockerfile` carries no landing HTML and this one carries
none of the app's dependencies.

```bash
# build context is the repo root, not this directory
docker build -f packages/landing-page/Dockerfile -t miel-landing .
docker run --rm -p 8080:80 miel-landing   # http://localhost:8080/privacy
```

It needs **no build arg**. Every workspace manifest is copied in so `bun install
--frozen-lockfile` resolves, but the install is `--filter=@miel/landing-page`, so
none of the app's dependencies are fetched into the image.

The builder runs this package's own `build` script, so the prerender, the
staticize step and the output check all run inside the image: a page that stopped
carrying its text as raw HTML fails `docker build`.

The runner copies `dist/public` (never `dist/client`, which still holds the
hydrating bundle) to the nginx document root and serves it with
`try_files $uri $uri/ =404` — no single-page fallback, so a request for an app URL
that lands here 404s instead of being answered with the homepage. `absolute_redirect
off` keeps nginx's trailing-slash redirect relative; an absolute one would name
`http://` and loop against Traefik's HTTPS redirect.

One hostname, two containers, split by path:

| Path | Container |
|---|---|
| `/`, `/privacy`, `/terms` | `miel-landing` — this image, public |
| `/app/*` | `miel-web` — the SPA, behind Cloudflare Access |
| `/api/*` | `miel-web` — nginx proxy to the API, behind Cloudflare Access |

`src/deploy/topology.ts` is that table as data. It takes the app's prefix from
`@miel/core/appBasePath`, the same constant the app's Vite `base` and router
`basename` come from, and derives the Access boundary from the routes — so the
suite can assert that everything the web container answers is gated and nothing a
landing-page reader can reach is. The reverse-proxy rules and the Access policies
themselves are dashboard configuration; `DEPLOY.md` §1.3 and §3.4 say what to set,
and `src/deploy/containers.test.ts` checks that document against the table.

## Dev

```bash
bun run dev   # http://localhost:5200
```

Port **5200** is assigned in the shared registry at `~/dev/PORTS.md`. It is
pinned with strict-port in `vite.config.ts` as well as in the `dev` script, so
the port holds however the server is started and a clash fails to start rather
than silently moving to whatever is free.

## Tests

```bash
bun test
```

One per promise the pages make. None of them needs a build — the built pages are
the verification step's business, not this suite's:

- `src/content/scopes.test.ts` — the highest-value test here: the disclosure
  table corresponds exactly to `GOOGLE_SCOPES`, in both directions. A scope added
  to the app but not documented fails it; a documented scope the app no longer
  requests fails it too.
- `src/content/site.test.ts` — the homepage copy is plain data, asserted for the
  facts the page has to state, including the AI-provider disclosure's figures.
- `src/content/guide.test.ts` — the motivation, installation and contribution
  copy. The commands matter most: a wrong clone URL or a stale migrate path
  sends a reader to a shell that fails, so each is asserted against what the
  repository actually has. It also holds the prose to plain text — the page
  renders HTML, never Markdown, so a backtick typed out of habit would reach
  the reader as a backtick.
- `src/content/assets.test.ts` — the generated `assets.ts` still encodes to what
  the source images produce today, so an edited screenshot cannot ship as a
  stale one; plus every embedded image is inline rather than a URL, and the
  total payload stays under a ceiling. The re-encode is skipped where `cwebp`
  is not installed; the rest still runs.
- `src/content/legal.test.ts` — the facts the privacy policy and terms are
  required to state, including that the claim about a vendor's training terms
  stays hedged: the test fails if the copy ever asserts these inputs are
  excluded from training, because nobody has verified that.
- `src/build/verifyPrerendered.test.ts` — the prerendered-output check itself,
  on synthetic HTML: what counts as rendered text, what a client-rendered shell
  looks like, and that the contracts derive their scope assertions from
  `SCOPE_DISCLOSURES` rather than restating them. The check runs against the
  real built pages in `bun run build`.
- `src/build/staticize.test.ts` — the transform as a pure function, including
  what counts as an external reference. `url()` and `@import` inside an inlined
  `<style>` count: inlining a stylesheet moves its fonts and images into the
  document, so a check that only looked at tags would have a hole exactly where
  the build widens it.
- `src/styles.test.ts` — the two things a browser would show, asserted on the
  stylesheet instead: WCAG AA contrast for body text, muted text, links and the
  CTA label in both schemes, and the declarations that cause sideways scrolling
  at 375px.
- `src/deploy/topology.test.ts` — the path split: every prerendered page is
  answered by the landing container, `/app` and `/api` by the web container, a
  prefix matches whole segments (`/appointments` is not the app), and the Access
  boundary covers exactly the web container's paths — so no page a reader can
  reach is gated.
- `src/deploy/containers.test.ts` — the two Dockerfiles and both nginx configs,
  read as instructions and directives rather than as text: no credential reaches
  the landing image, every workspace manifest is copied before the frozen
  install, only core and this package are built, the app's image mentions the
  landing package in no instruction at all, and `DEPLOY.md` states the routing
  and the Access change the owner has to apply.

  The app's config is the other half of the split, so it is asserted here too:
  the bare `/app` redirects to the directory form and does so *relatively*
  (an absolute `Location` would name `http://` and bounce the visitor through
  Traefik's 308 on the way in), deep links fall back to the app's own index, a
  missing asset 404s, the API proxy sits outside the app prefix and strips it,
  and every path the landing container owns is refused rather than answered with
  the app — a single-page fallback at the root would hide a misrouted `/` by
  serving a gated app to someone who came for the homepage.

  `src/deploy/dockerfile.test.ts` and `src/deploy/nginx.test.ts` cover the two
  small parsers those assertions run on; the nginx one resolves a request to the
  location that answers it using nginx's own precedence rules, since neither
  container can be run in this environment.
- `src/build/packageContract.test.ts` — the dev port is 5200 and strict, no
  dependency comes from a registry that needs a token, `@miel/core` is the only
  workspace dependency and is reached through leaf subpaths, no turbo task here
  waits on another package's build, and the prerendered-output check runs at the
  end of the build rather than in `bun test`.
