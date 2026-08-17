import { Effect } from "effect";
// The database is reached only through the store seam (#132): this module holds
// what a setting *means* — its default, its parsing, its clamping — and the
// adapter behind `SettingsStore` holds the two queries.
import { SettingsStore } from "../stores/contracts";
import { SettingsStoreLive } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { runPromiseRethrow } from "../util/effect";
// Shared with the landing page's Claude disclosure, so the published batch size
// and the one actually used cannot drift apart.
import { DEFAULT_TRIAGE_BATCH_SIZE, MAX_TRIAGE_BATCH_SIZE } from "../claudeUsage";
// The provider catalogue: which vendors are pickable, what each one's default
// model is, and how to read a row written before #105.
import {
  DEFAULT_PROVIDER,
  MODEL_TASKS,
  defaultModelFor,
  normalizeModelId,
  normalizeProvider,
  type ModelTask,
  type Provider,
} from "../providerModels";
// The worp relay's non-secret half; its key and header map live in
// `services/encryptedSecrets.ts` (#107).
import { WORP_BASE_URL_SETTING } from "../worpConfig";

const debug = createDebug("service:settings");

export const SETTING_KEYS = {
  triageModel: "triage.model",
  triageProvider: "triage.provider",
  replyModel: "reply.model",
  replyProvider: "reply.provider",
  filterModel: "filter.model",
  filterProvider: "filter.provider",
  scheduleEnabled: "schedule.enabled",
  scheduleIntervalMinutes: "schedule.interval_minutes",
  scheduleSince: "schedule.since",
  triageBatchSize: "triage.batch_size",
  triageBatchConcurrency: "triage.batch_concurrency",
  // The worp relay's target host (#107). Not a secret, so it lives here rather
  // than in `encrypted_secrets` beside the key it is used with.
  worpBaseUrl: WORP_BASE_URL_SETTING,
} as const;

// The provider half comes from the catalogue's DEFAULT_PROVIDER rather than
// from three literals (#112): which provider a fresh install triages through is
// published in the README and the landing-page guide, and those are checked
// against that constant.
export const SETTING_DEFAULTS: Record<string, string> = {
  [SETTING_KEYS.triageModel]: "claude-haiku-4-5",
  [SETTING_KEYS.triageProvider]: DEFAULT_PROVIDER,
  [SETTING_KEYS.replyModel]: "claude-sonnet-4-6",
  [SETTING_KEYS.replyProvider]: DEFAULT_PROVIDER,
  [SETTING_KEYS.filterModel]: "claude-haiku-4-5",
  [SETTING_KEYS.filterProvider]: DEFAULT_PROVIDER,
  [SETTING_KEYS.scheduleEnabled]: "false",
  [SETTING_KEYS.scheduleIntervalMinutes]: "15",
  [SETTING_KEYS.scheduleSince]: "24h",
  [SETTING_KEYS.triageBatchSize]: String(DEFAULT_TRIAGE_BATCH_SIZE),
  [SETTING_KEYS.triageBatchConcurrency]: "3",
  // Empty means "worp not configured" — the relay is off until someone enters
  // a base URL and a key in Settings, which is the fresh-install default.
  [SETTING_KEYS.worpBaseUrl]: "",
};

export class UnknownSettingError extends Error {
  readonly _tag = "UnknownSettingError";
  constructor(public readonly key: string) {
    super(`Unknown setting key with no default: ${key}`);
    this.name = "UnknownSettingError";
  }
}

// Re-exported so the many callers that already import their settings types
// from here do not need a second import for the vendor union. The task
// vocabulary rides along for the same reason (#123): it is defined in the
// catalogue leaf, which the error taxonomy can import and this service cannot
// be imported by, but every caller of it reads a setting in the same breath.
export { MODEL_TASKS };
export type { ModelTask, Provider };

export interface ModelSettings {
  triageModel: string;
  triageProvider: Provider;
  replyModel: string;
  replyProvider: Provider;
  filterModel: string;
  filterProvider: Provider;
}

export interface ScheduleSettings {
  enabled: boolean;
  intervalMinutes: number;
  since: string;
}

export interface TriageBatchSettings {
  batchSize: number;
  batchConcurrency: number;
}

const MIN_INTERVAL_MINUTES = 1;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = MAX_TRIAGE_BATCH_SIZE;
const MIN_BATCH_CONCURRENCY = 1;
const MAX_BATCH_CONCURRENCY = 10;

function parseScheduleEnabled(raw: string): boolean {
  return raw.toLowerCase() === "true";
}

function parseScheduleIntervalMinutes(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < MIN_INTERVAL_MINUTES) return MIN_INTERVAL_MINUTES;
  return Math.floor(n);
}

