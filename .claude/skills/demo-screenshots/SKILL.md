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
generated, and a test fails if it stops matching the sources — so **step 5 is
not optional**: a new screenshot without it breaks `bun test`.

Nothing here touches a real Gmail account. The inbox in the picture is written
straight into a throwaway Postgres by `packages/cli/scripts/seed-demo.ts`, and
the stack it runs against has no Google or Anthropic credentials at all.

## Before starting

Check the tools exist, and fail early rather than after a five-minute build:

```bash
docker info >/dev/null && which cwebp ffmpeg
bunx playwright install chromium      # no-op once the build is cached
```

`brew install ffmpeg webp` if either is missing. Docker must be running.

No browser needs to be started by hand. Step 3 runs
`.claude/skills/demo-screenshots/capture.ts`, which drives a **headless
Chromium of its own** through Playwright — its own profile, its own browser
build out of `~/Library/Caches/ms-playwright` — takes both frames and shuts it
down.

Playwright pins an exact browser build, so `playwright install chromium` is a
real prerequisite on a machine that has never run this, and the version already
in the cache is often not the one the installed `playwright` pins. The script
fails with that command in the message rather than a driver stack trace.

That script exists because neither browser-automation tool can produce a
publishable frame, and both fail in ways that look like success:

- **claude-in-chrome** returns a downscaled *JPEG* from `computer` screenshot
  (1456x818 here), whatever the window is doing. Encoding that to the 1800px
  WebP is an upscale of an already-lossy image — the "blurry on the landing
  page" row in the table below, baked in permanently. Its `resize_window` also
  answers `Successfully resized window` on a maximized window while
  `innerWidth` does not move. It is a fine way to *look* at the running app;
  never shoot with it.
- **chrome-devtools MCP** needs a browser the user started by hand with
  `--remote-debugging-port`, and its `resize_page` is the same silent no-op on
  a maximized window.

`set-viewport.ts` is still in this directory for that second case — pinning the
viewport of a Chrome someone else started, over raw CDP with no dependency. The
capture path does not use it.

