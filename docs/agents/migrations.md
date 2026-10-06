# Migrations

A migration is two files: `packages/core/drizzle/NNNN_*.sql` (what the migrator applies) and `packages/core/drizzle/meta/NNNN_snapshot.json` (the schema state it left, which `drizzle-kit generate` diffs the *next* change against). Nothing at runtime reads a snapshot, so the two can drift silently — and a stale snapshot makes the next `generate` re-create objects that already exist (#122).

So: `bunx drizzle-kit generate` from the repo root, which writes both. A hand-written migration (a data rewrite like `0010`) still needs its snapshot written by hand: the previous snapshot plus that migration's effect, chained by `prevId` → the predecessor's `id`. `packages/core/src/db/migrationSnapshots.test.ts` guards the journal, SQL and snapshots listing the same migrations, the `prevId` chain, and the newest snapshot matching `schema.ts`.
