import { eq } from "drizzle-orm";
import { getDb } from "../db/client";
import { appSettings } from "../db/schema";

export const SETTING_KEYS = {
  triageModel: "triage.model",
  replyModel: "reply.model",
} as const;

export const SETTING_DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.triageModel]: "claude-haiku-4-5",
  [SETTING_KEYS.replyModel]: "claude-sonnet-4-6",
};

export interface ModelSettings {
  triageModel: string;
  replyModel: string;
}

export async function getSetting(key: string): Promise<string> {
  const { db } = getDb();
  const rows = await db
    .select({ value: appSettings.value })
    .from(appSettings)
    .where(eq(appSettings.key, key))
    .limit(1);
  if (rows.length > 0) return rows[0].value;
  const fallback = SETTING_DEFAULTS[key];
  if (fallback === undefined) {
    throw new Error(`Unknown setting key with no default: ${key}`);
  }
  return fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const { db } = getDb();
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getModelSettings(): Promise<ModelSettings> {
  const [triageModel, replyModel] = await Promise.all([
    getSetting(SETTING_KEYS.triageModel),
    getSetting(SETTING_KEYS.replyModel),
  ]);
  return { triageModel, replyModel };
}

export async function updateModelSettings(
  patch: Partial<ModelSettings>,
): Promise<ModelSettings> {
  const ops: Promise<void>[] = [];
  if (patch.triageModel !== undefined) {
    ops.push(setSetting(SETTING_KEYS.triageModel, patch.triageModel));
  }
  if (patch.replyModel !== undefined) {
    ops.push(setSetting(SETTING_KEYS.replyModel, patch.replyModel));
  }
  await Promise.all(ops);
  return getModelSettings();
}