Whatever happens, **step 6 still runs** — it is what keeps a stopped run from
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
the shot — the messages, the labels (the user's four and the Gmail system ones),
the priorities, the promo codes and the one suggested filter are all literals at
the top of that file. Three of those literals are load-bearing for a surface
that is otherwise empty in the frame, so a message list edited without them
quietly drops a feature out of the picture:

- **`system`** on a message is its Gmail system labels. The inbox groups each
  priority section by the message's `CATEGORY_*` label and the sidebar lists the
  mailboxes, so a message list with no categories shows neither.
- **`promo`** on a marketing message seeds a `promo_codes` row. Unsaved ones are
  the suggestion cards above the inbox — capped at six, deduped by code, and
  hidden once expired — and `saved: true` ones are the Promo Codes page's rows.
- **`isTrashed`** goes with `saved: true`, because saving a promo trashes its
  mail: it is what keeps a saved promo's message out of the inbox while the
  promo itself stays on the page.

## 3. Capture both frames

```bash
bun run .claude/skills/demo-screenshots/capture.ts
```

Writes `.shots-tmp/miel-light.png` and `.shots-tmp/miel-dark.png`, both
2740x1840, and prints what it verified for each. Nothing else is needed: the
script owns the browser, the viewport, the theme and the checks.

Read `capture.ts` before changing any of it — the reasoning is in its module
comment. Three things it settles, each of which was a way to ship a bad frame:

- **The CSS viewport is 1370x920, not 1800.** The output file is always 1800px
  wide, but the CSS viewport decides how much UI is laid out inside it. At an
  1800px viewport the app lays out for a huge window and body text lands around
  8px in the final image; at 1370 the same file holds fewer, bigger elements and
  reads in a README. The sidebar fraction is the quick tell — **0.181 at 1370,
  0.138 at 1800** — and the script refuses to capture if it drifts by more than
  0.01.

  That check was dead until this rewrite, in two compounding ways worth not
  reintroducing: the expectation was *derived* from `--width` (`224 / width`),
  so it slid to match whatever width was passed and could never catch a wrong
  one; and the 224 was the sidebar's nominal CSS width when it actually renders
  at 248, leaving a *good* frame 0.0175 from its own expectation. A 0.03
  tolerance then comfortably accepted both layouts. It is now pinned to the
  measured 0.181 with a 0.01 tolerance — **loosening it past ~0.02 turns the
  check back off.**
- **The theme key is `miel-theme`.** That is the only key the boot script in
  `packages/web/index.html` reads. `gousse-theme` is written by `useTheme.ts`
  and is write-only on load, so setting only that one falls through to
  `prefers-color-scheme` — on a dark-mode Mac, two dark frames and a dark
  picture in the README's light slot. The script sets both and asserts
  `html.dark` matches the scheme it asked for. It writes them through
  Playwright's `addInitScript`, so they land before the boot script reads them
  and the first navigation is already themed.
- **It waits for a message row before shooting.** An empty list is
  indistinguishable from a seed that did not land, and would ship as the picture
  of the app. Rows are counted as `a[href*='/messages/']` — the inbox list is
  one `<Link>` per message (`messageDetailPath` in
  `features/inbox/inboxLocation.ts`), so a change to that path breaks the
  count and the script fails loudly rather than capturing a blank inbox.

A fourth used to be on this list and no longer is: the viewport override had to
be re-applied after every navigation, because a reload cleared it and the theme
switch between the two frames *is* a reload — which is how the pair once came
out at two different sizes. Playwright sets the viewport on the **browser
context**, where it survives navigation, so that bug class is gone by
construction rather than by a step someone could remove.

1800x1209 is the shipped pair's shape, and `packages/landing-page/src/styles.ts`
pins the hero frame's `aspect-ratio` to `1800 / 1209`. `--width`/`--height`
exist, but capturing at a different shape means changing that number too — say
so rather than doing it silently.

Both frames must show the same inbox, same scroll position, same selected
account; the README swaps them on the reader's colour scheme and a pair that
disagrees looks like a glitch. The script's own checks cover viewport, theme,
scroll and the sidebar fraction, but not what is *in* the list — so look at the
two PNGs before encoding, and confirm the account reads **demo@mielapp.dev** and
nothing is hovered, focused or half-open.

Confirm the dimensions too; anything but `2740,1840` means a check was bypassed:

```bash
for f in .shots-tmp/miel-light.png .shots-tmp/miel-dark.png; do
  echo -n "$f: "
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f"
done
```

## 4. Finish the images

Downscale to 1800px, round the corners, encode to WebP with alpha:

```bash
bun run scripts/finish-screenshot.ts .shots-tmp/miel-light.png docs/miel-light.webp
bun run scripts/finish-screenshot.ts .shots-tmp/miel-dark.png  docs/miel-dark.webp
```

Read `scripts/finish-screenshot.ts` before changing width, radius or quality —
the width in particular is load-bearing for the landing page's encode.

## 5. Regenerate the landing-page assets

```bash
cd packages/landing-page && bun run encode-assets
```

This rewrites the generated `src/content/assets.ts`. Then:

```bash
bun run typecheck
bun test packages/landing-page
```

`src/content/assets.test.ts` re-encodes the sources and compares, so it is the
test that catches a forgotten step 5, and it also holds a ceiling on the total
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

## 6. Tear the stack down

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
- `rm -rf .shots-tmp` removes the intermediate PNGs from step 3.

Confirm the machine is actually clean, and say so in the hand-back:

```bash
docker ps -a --filter "name=miel-demo" --format '{{.Names}}\t{{.Status}}'
docker volume ls --filter "name=miel-demo" --format '{{.Name}}'
docker images --filter "reference=miel-demo-*" --format '{{.Repository}}'
```

All three must print nothing. Anything listed is still on the machine — remove
it before reporting done.

The capture's own Chromium is headless and Playwright closes it with the
script, so there is no window to close and nothing to mention — unless
`--headed` was passed and the run died before its `finally`, in which case check
for a stray `chrome_crashpad`/headless process. If the user started a debug Chrome of their own
for `set-viewport.ts`, that one is **theirs to close**: say so rather than
killing their window.

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
| Screenshot looks blurry on the landing page | The source was under 1800px wide, or lossy, so the hero's 1520 encode became an upscale. Almost always means the frame came from a browser-automation tool instead of `capture.ts` — claude-in-chrome's screenshot is a 1456x818 JPEG. Recapture with the script. |
| Both frames came out dark (or both light) | Set `miel-theme`, not just `gousse-theme` — only the former is read by the boot script in `packages/web/index.html`. `capture.ts` sets both and asserts the result — see step 3. |
| PNG is any size but 2740x1840 | The frame did not come from `capture.ts`. Both browser-automation tools report a successful resize on a maximized window and then capture the full screen; the script pins the viewport on the browser context and refuses to shoot when it does not match. |
| `capture: inbox never rendered a message row` | Either the seed did not reach the database the app reads (re-run step 2 with `DATABASE_URL` inline), or the message-row href changed and the count selector in `capture.ts` no longer matches `messageDetailPath`. |
| `capture: refusing to capture — …` | Working as intended: one of viewport, theme, scroll or sidebar fraction was wrong. The message names which. Fix that, do not pass a flag around it. |
| `capture: could not launch Chromium` | Playwright's pinned browser build is not in the cache. Run `bunx playwright install chromium`. A cache holding *other* builds does not help — the version is pinned by the installed `playwright`. |
| `browserType.launch: Executable doesn't exist` | Same cause, surfaced by the driver instead of the script's own guard. Same fix. |
| Text in the screenshot is too small to read | Captured at an 1800px CSS viewport, which lays the app out for a huge window. `capture.ts` defaults to 1370x920 and refuses anything whose `sidebarFrac` is not 0.181 ±0.01 — at 1800 it measures 0.138 and the run stops. Reaching this now means `--width` was overridden *and* the tolerance widened. |
| `assets.test.ts` payload-budget test fails | Denser screenshots encode larger. Check `encode-assets.ts` is at 1520 first; if so this is a real tradeoff — ask the user, do not just raise the ceiling. See step 5. |
| `bun test` shows ~47 web failures | Pre-existing `@/`-alias failures, unrelated. Compare against a stashed baseline before blaming the screenshots. |
