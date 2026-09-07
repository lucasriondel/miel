# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT-MAP.md`** at the repo root — it indexes the contexts. Read the entries relevant to the topic.
- **`CONTEXT.md`** at the repo root — the system-wide glossary, shared by every package.
- **`packages/<name>/CONTEXT.md`** — a package's own glossary, where one exists. These are written lazily, so most packages have none yet; that is expected.
- **`docs/adr/`** — system-wide decisions. Read the ADRs that touch the area you're about to work in.
- **`packages/<name>/docs/adr/`** — package-scoped decisions, where they exist.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

This is a multi-context repo: a Bun/Turborepo workspace whose contexts are the packages under `packages/*`, not directories under `src/`.

```
/
├── CONTEXT-MAP.md                     ← index of contexts
├── CONTEXT.md                         ← system-wide glossary
├── docs/adr/                          ← system-wide decisions
│   └── 0001-provider-credentials-in-postgres.md
└── packages/
    ├── core/
    │   ├── CONTEXT.md                 ← package glossary (lazy)
    │   ├── docs/adr/                  ← package decisions (lazy)
    │   └── src/
    ├── api/
    ├── web/
    ├── cli/
    └── landing-page/
```

Note the shape: a package's `CONTEXT.md` and `docs/adr/` sit at the package root, beside its `package.json`, not inside its `src/`.

## Which context does a term belong to?

Put a term at the **root** when more than one package speaks it — most of miel's vocabulary is like this, because `@miel/core` defines the nouns and `@miel/api`, `@miel/web` and `@miel/cli` all consume them. Put it in a **package** only when that package is the only one that says it: a web-only interaction concept, a CLI-only flag vocabulary.

When in doubt, root. A term duplicated across two package glossaries is worse than one at the root, because the two copies drift.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids — the `_Avoid_` line under each term is binding, not advisory.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0001 (provider credentials in Postgres) — but worth reopening because…_
