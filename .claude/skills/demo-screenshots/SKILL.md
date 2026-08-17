---
name: demo-screenshots
description: Boot a throwaway demo stack of miel in Docker, seed it with the fake inbox, and capture the light and dark app screenshots that README.md and the landing page show. Use when the user asks to take, retake, refresh or update the app screenshots, the README image, the landing-page hero shot, or docs/miel-light.webp / docs/miel-dark.webp — or after a UI change that makes the shipped screenshots stale.
---

# Demo screenshots

Produces the two files the repo publishes as pictures of the app:

| File | Shown by |
|---|---|
| `docs/miel-light.webp` | `README.md`'s `<picture>`, light scheme |
| `docs/miel-dark.webp` | the same `<picture>`, dark scheme |

The landing page shows the same two, re-encoded into
`packages/landing-page/src/content/assets.ts` as `data:` URIs. That file is
generated, and a test fails if it stops matching the sources — so **step 6 is
not optional**: a new screenshot without it breaks `bun test`.

Nothing here touches a real Gmail account. The inbox in the picture is written
straight into a throwaway Postgres by `packages/cli/scripts/seed-demo.ts`, and
the stack it runs against has no Google or Anthropic credentials at all.

## Before starting

Check the tools exist, and fail early rather than after a five-minute build:

```bash
docker info >/dev/null && which cwebp ffmpeg
```

`brew install ffmpeg webp` if either is missing. Docker must be running.

The chrome-devtools MCP tools attach to an **already-running** Chrome with a
remote debugging port open; with none, every call fails with `Could not connect
to Chrome`. Check for one, and ask the user to start it rather than launching a
browser over their session unasked:

```bash
curl -sf http://127.0.0.1:9222/json/version >/dev/null && echo "chrome ready"
```

If it is not ready, hand the user this to run themselves (`! <cmd>` in the
prompt), using a separate profile so their own windows are untouched:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 --user-data-dir=/tmp/miel-shots-chrome
```

Two things about that browser decide whether the shot is usable, both handled in
steps 3 and 4 — read them before capturing anything:

- it will open **maximized**, and `resize_page` cannot shrink a maximized window
  (it fails silently) — the viewport is set over CDP instead, and the width is
  what decides whether the screenshot is readable;
- it starts with no theme set, so the scheme comes from the machine's
  `prefers-color-scheme` until `miel-theme` is written.

Whatever happens, **step 7 still runs** — it is what keeps a stopped run from
leaving containers, a volume and two images behind.

## 1. Bring up the demo stack

Its own compose file, its own project name, its own volume and its own ports —
so it coexists with `bun dev` and with the self-host stack, and so seeding can
never delete anything from the real `miel-pgdata`.

```bash
docker compose -p miel-demo -f docker-compose.demo.yml up -d --build
```

| Service | Host port |
|---|---|
| web | http://localhost:5210/app |
| api | http://localhost:5511 |
| postgres | 5436 |

The first run builds two images and takes a few minutes; later runs reuse them.
Wait for the API to answer before going on:

```bash
until curl -sf http://localhost:5511/health >/dev/null; do sleep 2; done
```

## 2. Migrate and seed

Both run on the host against port 5436 — `DATABASE_URL` is passed inline so the
repo's `.env` (which points at the dev database on 5435) cannot be picked up by
accident. The seed also needs the demo stack's `TOKEN_ENCRYPTION_KEY`, because
it writes the placeholder Claude Code token that makes Settings show a
configured install: encrypt it under your own `.env` key and the API container
cannot decrypt it.

```bash
DATABASE_URL=postgres://miel:miel@localhost:5436/miel \
  bun run packages/core/src/db/migrate.ts

DATABASE_URL=postgres://miel:miel@localhost:5436/miel \
TOKEN_ENCRYPTION_KEY=ZGVtby1zY3JlZW5zaG90cy1rZXktbm90LXNlY3JldC0= \
  bun run packages/cli/scripts/seed-demo.ts