function clampBatchSize(n: number): number {
  return Math.min(MAX_BATCH_SIZE, Math.max(MIN_BATCH_SIZE, Math.floor(n)));
}

function clampBatchConcurrency(n: number): number {
  return Math.min(MAX_BATCH_CONCURRENCY, Math.max(MIN_BATCH_CONCURRENCY, Math.floor(n)));
}

function parseTriageBatchSize(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return Number(SETTING_DEFAULTS[SETTING_KEYS.triageBatchSize]);
  return clampBatchSize(n);
}

function parseTriageBatchConcurrency(raw: string): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    return Number(SETTING_DEFAULTS[SETTING_KEYS.triageBatchConcurrency]);
  }
  return clampBatchConcurrency(n);
}

export const getSettingEffect = (
  key: string,
): Effect.Effect<string, UnknownSettingError, SettingsStore> =>
  Effect.gen(function* () {
    const stored = yield* SettingsStore.read(key);
    if (stored !== null) {
      debug("getSetting hit", { key, value: stored });
      return stored;
    }
    const fallback = SETTING_DEFAULTS[key];
    if (fallback === undefined) {
      return yield* Effect.fail(new UnknownSettingError(key));
    }
    debug("getSetting default", { key, value: fallback });
    return fallback;
  });

export const setSettingEffect = (
  key: string,
  value: string,
): Effect.Effect<void, never, SettingsStore> =>
  Effect.gen(function* () {
    debug("setSetting", { key, value });
    yield* SettingsStore.write(key, value);
  });

/**
 * Stored strings → the settings the app runs on.
 *
 * Normalized on the way out and not only in migration 0010 (#105): a row
 * written by an older build, by hand, or by a browser tab still holding the
 * previous bundle reads as a vendor this code knows. The migration is what
 * makes it stick; this is what keeps it from mattering.
 */
export function normalizeModelSettings(raw: Record<string, string>): ModelSettings {
  const value = (key: string) => raw[key] ?? SETTING_DEFAULTS[key];
  return {
    triageModel: normalizeModelId(value(SETTING_KEYS.triageModel)),
    triageProvider: normalizeProvider(value(SETTING_KEYS.triageProvider)),
    replyModel: normalizeModelId(value(SETTING_KEYS.replyModel)),
    replyProvider: normalizeProvider(value(SETTING_KEYS.replyProvider)),
    filterModel: normalizeModelId(value(SETTING_KEYS.filterModel)),
    filterProvider: normalizeProvider(value(SETTING_KEYS.filterProvider)),
  };
}

/**
 * The rows a patch turns into, given what is stored now. Pure, so the rule that
 * is easy to get wrong — a provider switch that names no model — is testable
 * without a database.
 */
export function modelSettingWrites(
  patch: Partial<ModelSettings>,
  current: ModelSettings,
): Array<{ key: string; value: string }> {
  const writes: Array<{ key: string; value: string }> = [];
  for (const task of MODEL_TASKS) {
    const patchedProvider = patch[`${task}Provider`];
    const provider = patchedProvider === undefined ? undefined : normalizeProvider(patchedProvider);
    if (provider !== undefined) {
      writes.push({ key: SETTING_KEYS[`${task}Provider`], value: provider });
    }
    // Switching vendor with no model named would otherwise leave the previous
    // vendor's model id in place — an id the new one does not serve, and one
    // the settings route rejects on the next save.
    const patchedModel = patch[`${task}Model`];
    const model =
      patchedModel !== undefined
        ? normalizeModelId(patchedModel)
        : provider !== undefined && provider !== current[`${task}Provider`]
          ? defaultModelFor(provider)
          : undefined;
    if (model !== undefined) {
      writes.push({ key: SETTING_KEYS[`${task}Model`], value: model });
    }
  }
  return writes;
}

const MODEL_SETTING_KEYS = MODEL_TASKS.flatMap((task) => [
  SETTING_KEYS[`${task}Model`],
  SETTING_KEYS[`${task}Provider`],
]);

export const getModelSettingsEffect = (): Effect.Effect<
  ModelSettings,
  UnknownSettingError,
  SettingsStore
> =>
  Effect.map(
    Effect.all(
      MODEL_SETTING_KEYS.map((key) => Effect.map(getSettingEffect(key), (value) => [key, value])),
      { concurrency: "unbounded" },
    ),
    (entries) => normalizeModelSettings(Object.fromEntries(entries)),
  );

export const updateModelSettingsEffect = (
  patch: Partial<ModelSettings>,
): Effect.Effect<ModelSettings, UnknownSettingError, SettingsStore> =>
  Effect.gen(function* () {
    const current = yield* getModelSettingsEffect();
    yield* Effect.all(
      modelSettingWrites(patch, current).map((w) => setSettingEffect(w.key, w.value)),
      { concurrency: "unbounded" },
    );
    return yield* getModelSettingsEffect();
  });

