/**
 * Pin the demo app's CSS viewport to the shape the shipped screenshots use.
 *
 * Why this exists, and why it is not `resize_page`:
 *
 * - The chrome-devtools MCP `resize_page` tool is a silent no-op on a maximized
 *   window, and macOS re-maximizes the window anyway, so the viewport drifts
 *   back to the full screen without reporting a failure.
 * - `Emulation.setDeviceMetricsOverride` sets the viewport directly, whatever
 *   the window is doing.
 *
 * The width is the part that matters for legibility. The output file is always
 * 1800px wide, but the *CSS* viewport decides how much UI is laid out inside
 * it. At 1800 CSS px the app lays out for a huge window (the fixed 224px
 * sidebar takes 6.7% of the frame) and the text is too small to read in a
 * README. At 1370 CSS px the same 1800px file holds fewer, bigger elements —
 * sidebar at 16.4% — which is the readable shipped look.
 *
 *   bun run .claude/skills/demo-screenshots/set-viewport.ts
 *
 * The override is cleared by every page reload, so run it again after each one,
 * then verify innerWidth/innerHeight before capturing.
 *
 * Optional args:
 *   --width <n>   CSS viewport width      (default 1370)
 *   --height <n>  CSS viewport height     (default 920, keeps 1800/1209)
 *   --port <n>    devtools port           (default 9222)
 *   --match <s>   substring of target URL (default "localhost:5210")
 *   --clear       remove the override instead of setting it
 */

export {}; // top-level await needs this file to be a module

const arg = (flag: string, fallback: string): string => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const width = Number(arg("--width", "1370"));
const height = Number(arg("--height", "920"));
const port = arg("--port", "9222");
const match = arg("--match", "localhost:5210");
const clear = process.argv.includes("--clear");

const listUrl = `http://127.0.0.1:${port}/json/list`;

let targets: Array<{ type: string; url: string; webSocketDebuggerUrl?: string }>;
try {
  const res = await fetch(listUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  targets = await res.json();
} catch (cause) {
  console.error(
    `set-viewport: no Chrome on ${listUrl}.\n` +
      `Start one with:\n` +
      `  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome \\\n` +
      `    --remote-debugging-port=${port} --user-data-dir=/tmp/miel-shots-chrome`,
  );
  console.error(String(cause));
  process.exit(1);
}

const page = targets.find((t) => t.type === "page" && t.url.includes(match));

if (!page?.webSocketDebuggerUrl) {
  const seen = targets
    .filter((t) => t.type === "page")
    .map((t) => `  ${t.url}`)
    .join("\n");
  console.error(
    `set-viewport: no page whose URL contains "${match}".\n` +
      `Open tabs:\n${seen || "  (none)"}`,
  );
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);

let nextId = 0;
const pending = new Map<
  number,
  { resolve: (v: any) => void; reject: (e: Error) => void }
>();

const send = (method: string, params: Record<string, unknown> = {}) =>
  new Promise<any>((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

await new Promise<void>((resolve, reject) => {
  ws.addEventListener("open", () => resolve(), { once: true });
  ws.addEventListener("error", () => reject(new Error("websocket failed")), {
    once: true,
  });
});

ws.addEventListener("message", (event) => {
  const msg = JSON.parse(String(event.data));
  const waiter = msg.id != null ? pending.get(msg.id) : undefined;
  if (!waiter) return;
  pending.delete(msg.id);
  if (msg.error) waiter.reject(new Error(JSON.stringify(msg.error)));
  else waiter.resolve(msg.result);
});

if (clear) {
  await send("Emulation.clearDeviceMetricsOverride");
  console.log("set-viewport: override cleared");
} else {
  // deviceScaleFactor 0 means "use the display's own", which gives a 2x capture
  // (2740x1840 for the default width) that finish-screenshot.ts downscales to
  // 1800 — a real downscale, so nothing is upscaled or softened.
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 0,
    mobile: false,
  });
  console.log(`set-viewport: ${width}x${height} CSS px`);
}

const probe = await send("Runtime.evaluate", {
  expression: `JSON.stringify((() => {
    const nav = document.querySelector("nav, aside");
    const r = nav && nav.getBoundingClientRect();
    return { w: innerWidth, h: innerHeight,
             sidebarFrac: r ? +(r.width / innerWidth).toFixed(4) : null };
  })())`,
  returnByValue: true,
});

const state = JSON.parse(probe.result.value);
console.log(`set-viewport: page reports ${JSON.stringify(state)}`);

ws.close();

if (!clear && (state.w !== width || state.h !== height)) {
  console.error(
    `set-viewport: viewport is ${state.w}x${state.h}, expected ${width}x${height} — ` +
      `do not capture until this matches.`,
  );
  process.exit(1);
}

if (!clear) {
  console.log(
    "set-viewport: ok — verify sidebarFrac is ~0.16 (not ~0.067) before capturing.",
  );
}