```

The seed prints `seeded demo account: demo@mielapp.dev` plus the counts. It is
idempotent: it deletes any prior demo account first, so re-running it after
editing the message list is the normal way to change what the picture shows.

Read `packages/cli/scripts/seed-demo.ts` when the user wants different mail in
the shot — the messages, labels, priorities and the one suggested filter are all
literals at the top of that file.

## 3. Open the app and check what will be in frame

Use the **chrome-devtools MCP tools** (`new_page`, `navigate_page`,
`resize_page`, `evaluate_script`, `take_screenshot`).

```
new_page       http://localhost:5210/app
```

1800x1209 is the shipped pair's shape, and `packages/landing-page/src/styles.ts`
pins the hero frame's `aspect-ratio` to `1800 / 1209`. Capturing at a different
shape means changing that number too — say so rather than doing it silently.

### Shoot at a ~1370px CSS viewport, not 1800

The output file is always 1800px wide, but **the CSS viewport decides how much
UI is crammed into it**, and that is what makes the screenshot readable or not.
At an 1800px CSS viewport the app lays out for a huge window: the sidebar is a
fixed 224px, so it takes only 6.7% of the frame, and body text lands around 8px
in the final image — legible on a 5K monitor, unreadable in a README.

Capture at **1370x920 CSS** instead. Same 1.489 aspect, but fewer and larger
elements: the sidebar is 16.4% of the frame and the text is readable at the
size people actually view the picture. Verify with the sidebar fraction, which
is the quickest tell:

```js
// evaluate_script — expect sidebarFrac ~0.16, NOT ~0.067
() => { const nav = document.querySelector("nav, aside");
        const r = nav?.getBoundingClientRect();
        return { w: innerWidth, h: innerHeight,
                 sidebarFrac: r ? +(r.width / innerWidth).toFixed(4) : null }; }
```

Chrome captures at DPR 2, so the PNG lands at 2740x1840 and
`finish-screenshot.ts` downscales it to 1800 — a real downscale, so no
sharpness is lost.

### `resize_page` alone will not give you that shape

`resize_page` is a **no-op on a maximized window**, and it fails silently — it
returns the page list as if it worked. On a maximized Chrome you get the full
screen (e.g. 3360x1772, aspect 1.90 instead of 1.49) and only find out after
encoding. Un-maximizing the window first is not reliable either: macOS snaps it
back, and every `navigate_page` reload undoes the sizing.

**Use the CDP device-metrics override instead** — it pins the viewport
regardless of the window, which `resize_page` cannot do:

```bash
bun run .claude/skills/demo-screenshots/set-viewport.ts
```

The override is **cleared by every reload**, so re-run it after each
`navigate_page` and **verify before every capture** — never trust it blind:

```js
// evaluate_script
() => { const nav = document.querySelector("nav, aside");
        const r = nav?.getBoundingClientRect();
        return { w: innerWidth, h: innerHeight,
                 dark: document.documentElement.classList.contains("dark"),
                 scrollY: window.scrollY,
                 sidebarFrac: r ? +(r.width / innerWidth).toFixed(4) : null }; }
```

Require `w: 1370`, `h: 920`, `scrollY: 0` and `sidebarFrac ≈ 0.16` before
shooting. (`devicePixelRatio` reports a rounded `2` here — ignore it; check the
PNG is 2740x1840 instead.)

Then confirm with `take_screenshot` that the seeded mail is actually visible:

- the account picker shows **demo@mielapp.dev** (if a stale account is selected,
  pick the demo one — the seed writes a new account id each run);
- the inbox lists messages rather than "No messages this week". The default
  window is 7 days and the seed spreads messages over 0–6 days ago, so if it is
  empty the seed did not reach the database the app is reading.

## 4. Capture both schemes

The app's theme is a `.dark` class on `<html>`, set by the inline boot script in
`packages/web/index.html` before React mounts. `emulate` does nothing here.

**The key to set is `miel-theme`.** That is the only one the boot script reads.
There is a second key, `gousse-theme`, written by `useTheme.ts` — it is
**write-only** and setting it has no effect on load (`getInitialTheme()` reads
the `.dark` class, not storage). Set only `gousse-theme` and the boot script
falls through to `prefers-color-scheme`: on a dark-mode Mac you silently capture
**two dark frames** and the README's light slot ships a dark picture.

Set both — `miel-theme` decides the frame, `gousse-theme` keeps the in-app
toggle consistent if anything clicks it:

```js
// evaluate_script, then navigate_page (type: "reload")
() => { localStorage.setItem("miel-theme", "light");    // then: "dark"
        localStorage.setItem("gousse-theme", "light");  // then: "dark"
        return localStorage.getItem("miel-theme"); }
