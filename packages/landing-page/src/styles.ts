/**
 * Hand-written CSS, inlined into a <style> element in the document head.
 *
 * It carries none of the app's UI dependencies — not the gousse design system
 * the app vendors, not Tailwind — so this package's image builds from its own
 * manifest alone. What it does borrow is the app's *look*: the token values
 * below are the light and dark values of `--gousse-bg`, `--gousse-panel`,
 * `--gousse-ink` and `--gousse-line`, copied from
 * `packages/web/src/styles/gousse/tokens.css`. Copied, not imported: a shared
 * stylesheet would be a dependency, and the point of this package is not to
 * have one. They can drift; `styles.test.ts` holds the contrast floor either
 * way.
 *
 * No external fonts, no stylesheets, and nothing here the browser must fetch —
 * `styles.test.ts` asserts this sheet contains no `url(` at all. The two real
 * images the page shows (the app icon and the inbox screenshot) are therefore
 * carried as `data:` URIs in style attributes on the elements themselves, not
 * here; see `content/assets.ts`, `BeeMark.tsx` and `AppPreview.tsx`.
 */
export const CSS = `
:root {
  color-scheme: light dark;
  /* The app's warm off-white canvas and white panels. */
  --bg: #f9f7f4;
  --panel: #ffffff;
  --text: #11100e;
  --muted: #5c5a55;
  --rule: #e2ded7;
  /* Honey, darkened until link text and the CTA label clear WCAG AA (5.05:1)
     against --bg — the lighter amber this started as sat at 4.07:1. */
  --accent: #94640a;
  --accent-contrast: #fffdf7;
  --accent-soft: #f4ead6;
  --shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-lg: 0 6px 16px rgba(0, 0, 0, 0.1);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d0d0c;
    --panel: #171716;
    --text: #f5f5f2;
    --muted: #a3a39c;
    --rule: #44423c;
    --accent: #edb64b;
    --accent-contrast: #14130f;
    --accent-soft: #2a2418;
    --shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
    --shadow-lg: 0 6px 16px rgba(0, 0, 0, 0.5);
  }
}

* { box-sizing: border-box; }

html { -webkit-text-size-adjust: 100%; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 17px;
  line-height: 1.6;
  overflow-wrap: break-word;
}

.page {
  max-width: 44rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 4rem;
}

/* The homepage runs wider than the legal pages: it carries the app screenshot
   and a second column. The prose column inside it stays at reading width. */
.page-wide { max-width: 66rem; }

.site-header { padding-top: 1rem; }

.wordmark {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  margin: 0;
  color: var(--accent);
}

.wordmark-link {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: inherit;
  text-decoration: none;
}

.wordmark-link:hover span, .wordmark-link:focus-visible span { text-decoration: underline; }

/* The app icon. The image itself is a data URI in a style attribute (see
   BeeMark.tsx); only the box it paints into is described here. Sized in em so
   it tracks whatever text it sits beside. */
.bee-mark {
  display: inline-block;
  width: 1.9em;
  height: 1.9em;
  flex: none;
  background-repeat: no-repeat;
  background-position: center;
  background-size: contain;
}

/* ── Two-column layout: sticky section menu beside the prose ─────────────── */

.layout {
  display: grid;
  grid-template-columns: 13rem minmax(0, 1fr);
  gap: 2.5rem;
  align-items: start;
  margin-top: 3rem;
}

.layout main { min-width: 0; max-width: 44rem; }

.side-menu { position: sticky; top: 1.5rem; }

.side-menu-brand {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin: 0 0 1rem;
  padding-left: 0.35rem;
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--text);
}

.side-menu-list { list-style: none; margin: 0; padding: 0; }

/* The app's sidebar row: a full-width pill that fills on hover. */
.side-menu-link {
  display: block;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.15rem;
  border-radius: 0.6rem;
  color: var(--muted);
  font-size: 0.95rem;
  font-weight: 500;
  text-decoration: none;
}

.side-menu-link:hover, .side-menu-link:focus-visible {
  background: var(--accent-soft);
  color: var(--accent);
}

/* No scroll spy on a page with no JavaScript, so the jumped-to section is the
   only "active" state available — and it is the honest one. */
section:target > h2 { color: var(--accent); }

section[id] { scroll-margin-top: 1.5rem; }

@media (max-width: 52rem) {
  .layout { grid-template-columns: minmax(0, 1fr); gap: 1.5rem; }

  .side-menu {
    position: static;
    border-bottom: 1px solid var(--rule);
    padding-bottom: 0.75rem;
  }

  .side-menu-brand { display: none; }

  /* A row of pills that scrolls on its own rather than widening the page. */
  .side-menu-list {
    display: flex;
    gap: 0.4rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .side-menu-link { white-space: nowrap; margin-bottom: 0; }
}

h1 {
  font-size: clamp(1.9rem, 7vw, 2.75rem);
  line-height: 1.15;
  letter-spacing: -0.02em;
  margin: 1.5rem 0 1rem;
}

h2 {
  font-size: 1.2rem;
  letter-spacing: -0.01em;
  margin: 2.5rem 0 0.75rem;
}

p { margin: 0 0 1rem; }

.lede { color: var(--muted); font-size: 1.05rem; }

a { color: var(--accent); }

.cta {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.5rem 0 0;
  padding: 0.7rem 1.25rem;
  border-radius: 0.75rem;
  background: var(--accent);
  color: var(--accent-contrast);
  font-weight: 600;
  text-decoration: none;
}

.cta:hover, .cta:focus-visible { filter: brightness(1.08); }

.cta-icon { flex-shrink: 0; }

.cta-note { margin-top: 0.75rem; font-size: 0.9rem; color: var(--muted); }

section { border-top: 1px solid var(--rule); padding-top: 0.25rem; }

/* The table stays a real table at every size. The wrapper is the safety valve:
   if three columns of prose cannot fit the viewport, the table scrolls inside
   its own box rather than pushing the page sideways. No min-width, so on a
   narrow phone the cells simply wrap instead. */
.scope-table { overflow-x: auto; margin: 0 0 1rem; }

.scope-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.92rem;
  text-align: left;
}

.scope-table caption {
  caption-side: top;
  text-align: left;
  color: var(--muted);
  font-size: 0.85rem;
  padding-bottom: 0.6rem;
}

.scope-table th, .scope-table td {
  vertical-align: top;
  text-align: left;
  padding: 0.6rem 0.75rem 0.6rem 0;
  border-bottom: 1px solid var(--rule);
}

.scope-table thead th {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--muted);
}

.scope-table tbody th { font-weight: 600; }

.note { color: var(--muted); font-size: 0.92rem; }

.updated { color: var(--muted); font-size: 0.9rem; margin-bottom: 2rem; }

/* Legal-page enumerations: a real list, indented inside the column so a long
   item wraps under its own text rather than under the marker. */
.prose-list { margin: 0 0 1rem; padding-left: 1.25rem; }

.prose-list li { margin-bottom: 0.5rem; }

/* Footer navigation: a list for screen readers, a row of separated links on
   screen. Wraps rather than overflowing on a narrow phone. */
.site-nav {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem 1rem;
  margin: 0 0 0.75rem;
  padding: 0;
}

.scope-string {
  display: block;
  margin-top: 0.35rem;
  font-size: 0.8em;
  color: var(--muted);
  word-break: break-all;
}

section:first-of-type { border-top: none; }

.site-footer {
  border-top: 1px solid var(--rule);
  margin-top: 3rem;
  padding-top: 1.5rem;
  color: var(--muted);
  font-size: 0.95rem;
}

/* ── Hero ────────────────────────────────────────────────────────────────── */

/* Copy left, screenshot right. The shot takes the wider track: it is a
   1800x1209 landscape image, and below about 26rem the message rows inside it
   stop being legible. Centring on the cross axis sits it against the middle of
   the copy rather than its top, which is what stops a short headline leaving a
   gap above the image. */
/* The hero fills .page-wide's own content column, same as .layout below it —
   no independent width math, so the two can't desync. */
.hero {
  display: grid;
  grid-template-columns: minmax(0, 4fr) minmax(0, 6fr);
  gap: 3rem;
  align-items: center;
  width: 100%;
}

.hero-copy { min-width: 0; }

.hero .cta { margin-bottom: 0.5rem; }

/* One column below the two-column breakpoint the section menu uses, so the
   page has a single place where it changes shape. The shot goes back under the
   copy at full width, which is where it was before it moved beside it. */
@media (max-width: 52rem) {
  .hero {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }
}

/* ── Installation and contribution steps ─────────────────────────────────── */

/* Docker vs. Bun tabs, CSS-only: the page ships no JavaScript, so the two
   radios drive visibility purely through :checked + a sibling selector.
   Docker's radio is defaultChecked in the markup, so it is the default tab
   even with CSS disabled — the steps just stack, Docker's first. */
.tabs {
  display: flex;
  gap: 0.4rem;
  margin: 1.5rem 0 0;
}

.tab-input {
  position: absolute;
  opacity: 0;
  pointer-events: none;
}

.tab-label {
  cursor: pointer;
  padding: 0.45rem 0.9rem;
  border: 1px solid var(--rule);
  border-radius: 999px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
  background: var(--panel);
  user-select: none;
}

.tab-input-docker:checked ~ .tabs .tab-label-docker,
.tab-input-bun:checked ~ .tabs .tab-label-bun {
  color: var(--accent-contrast);
  background: var(--accent);
  border-color: var(--accent);
}

.tab-input:focus-visible ~ .tabs .tab-label {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}

.step-docker,
.step-bun {
  display: none;
}

.tab-input-docker:checked ~ .steps .step-docker,
.tab-input-bun:checked ~ .steps .step-bun {
  display: block;
}

.steps {
  list-style: none;
  counter-reset: step;
  margin: 1.5rem 0 0;
  padding: 0;
}

.step {
  counter-increment: step;
  position: relative;
  padding-left: 2.25rem;
  margin-bottom: 1.5rem;
}

/* The number sits in the gutter as a filled disc, the way the app numbers a
   sequence. Absolute so a wrapped label lines up under itself, not under it. */
.step::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 0.1rem;
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 0.85rem;
  font-weight: 700;
}

.step-label { margin: 0 0 0.35rem; font-weight: 600; }

.step-body { margin: 0 0 0.6rem; color: var(--muted); font-size: 0.95rem; }

/* A step whose work is a sequence in someone else's console has a nested list
   where another step has a command block. Ordinary decimal markers, so the
   browser numbers them and they never read as a continuation of the outer
   sequence, which numbers itself with a counter in the gutter. */
.substeps {
  margin: 0 0 0.6rem;
  padding-left: 1.2rem;
  color: var(--muted);
  font-size: 0.95rem;
}

.substeps li { margin-bottom: 0.5rem; }

/* Commands scroll inside their own box: a long clone URL must not push the
   page sideways on a phone. */
.code {
  margin: 0;
  padding: 0.75rem 0.9rem;
  overflow-x: auto;
  background: var(--panel);
  border: 1px solid var(--rule);
  border-radius: 0.6rem;
  box-shadow: var(--shadow);
  font-size: 0.85rem;
  line-height: 1.5;
}

.code code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  white-space: pre;
}

/* ── The app screenshot ──────────────────────────────────────────────────── */

/* The image is a data URI in a style attribute (see AppPreview.tsx); what is
   described here is the frame it sits in. The aspect ratio is the source
   screenshot's own (1800x1209), so the box reserves the right height before
   the image paints and nothing below it shifts.

   The frame is turned away from the reader: a perspective projection with a
   rotation about Y, so the left edge comes forward and the right recedes, the
   way a slide looks seen from its side. perspective() is written into the
   transform itself rather than declared on a parent, because the shot has no
   wrapper of its own and the hero grid must stay untouched. A small counter-
   rotation about X and a Z lift keep the top edge from splaying and stop the
   turned frame reading as a tipped-over rectangle. transform-origin sits on the
   right so the near edge grows into the hero gap instead of into the copy.

   The long 2200px viewing distance keeps the turn gentle: the frame stays
   within its layout box, so nothing crosses the hero's right margin. Tuned in
   tools/transform-tuner.html — open that to change these numbers. */
.shot {
  position: relative;
  aspect-ratio: 1800 / 1209;
  border: 1px solid var(--rule);
  border-radius: 0.9rem;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  transform-origin: 100% 50%;
  transform: perspective(2200px) rotateY(-14deg) rotateX(3deg) translateZ(-40px);
}

/* Only once it has stacked under the copy does it need space above it; beside
   the copy the grid gap is the separation. Stacked, it is also the full column
   with no margin for the near edge to lean into, and a narrow viewport is where
   a turned frame costs the most legibility, so it faces the reader again. */
@media (max-width: 52rem) {
  .shot {
    margin-top: 2.5rem;
    transform: none;
  }
}

.shot-image {
  position: absolute;
  inset: 0;
  background-repeat: no-repeat;
  background-position: top center;
  background-size: 100% auto;
}

/* Both schemes are in the document — a style attribute cannot be switched by a
   media query — so the stylesheet shows one, as the README's <picture> does. */
.shot-dark { display: none; }

@media (prefers-color-scheme: dark) {
  .shot-light { display: none; }
  .shot-dark { display: block; }
}

:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
`.trim();
