---
name: sync-readme-and-landing-page
description: Reconcile the two places miel explains itself — the root README.md and the landing page's content modules — so the installation steps, the contribution checks, the prerequisites and the screenshots agree. Use when either source changed, when a command or port or env var moved, after retaking the screenshots, or when asked to check/sync/align the README and the landing page.
---

# Sync README and landing page

Miel tells a newcomer how to run it in two places, and they are written in
different forms:

| | Root `README.md` | Landing page |
|---|---|---|
| Form | Markdown, read on GitHub | typed data in `packages/landing-page/src/content/` |
| Install copy | prose + fenced bash | `guide.ts` → `INSTALLATION.steps[]` |
| Contribution copy | the *Contributing* section | `guide.ts` → `CONTRIBUTING` |
| Prerequisites | the *Prerequisites* table | `guide.ts` → `INSTALLATION.body` |
| Images | `docs/miel-{light,dark}.webp` via `<picture>` | the same files, re-encoded into the generated `src/content/assets.ts` |

They drift because a change lands in whichever one the author had open. This
skill is the reconciliation pass.

**The README is the source of truth for facts; the landing page is the source
of truth for its own form.** Copy facts across, never prose — the landing page
renders HTML with no Markdown pass, so a backtick or a `**bold**` carried over
from the README reaches the reader literally. `guide.test.ts` fails on exactly
that, deliberately.

## What must agree, and what must not

Only these four surfaces are in scope. The two documents are allowed to differ
everywhere else — the README carries a stack table, deploy notes and a scopes
table the landing page has no business restating.

### 1. Commands

Every shell command a reader would type must exist in both, and be the same
command. This is the highest-value check: a stale command sends someone to a
shell that fails.

- README: the fenced `bash` blocks under *Run it locally*, *Other commands* and
  *Running with Docker*.
- Landing: the `code` field of each step in `INSTALLATION` and `CONTRIBUTING`.

A command may legitimately appear in only one: the README's `cd packages/cli`
examples are not install steps. What is *not* legitimate is the same step
described two ways — one file saying `bun run typecheck` and the other
`bun typecheck`.

### 2. Steps and their order

The install path is the thing a reader follows top to bottom. Both must list
the same steps in the same order, and both must offer the same two routes —
Bun for development, Docker-only for self-hosting. In `guide.ts` those routes
are the `variant: "docker" | "bun"` tags; a step with no variant is shared.

### 3. Prerequisites and env facts

Bun version, Docker, the Claude Code CLI, the Google OAuth client type, and the
environment keys a reader has to fill in — `API_SECRET`/`VITE_API_SECRET`
matching, `CLAUDE_CODE_OAUTH_TOKEN`, `TOKEN_ENCRYPTION_KEY`. Ports too: the
README names 3000/3001/5435, and the guide's prose repeats them.

### 4. Images

Both must show the same screenshots, and the landing page's copies must be
current:

```bash
cd packages/landing-page && bun run encode-assets
```

`src/content/assets.ts` is **generated** — never hand-edit it. If it is stale,
`src/content/assets.test.ts` fails. Retaking the screenshots themselves is a
different job: use the `demo-screenshots` skill, whose last step is this same
regeneration.

## How to run the pass

### Step 1 — read both, in this order

```bash
# the source of truth for facts
cat README.md

# the landing page's copy, as data
cat packages/landing-page/src/content/guide.ts
```

Read `guide.test.ts` too. It already encodes several of the agreements as
assertions, and it tells you which facts someone previously decided were worth
pinning.

### Step 2 — diff the commands mechanically

Eyeballing two documents is where this goes wrong. Pull both command sets and
compare them as text:

```bash
# README: everything inside bash fences
awk '/^```bash/,/^```$/' README.md | grep -v '^```' | grep -v '^\s*#' | grep -v '^$'

# Landing: the code field of every guide step
bun -e 'import {GUIDE_SECTIONS} from "./packages/landing-page/src/content/guide.ts";
  console.log(GUIDE_SECTIONS.flatMap(s => (s.steps ?? []).flatMap(t => t.code ? [t.code] : [])).join("\n"))'
```

The README list keeps trailing comments (`bun dev  # api on :3001`) while the
guide's `code` fields carry their own; compare the commands, not the lines.

Read the two lists side by side. For each difference, decide which of the three
cases it is — and the third is the one that matters:

1. **README-only, legitimately** (CLI examples, deploy commands) — leave it.
2. **Genuinely stale in one file** — fix that file.
3. **Both are current but describe different behaviour** — the code changed and
   one document noticed. Check the code before editing either.

Case 3 is real here, not hypothetical — migrations are the worked example. The
API applies them on boot (`runMigrations()` in `packages/api/src/index.ts`), so
`guide.ts` carries no migrate step and `guide.test.ts` asserts `db/migrate.ts`
never appears in the guide's commands. Both documents have since been brought
in line, but the shape recurs: when one document still describes a manual step
the code now does itself, that document is the stale one. Check the code before
editing either, and never "fix" the correct document to match the stale one.

### Step 3 — check the prose facts

For each fact in §3 above, confirm both documents say the same thing. Ports and
env-var names are the ones that rot silently, because nothing fails until a
reader follows them.

### Step 4 — apply the fixes

Editing the README is ordinary Markdown. Editing the landing page has rules:

- **Never hand-edit `assets.ts`.** Regenerate it.
- **No Markdown in `guide.ts` prose** — no backticks, no `**`, no `[link](url)`.
  Commands belong in a step's `code`, which is rendered as a code block.
- Keep prose in `body`, actions in `steps`. A step without a `code` block is
  usually a paragraph that wandered into the wrong field.
- Adding a step to only one install route means tagging it with `variant`.

### Step 5 — extend the test, then run it

When you reconcile a fact worth keeping reconciled, add the assertion to
`guide.test.ts` so the next drift fails a test instead of waiting for this skill
to be run again. That file is the durable half of this work; the skill is only
the pass that finds what it missed.

```bash
cd packages/landing-page && bun test
bun run typecheck   # from the repo root
```

## What to report

Say which of the four surfaces were out of sync and what you changed in each.
If you found a case-3 difference — the two documents disagreeing because the
code moved under them — say so explicitly and name the file you checked, since
that is a finding about the code, not about the docs.

If both sources already agree, say that plainly. A no-op pass is a valid result
and does not need edits invented to justify it.