```

The chrome-devtools MCP tools can only write **inside the repo** — a scratchpad
path under `/private/tmp` is rejected with `is not within any of the configured
workspace roots`. Capture into a temp dir in the repo and delete it in step 7:

```bash
mkdir -p .shots-tmp
```

Run this exact loop **once per scheme**, because the reload in the middle undoes
the sizing from step 3:

1. `evaluate_script` — set both keys to the scheme
2. `navigate_page` — `type: "reload"`
3. `bun run .claude/skills/demo-screenshots/set-viewport.ts` (the reload cleared
   the override)
4. `evaluate_script` — the verify snippet from step 3. Require `w: 1370`,
   `h: 920`, `scrollY: 0`, `sidebarFrac ≈ 0.16`, and `dark: true` for dark /
   `dark: false` for light. If any is wrong, fix it and re-verify — do not shoot.
5. `take_screenshot` → `.shots-tmp/miel-light.png` (or `miel-dark.png`)

Skipping steps 3–4 for the second scheme is exactly how the two frames end up
different sizes.

Both frames must show the same inbox, same scroll position, same selected
account — the README swaps them on the reader's colour scheme, and a pair that
disagrees looks like a glitch. Nothing may be hovered, focused or half-open
unless the user asked for that state.

Before encoding, check the pair really matches — this catches a lost resize:

```bash
for f in .shots-tmp/miel-light.png .shots-tmp/miel-dark.png; do
  echo -n "$f: "
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f"
done
```

Both must print `2740,1840`. Anything else means the viewport override was not
in effect for that shot — redo it, do not encode it. In particular `3600,2418`
is the 1800px-CSS layout: right aspect, but text too small to read.

## 5. Finish the images

Downscale to 1800px, round the corners, encode to WebP with alpha:

```bash
bun run scripts/finish-screenshot.ts .shots-tmp/miel-light.png docs/miel-light.webp
bun run scripts/finish-screenshot.ts .shots-tmp/miel-dark.png  docs/miel-dark.webp
```

Read `scripts/finish-screenshot.ts` before changing width, radius or quality —
the width in particular is load-bearing for the landing page's encode.

## 6. Regenerate the landing-page assets

```bash
cd packages/landing-page && bun run encode-assets
```

This rewrites the generated `src/content/assets.ts`. Then:

```bash
bun run typecheck
bun test packages/landing-page
```

`src/content/assets.test.ts` re-encodes the sources and compares, so it is the
test that catches a forgotten step 6, and it also holds a ceiling on the total
inlined payload.

A full `bun test` at the repo root currently carries **pre-existing** failures
unrelated to screenshots (`@/`-alias resolution in `@miel/web`, and
`verify-prerendered` when the landing page has uncommitted edits). Do not report
those as caused by the new images. To separate yours from the baseline:

```bash
git stash push -- docs/miel-light.webp docs/miel-dark.webp \
  packages/landing-page/src/content/assets.ts
bun test 2>&1 | tail -5     # baseline counts
git stash pop
bun test 2>&1 | tail -5     # compare
```

### The payload ceiling is a real decision, not a nit

`assets.test.ts` caps the total inlined `data:` payload (180,000 bytes at time
of writing, ~170 KB used). Denser screenshots — more messages, more label chips,
a busier UI after a redesign — encode larger at the same dimensions and quality,
so this can fail even when the pipeline is correct.

Note the tension before reaching for quality: a **more readable** shot is a
*larger* file, not a smaller one. The 1370px viewport lays out fewer, bigger
elements, which carry more detail per pixel than shrunken text. Dropping quality
to fit the budget attacks exactly the legibility the viewport width was chosen
for.

Check the encode width **before** assuming it is the documented mistake: the
test's comment predicts a re-encode at the sources' full 1800px, but
`scripts/encode-assets.ts` encodes the hero at 1520. If it is already 1520, the
images are simply denser and this is a genuine size/quality tradeoff.

**Do not silently raise the ceiling.** Put the choice to the user:

1. raise the ceiling and update the comment (ships a bigger landing page);
2. drop the WebP quality in `encode-assets.ts` until it fits (costs hero
   fidelity);
3. seed fewer messages so the frame is less dense (changes what is shown).

Per-asset sizes, to show where the growth is:

```bash
bun -e 'const m = await import("./packages/landing-page/src/content/assets.ts");
  let t = 0;
  for (const k of ["APP_ICON","SCREENSHOT_LIGHT","SCREENSHOT_DARK"]) {
    console.log(k.padEnd(20), (m[k].length/1024).toFixed(1)+" KB"); t += m[k].length }
  console.log("TOTAL".padEnd(20), t)'
