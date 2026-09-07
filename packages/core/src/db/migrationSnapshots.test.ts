// `packages/core/drizzle/meta/` is the migration chain's other half: `_journal.json`
// says which migrations exist, and each `NNNN_snapshot.json` is the schema state
// that migration left behind. `drizzle-kit generate` diffs the current schema
// against the *newest* snapshot — so a snapshot that is missing or stale is not a
// bookkeeping problem, it is a wrong migration file handed to whoever runs
// `generate` next.
//
// That is exactly how #122 opened: six hand-written migrations (0006…0011) landed
// with no snapshot beside them, so the baseline `generate` diffed against was
// 0005 and the next generated migration would have re-created six migrations'
// worth of objects. Nothing failed, because nothing looked.
//
// This is what looks. It reads the chain as data rather than running drizzle-kit:
// the journal, the SQL files and the snapshot set must list the same migrations;
// each snapshot must name the one before it; and the newest snapshot must be the
// schema `schema.ts` currently describes, table for table and column for column.
// The last of those is the assertion with teeth — it is `generate` producing an
// empty migration, decided in-process.
import { describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { isTable } from "drizzle-orm";
import { getTableConfig, isPgEnum, type PgTable } from "drizzle-orm/pg-core";
import * as schema from "./schema";

const DRIZZLE = new URL("../../drizzle/", import.meta.url);

const FIRST_PREV_ID = "00000000-0000-0000-0000-000000000000";

type JournalEntry = { idx: number; tag: string };
type SnapshotColumn = { name: string; type: string; notNull: boolean; primaryKey: boolean };
type SnapshotIndexColumn = { expression: string; isExpression: boolean };
type SnapshotTable = {
  name: string;
  columns: Record<string, SnapshotColumn>;
  indexes: Record<string, { columns: SnapshotIndexColumn[]; isUnique: boolean }>;
  compositePrimaryKeys: Record<string, { columns: string[] }>;
  uniqueConstraints: Record<string, { columns: string[] }>;
};
type Snapshot = {
  id: string;
  prevId: string;
  tables: Record<string, SnapshotTable>;
  enums: Record<string, { name: string; values: string[] }>;
};

const readJson = async <T>(name: string): Promise<T> =>
  JSON.parse(await Bun.file(new URL(name, DRIZZLE)).text()) as T;

const journal = await readJson<{ entries: JournalEntry[] }>("meta/_journal.json");
const tags = journal.entries.map((e) => e.tag);

const files = readdirSync(DRIZZLE);
const metaFiles = readdirSync(new URL("meta/", DRIZZLE));

/** The four-digit prefix a migration's snapshot is filed under. */
const snapshotName = (tag: string) => `${tag.slice(0, 4)}_snapshot.json`;

/** Null rather than a throw for a missing one: its absence is what a test here asserts on. */
const readSnapshot = async (tag: string): Promise<Snapshot | null> => {
  const file = Bun.file(new URL(`meta/${snapshotName(tag)}`, DRIZZLE));
  return (await file.exists()) ? (JSON.parse(await file.text()) as Snapshot) : null;
};

describe("the journal and the snapshots list the same migrations", () => {
  test("the journal is the chain this repo actually ships", () => {
    // Guards the assertions below from passing vacuously on a journal that was
    // not read, and pins `idx` to the file prefix the other tests derive from it.
    expect(tags[0]).toBe("0000_loving_lyja");
    expect(tags.length).toBeGreaterThanOrEqual(12);
    expect(journal.entries.map((e) => e.idx)).toEqual(tags.map((_, i) => i));
  });

  test("every migration has its SQL file, and no SQL file is unlisted", () => {
    expect(files.filter((f) => f.endsWith(".sql")).toSorted()).toEqual(
      tags.map((tag) => `${tag}.sql`),
    );
  });

  test("every migration has its snapshot, and no snapshot is unlisted", () => {
    expect(metaFiles.filter((f) => f.endsWith("_snapshot.json")).toSorted()).toEqual(
      tags.map(snapshotName),
    );
  });

  test("each snapshot names the one before it", async () => {
    // The ids are the chain: a snapshot whose prevId is not its predecessor's id
    // was written against a different history than the one in the journal.
    const links: string[] = [];
    let prev = FIRST_PREV_ID;
    for (const tag of tags) {
      const snap = await readSnapshot(tag);
      if (!snap) {
        links.push(`${tag} ← no snapshot`);
        continue;
      }
      links.push(`${tag} ← ${snap.prevId === prev ? "its predecessor" : snap.prevId}`);
      prev = snap.id;
    }
    expect(links).toEqual(tags.map((tag) => `${tag} ← its predecessor`));
  });
});

const newest = await readSnapshot(tags.at(-1)!);

/** Every table `schema.ts` defines, keyed the way a snapshot keys them. */
const schemaTables = new Map(
  (Object.values(schema) as unknown[])
    .filter((v): v is PgTable => isTable(v))
    .map((table) => [`public.${getTableConfig(table).name}`, table] as const),
);

/**
 * One comparable shape, built from either side. Strings rather than nested
 * objects so a mismatch reads as a diff of the thing that is wrong (a column's
 * type, an index's columns) instead of a wall of JSON.
 */
type TableShape = {
  columns: Record<string, string>;
  indexes: Record<string, string>;
  primaryKeys: Record<string, string>;
  uniques: Record<string, string>;
};

const column = (type: string, notNull: boolean, primaryKey: boolean) =>
  `${type}${notNull ? " not null" : ""}${primaryKey ? " primary key" : ""}`;

const shapeOfSchema = (table: PgTable): TableShape => {
  const config = getTableConfig(table);
  return {
    columns: Object.fromEntries(
      config.columns.map((c) => [c.name, column(c.getSQLType(), c.notNull, c.primary)]),
    ),
    indexes: Object.fromEntries(
      config.indexes.map((i) => [
        i.config.name,
        `${i.config.unique ? "unique " : ""}(${i.config.columns.map((c) => ("name" in c ? c.name : String(c))).join(", ")})`,
      ]),
    ),
    primaryKeys: Object.fromEntries(
      config.primaryKeys.map((pk) => [pk.getName(), pk.columns.map((c) => c.name).join(", ")]),
    ),
    uniques: Object.fromEntries([
      // A `.unique()` column and a table-level unique constraint are one thing
      // to Postgres, and one entry in the snapshot.
      ...config.uniqueConstraints.map(
        (u) => [u.name, u.columns.map((c) => c.name).join(", ")] as const,
      ),
      ...config.columns.filter((c) => c.isUnique).map((c) => [c.uniqueName!, c.name] as const),
    ]),
  };
};

const shapeOfSnapshot = (table: SnapshotTable): TableShape => ({
  columns: Object.fromEntries(
    Object.values(table.columns).map((c) => [c.name, column(c.type, c.notNull, c.primaryKey)]),
  ),
  indexes: Object.fromEntries(
    Object.entries(table.indexes).map(([name, i]) => [
      name,
      `${i.isUnique ? "unique " : ""}(${i.columns.map((c) => (c.isExpression ? `(${c.expression})` : c.expression)).join(", ")})`,
    ]),
  ),
  primaryKeys: Object.fromEntries(
    Object.entries(table.compositePrimaryKeys).map(([name, pk]) => [name, pk.columns.join(", ")]),
  ),
  uniques: Object.fromEntries(
    Object.entries(table.uniqueConstraints).map(([name, u]) => [name, u.columns.join(", ")]),
  ),
});

describe("the newest snapshot is the schema drizzle-kit would diff against", () => {
  test(`${tags.at(-1)} has a snapshot at all`, () => {
    expect(newest).not.toBeNull();
  });

  test("it holds exactly the tables schema.ts defines", () => {
    expect(Object.keys(newest?.tables ?? {}).toSorted()).toEqual(
      [...schemaTables.keys()].toSorted(),
    );
  });

  test.each([...schemaTables.keys()])("%s matches, column for column", (key) => {
    const snapshotTable = newest?.tables[key];
    expect(snapshotTable).toBeDefined();
    expect(shapeOfSnapshot(snapshotTable!)).toEqual(shapeOfSchema(schemaTables.get(key)!));
  });

  test("the enums match, name and values", () => {
    const declared = Object.values(schema)
      .filter((v) => isPgEnum(v))
      .map((e) => `public.${e.enumName}: ${e.enumValues.join(", ")}`);
    expect(
      Object.entries(newest?.enums ?? {})
        .map(([key, e]) => `${key}: ${e.values.join(", ")}`)
        .toSorted(),
    ).toEqual(declared.toSorted());
  });
});
