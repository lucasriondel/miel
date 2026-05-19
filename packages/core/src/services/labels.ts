import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import { labels } from "../db/schema";
import { createGogAdapter, type GogAdapter } from "../adapters/gog";

export interface LabelRow {
  id: string;
  accountId: string;
  gmailLabelId: string;
  name: string;
  type: string;
  colorBg: string | null;
  colorFg: string | null;
}

const LABEL_RETURNING = {
  id: labels.id,
  accountId: labels.accountId,
  gmailLabelId: labels.gmailLabelId,
  name: labels.name,
  type: labels.type,
  colorBg: labels.colorBg,
  colorFg: labels.colorFg,
};

export async function syncLabelsForAccount(args: {
  accountId: string;
  accountEmail: string;
  gog?: GogAdapter;
}): Promise<LabelRow[]> {
  const gog = args.gog ?? createGogAdapter();
  const { db } = getDb();
  const remote = await gog.listLabels({ account: args.accountEmail });
  if (remote.length === 0) return [];

  const values = remote.map((l) => ({
    accountId: args.accountId,
    gmailLabelId: l.id,
    name: l.name,
    type: l.type === "system" ? "system" : "user",
    colorBg: l.color?.backgroundColor ?? null,
    colorFg: l.color?.textColor ?? null,
  }));

  const inserted = await db
    .insert(labels)
    .values(values)
    .onConflictDoUpdate({
      target: [labels.accountId, labels.gmailLabelId],
      set: {
        name: sql`excluded.name`,
        type: sql`excluded.type`,
        colorBg: sql`excluded.color_bg`,
        colorFg: sql`excluded.color_fg`,
      },
    })
    .returning(LABEL_RETURNING);
  return inserted;
}

export async function getLabelsForAccount(
  accountId: string,
): Promise<LabelRow[]> {
  const { db } = getDb();
  return db
    .select(LABEL_RETURNING)
    .from(labels)
    .where(eq(labels.accountId, accountId));
}

export async function getLabelsByGmailIds(args: {
  accountId: string;
  gmailLabelIds: string[];
}): Promise<LabelRow[]> {
  if (args.gmailLabelIds.length === 0) return [];
  const { db } = getDb();
  return db
    .select(LABEL_RETURNING)
    .from(labels)
    .where(
      and(
        eq(labels.accountId, args.accountId),
        inArray(labels.gmailLabelId, args.gmailLabelIds),
      ),
    );
}

export async function ensureLabel(args: {
  accountId: string;
  accountEmail: string;
  name: string;
  gog?: GogAdapter;
}): Promise<LabelRow> {
  const gog = args.gog ?? createGogAdapter();
  const { db } = getDb();
  const existing = await db
    .select(LABEL_RETURNING)
    .from(labels)
    .where(
      and(eq(labels.accountId, args.accountId), eq(labels.name, args.name)),
    )
    .limit(1);
  if (existing.length > 0) return existing[0];

  const created = await gog.createLabel({
    account: args.accountEmail,
    name: args.name,
  });
  const inserted = await db
    .insert(labels)
    .values({
      accountId: args.accountId,
      gmailLabelId: created.id,
      name: created.name,
      type: created.type === "system" ? "system" : "user",
      colorBg: created.color?.backgroundColor ?? null,
      colorFg: created.color?.textColor ?? null,
    })
    .onConflictDoUpdate({
      target: [labels.accountId, labels.gmailLabelId],
      set: {
        name: sql`excluded.name`,
        colorBg: sql`excluded.color_bg`,
        colorFg: sql`excluded.color_fg`,
      },
    })
    .returning(LABEL_RETURNING);
  return inserted[0];
}
