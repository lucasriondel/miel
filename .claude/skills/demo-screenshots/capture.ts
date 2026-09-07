#!/usr/bin/env bun
/**
 * Capture both demo screenshots from a headless Chromium this script owns.
 *
 *   bunx playwright install chromium   # first run on a machine only
 *   bun run .claude/skills/demo-screenshots/capture.ts
 *
 * Writes `.shots-tmp/miel-light.png` and `.shots-tmp/miel-dark.png`, each
 * 2740x1840, which `scripts/finish-screenshot.ts` downscales to the shipped
 * 1800px WebP.
 *
 * Why a script and not a browser-automation tool:
 *
 * - **claude-in-chrome cannot produce the source frame.** Its `computer`
 *   screenshot always returns a downscaled *JPEG* (1456x818 on this machine),
 *   whatever the window is doing. Encoding that to the 1800px WebP is an
 *   upscale of an already-lossy image — the "blurry on the landing page" row in
 *   SKILL.md's troubleshooting table, baked in permanently. Its `resize_window`
 *   is also a silent no-op on a maximized window: it answers "Successfully
 *   resized" and `innerWidth` does not move. Use it to *look* at the app, never
 *   to shoot it.
 * - **chrome-devtools MCP needs a browser the user started by hand**, with
 *   `--remote-debugging-port` open, and `resize_page` fails the same silent way
 *   on a maximized window.
 *
 * Playwright launches its own browser from its own cache, so there is no manual
 * step and nothing to interfere with the user's windows.
 *
 * ## Why Playwright and not a hand-rolled CDP client
 *
 * This script used to spawn Chrome itself, poll `/json/version`, open a
 * WebSocket to a page target and speak CDP through a ~90-line client of its
 * own. Playwright's context options subsume all of that, and one bug class with
 * it: `viewport` and `deviceScaleFactor` are set on the **context**, so they
 * survive navigation. The CDP version had to re-apply
 * `Emulation.setDeviceMetricsOverride` after every reload — and the theme
 * switch between the two frames *is* a reload, which is how the pair once came
 * out at two different sizes.
 *
 * `addInitScript` is the other win: it writes the theme *before any page script
 * runs*, so the first navigation is already correctly themed. The CDP version
 * had to load the app once purely to get a writable localStorage on its origin,
 * then set the theme, then reload — three navigations where this needs two.
 *
 * The cost, and the reason `--port` is gone: Playwright pins an exact browser
 * build, so a machine that has never run this needs
 * `bunx playwright install chromium` once. It fails with that instruction.
 *
 * ## The three decisions Playwright does NOT make
 *
 * These are miel's, which is why this file is longer than the driver's own
 * example would be. Each was a way to ship a bad frame:
 *
 * - **The width is a legibility decision.** The output file is always 1800px
 *   wide, but the *CSS* viewport decides how much UI is laid out inside it. At
 *   an 1800px CSS viewport the app lays out for a huge window and body text
 *   lands around 8px in the final image. At 1370 CSS px the same file holds
 *   fewer, bigger elements and reads in a README. The sidebar fraction is the
 *   quick tell — ~0.16 at 1370, ~0.067 at 1800 — and a drifting one refuses the
 *   shot.
 * - **The theme key is `miel-theme`.** That is the only key the boot script in
 *   `packages/web/index.html` reads. `gousse-theme` is written by `useTheme.ts`
 *   and is *write-only* on load, so setting only that one falls through to
 *   `prefers-color-scheme` — on a dark-mode Mac that silently captures two dark
 *   frames. Both are set here; `miel-theme` decides the frame.
 * - **An empty inbox must never ship.** A list that did not load is
 *   indistinguishable from a seed that did not land, so a message row is waited
 *   for and counted before the shutter.
 *
 * Options:
 *   --url <s>      app URL          (default http://localhost:5210/app)
 *   --out <dir>    output directory (default .shots-tmp)
 *   --width <n>    CSS viewport     (default 1370)
 *   --height <n>   CSS viewport     (default 920, keeps 1800/1209)
 *   --scale <n>    deviceScaleFactor (default 2)
 *   --headed       show the browser, for watching what it does
 */
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { chromium, type Browser, type Page } from "playwright";

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const appUrl = arg("--url", "http://localhost:5210/app");
const outDir = resolve(arg("--out", ".shots-tmp"));
const width = Number(arg("--width", "1370"));
const height = Number(arg("--height", "920"));
const scale = Number(arg("--scale", "2"));
const headed = process.argv.includes("--headed");

/**
 * The fraction of the viewport the sidebar occupies at the readable 1370 width.
 *
 * Two things about this number were wrong at once, and they hid each other:
 *
 * - It was **derived from `width`** (`224 / width`), which is self-defeating for
 *   a fixed-pixel element: the expectation slid to match whatever `--width` was
 *   passed, so the one mistake this check exists to catch — capturing at 1800,
 *   where body text lands around 8px in the final image — sailed straight
 *   through.
 * - The 224 was **the nominal CSS width, not the rendered one**. The sidebar
 *   measures 248px at 1370 (0.181), so even a correctly pinned `224 / 1370`
 *   expectation sat 0.0175 away from a *good* frame.
 *
 * A 0.03 tolerance was wide enough to accept both the good frame and the bad
 * one, which is why this never fired. Measured: 0.181 at 1370, 0.138 at 1800.
 * Pinning to the measured value and tightening to 0.01 separates them.
 */