export const getScheduleSettingsEffect = (): Effect.Effect<
  ScheduleSettings,
  UnknownSettingError,
  SettingsStore
> =>
  Effect.map(
    Effect.all(
      [
        getSettingEffect(SETTING_KEYS.scheduleEnabled),
        getSettingEffect(SETTING_KEYS.scheduleIntervalMinutes),
        getSettingEffect(SETTING_KEYS.scheduleSince),
      ],
      { concurrency: "unbounded" },
    ),
    ([enabled, intervalMinutes, since]) => ({
      enabled: parseScheduleEnabled(enabled),
      intervalMinutes: parseScheduleIntervalMinutes(intervalMinutes),
      since,
    }),
  );

export const updateScheduleSettingsEffect = (
  patch: Partial<ScheduleSettings>,
): Effect.Effect<ScheduleSettings, UnknownSettingError, SettingsStore> =>
  Effect.gen(function* () {
    const ops: Effect.Effect<void, never, SettingsStore>[] = [];
    if (patch.enabled !== undefined) {
      ops.push(setSettingEffect(SETTING_KEYS.scheduleEnabled, patch.enabled ? "true" : "false"));
    }
    if (patch.intervalMinutes !== undefined) {
      const clamped = Math.max(MIN_INTERVAL_MINUTES, Math.floor(patch.intervalMinutes));
      ops.push(setSettingEffect(SETTING_KEYS.scheduleIntervalMinutes, String(clamped)));
    }
    if (patch.since !== undefined) {
      ops.push(setSettingEffect(SETTING_KEYS.scheduleSince, patch.since));
    }
    yield* Effect.all(ops, { concurrency: "unbounded" });
    return yield* getScheduleSettingsEffect();
  });

export const getTriageBatchSettingsEffect = (): Effect.Effect<
  TriageBatchSettings,
  UnknownSettingError,
  SettingsStore
> =>
  Effect.map(
    Effect.all(
      [
        getSettingEffect(SETTING_KEYS.triageBatchSize),
        getSettingEffect(SETTING_KEYS.triageBatchConcurrency),
      ],
      { concurrency: "unbounded" },
    ),
    ([batchSize, batchConcurrency]) => ({
      batchSize: parseTriageBatchSize(batchSize),
      batchConcurrency: parseTriageBatchConcurrency(batchConcurrency),
    }),
  );

export const updateTriageBatchSettingsEffect = (
  patch: Partial<TriageBatchSettings>,
): Effect.Effect<TriageBatchSettings, UnknownSettingError, SettingsStore> =>
  Effect.gen(function* () {
    const ops: Effect.Effect<void, never, SettingsStore>[] = [];
    if (patch.batchSize !== undefined) {
      ops.push(
        setSettingEffect(SETTING_KEYS.triageBatchSize, String(clampBatchSize(patch.batchSize))),
      );
    }
    if (patch.batchConcurrency !== undefined) {
      ops.push(
        setSettingEffect(
          SETTING_KEYS.triageBatchConcurrency,
          String(clampBatchConcurrency(patch.batchConcurrency)),
        ),
      );
    }
    yield* Effect.all(ops, { concurrency: "unbounded" });
    return yield* getTriageBatchSettingsEffect();
  });

// Promise facades for the API/CLI boundary. This is where production provides
// the Postgres adapter (#132): above this line every effect carries its store
// requirement in the `R` channel, and a caller that has a different store —
// a test, most of all — provides that one instead.
const run = <A, E>(eff: Effect.Effect<A, E, SettingsStore>): Promise<A> =>
  runPromiseRethrow(Effect.provide(eff, SettingsStoreLive));

export async function getSetting(key: string): Promise<string> {
  return run(getSettingEffect(key));
}

export async function setSetting(key: string, value: string): Promise<void> {
  return run(setSettingEffect(key, value));
}

export async function getModelSettings(): Promise<ModelSettings> {
  return run(getModelSettingsEffect());
}

export async function updateModelSettings(patch: Partial<ModelSettings>): Promise<ModelSettings> {
  return run(updateModelSettingsEffect(patch));
}

export async function getScheduleSettings(): Promise<ScheduleSettings> {
  return run(getScheduleSettingsEffect());
}

export async function updateScheduleSettings(
  patch: Partial<ScheduleSettings>,
): Promise<ScheduleSettings> {
  return run(updateScheduleSettingsEffect(patch));
}

export async function getTriageBatchSettings(): Promise<TriageBatchSettings> {
  return run(getTriageBatchSettingsEffect());
}

export async function updateTriageBatchSettings(
  patch: Partial<TriageBatchSettings>,
): Promise<TriageBatchSettings> {
  return run(updateTriageBatchSettingsEffect(patch));
}