```

## 7. Tear the stack down

**Always run this, including when an earlier step failed** — a half-built stack
still leaves containers, a volume and two images on the machine. It is the last
thing to do before reporting back, not an optional cleanup.

```bash
docker compose -p miel-demo -f docker-compose.demo.yml down -v --remove-orphans --rmi local
rm -rf .shots-tmp
```

- `-v` drops the demo volume. Nothing in it is worth keeping, and leaving it
  means the next run seeds on top of an old schema.
- `--remove-orphans` catches containers left by an older version of the compose
  file.
- `--rmi local` deletes the `miel-demo-api` / `miel-demo-web` images this run
  built. Drop this flag **only** if the user says they will re-shoot shortly and
  wants the rebuild to stay fast — it is the difference between a few-minute
  rebuild and a fast one.
- `rm -rf .shots-tmp` removes the intermediate PNGs from step 4.

Confirm the machine is actually clean, and say so in the hand-back:

```bash
docker ps -a --filter "name=miel-demo" --format '{{.Names}}\t{{.Status}}'
docker volume ls --filter "name=miel-demo" --format '{{.Name}}'
docker images --filter "reference=miel-demo-*" --format '{{.Repository}}'
```

All three must print nothing. Anything listed is still on the machine — remove
it before reporting done.

The Chrome the user started for this is **theirs to close**; it holds no state
worth keeping (separate `--user-data-dir`), so mention it rather than killing
their window.

## What to hand back

The two `docs/*.webp`, the regenerated `assets.ts`, and a note of the test
result. Show the user the finished light screenshot before committing — an
image is the one deliverable that cannot be reviewed from a diff.

## When it goes wrong

| Symptom | Cause |
|---|---|
| Inbox shows "No messages this week" | Seed ran against the dev db on 5435, not 5436. Re-run step 2 with `DATABASE_URL` inline. |
| Every request 401s | `VITE_API_SECRET` baked into the web image no longer matches the API's `API_SECRET`. Both are `demo-secret` in `docker-compose.demo.yml`; rebuild with `--build` after changing either. |
| Port already allocated | Something else holds 5210/5511/5436 (registered in `~/dev/PORTS.md`). Override per-run with `DEMO_WEB_PORT`/`DEMO_API_PORT`/`DEMO_POSTGRES_PORT`. |
| Sync or reply errors in the UI | Expected — the demo stack carries no Google or Claude credentials. Do not put those buttons in an error state in frame. |
| Screenshot looks blurry on the landing page | Captured under 1800px wide, so the hero's 1520 encode became an upscale. Recapture at the full width. |
| Both frames came out dark (or both light) | Set `miel-theme`, not just `gousse-theme` — only the former is read by the boot script in `packages/web/index.html`. See step 4. |
| PNG is 3360x1772 (or any non-1.489 aspect) | The window was maximized, so `resize_page` silently did nothing. Use `set-viewport.ts`, verify `innerWidth`, reshoot. |
| Sizing worked, then the next shot is wrong again | A `navigate_page` reload cleared the metrics override. Re-run `set-viewport.ts` after **every** reload. |
| Text in the screenshot is too small to read | Captured at an 1800px CSS viewport, which lays the app out for a huge window. Shoot at 1370x920 CSS (`set-viewport.ts`) — check `sidebarFrac` is ~0.16, not ~0.067. |
| `take_screenshot` fails with `not within any of the configured workspace roots` | The MCP tools can only write inside the repo. Capture to `.shots-tmp/`, not to `/private/tmp`. |
| `assets.test.ts` payload-budget test fails | Denser screenshots encode larger. Check `encode-assets.ts` is at 1520 first; if so this is a real tradeoff — ask the user, do not just raise the ceiling. See step 6. |
| `bun test` shows ~47 web failures | Pre-existing `@/`-alias failures, unrelated. Compare against a stashed baseline before blaming the screenshots. |