const EXPECTED_SIDEBAR_FRAC = 0.181;
/**
 * Tight on purpose: it has to fit the 1370 layout and exclude the 1800 one,
 * whose fraction is only 0.043 away. Loosening this past ~0.02 turns the check
 * back off.
 */
const SIDEBAR_TOLERANCE = 0.01;

// The inbox list is one <Link> per message, so its href is the marker —
// see messageDetailPath() in features/inbox/inboxLocation.ts.
const ROW_SELECTOR = "a[href*='/messages/']";

type PageState = {
  w: number;
  h: number;
  dark: boolean;
  scrollY: number;
  sidebarFrac: number | null;
  account: string | null;
  rows: number;
};

async function readState(page: Page): Promise<PageState> {
  return page.evaluate((rowSelector) => {
    const nav = document.querySelector("nav, aside");
    const r = nav && nav.getBoundingClientRect();
    const text = document.body.innerText || "";
    return {
      w: innerWidth,
      h: innerHeight,
      dark: document.documentElement.classList.contains("dark"),
      scrollY: window.scrollY,
      sidebarFrac: r ? +(r.width / innerWidth).toFixed(4) : null,
      account: (text.match(/[\w.+-]+@[\w.-]+/) || [null])[0],
      rows: document.querySelectorAll(rowSelector).length,
    };
  }, ROW_SELECTOR);
}

/**
 * Wait until the inbox has actually painted. The seeded stack answers fast, but
 * the frame must never be taken mid-fetch — an empty list is indistinguishable
 * from a seed that did not land, and would ship as the picture of the app.
 */
async function waitForInbox(page: Page, timeoutMs = 20_000): Promise<void> {
  try {
    await page.waitForSelector(ROW_SELECTOR, { state: "attached", timeout: timeoutMs });
  } catch {
    throw new Error(
      `inbox never rendered a message row. The seed may not have reached the ` +
        `database the app reads — re-run step 2 with DATABASE_URL inline. ` +
        `Last state: ${JSON.stringify(await readState(page))}`,
    );
  }
}

function assertShootable(state: PageState, scheme: "light" | "dark"): void {
  const problems: string[] = [];
  if (state.w !== width || state.h !== height) {
    problems.push(`viewport is ${state.w}x${state.h}, expected ${width}x${height}`);
  }
  if (state.dark !== (scheme === "dark")) {
    problems.push(`html.dark is ${state.dark}, expected ${scheme === "dark"}`);
  }
  if (state.scrollY !== 0) problems.push(`scrollY is ${state.scrollY}, expected 0`);
  if (
    state.sidebarFrac == null ||
    Math.abs(state.sidebarFrac - EXPECTED_SIDEBAR_FRAC) > SIDEBAR_TOLERANCE
  ) {
    problems.push(
      `sidebarFrac is ${state.sidebarFrac}, expected ~${EXPECTED_SIDEBAR_FRAC.toFixed(3)}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(`${scheme}: refusing to capture — ${problems.join("; ")}`);
  }
}

async function captureScheme(browser: Browser, scheme: "light" | "dark"): Promise<string> {
  // A context per scheme, so the viewport and the theme are set together and
  // neither can leak from the other frame. `colorScheme` covers the media query
  // the app falls back on; the two localStorage keys are what actually decide,
  // and `addInitScript` runs them before the boot script in index.html reads
  // them — so the first navigation is already correctly themed.
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: scheme,
  });
  await context.addInitScript((s: string) => {
    localStorage.setItem("miel-theme", s);
    localStorage.setItem("gousse-theme", s);
  }, scheme);

  const page = await context.newPage();
  try {
    await page.goto(appUrl, { waitUntil: "domcontentloaded" });
    await waitForInbox(page);
    await page.evaluate("window.scrollTo(0, 0)");
    // Let fonts, the frame's images and any enter animation settle.
    await page.evaluate("document.fonts.ready");
    await page.waitForTimeout(1200);

    const settled = await readState(page);
    assertShootable(settled, scheme);

    const file = join(outDir, `miel-${scheme}.png`);
    await page.screenshot({ path: file, type: "png", fullPage: false });
    console.log(
      `capture: ${file} — ${width}x${height} CSS @${scale}x, ` +
        `sidebarFrac ${settled.sidebarFrac}, account ${settled.account}, ` +
        `${settled.rows} rows`,
    );
    return file;
  } finally {
    await context.close();
  }
}

// The app must be up before Chrome is launched at it, so a blank frame cannot
// be captured from a stack that is still building.
try {
  const res = await fetch(appUrl, { redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
} catch (cause) {
  console.error(
    `capture: ${appUrl} is not answering. Bring the demo stack up first:\n` +
      `  docker compose -p miel-demo -f docker-compose.demo.yml up -d --build`,
  );
  console.error(String(cause));
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

// Playwright pins an exact browser build, so a machine that has never run this
// has nothing to launch. Say which command fixes it rather than surfacing the
// driver's own stack trace.
let browser: Browser;
try {
  browser = await chromium.launch({ headless: !headed });
} catch (cause) {
  console.error(
    `capture: could not launch Chromium. Install the build Playwright pins:\n` +
      `  bunx playwright install chromium`,
  );
  console.error(String(cause));
  process.exit(1);
}
const files: string[] = [];
try {
  for (const scheme of ["light", "dark"] as const) {
    files.push(await captureScheme(browser, scheme));
  }
} finally {
  await browser.close();
}

console.log(
  `capture: done — ${files.length} frames in ${outDir}. ` +
    `Expect ${width * scale}x${height * scale} each.`,
);
