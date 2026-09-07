/**
 * Which provider a task may be pointed at, and the only checked way to change
 * it (#124).
 *
 * One rule protects the user: **a task must never be left pointing at a hosted
 * Provider that cannot run it** — a vendor with no stored credential, or a model
 * that vendor does not serve. Either one is stored happily and then fails on the
 * next sync, in a log line nobody is watching, when the user is no longer
 * looking at the picker.
 *
 * That rule used to live in two inline guards in the API's settings route, which
 * had three costs: a direct core call (the CLI, a future scheduler) walked past
 * it; the route carried its own copy of the settings service's "a provider
 * switch with no model named lands on that vendor's default" rule, under a
 * comment admitting it mirrored the service; and the behaviour matrix could only
 * be tested through a mocked HTTP route.
 *
 * Three layers, in dependency order:
 *
 *   - a **pure kernel** ({@link taskProviderProblem} and the two `reject*`
 *     functions) — the patch, what is stored, and which vendors have a key in,
 *     a rejection or null out. No database, no mocks, no I/O;
 *   - **checked write facades** ({@link checkedUpdateModelSettingsEffect},
 *     {@link checkedDeleteProviderCredentialEffect}) that run the kernel before
 *     writing, so a mixed patch is refused whole;
 *   - a **resolver** ({@link resolveTaskProviderEffect}) answering which
 *     provider and model a task runs on, or why it cannot.
 *
 * Two boundaries this module keeps:
 *
 * It composes `settings.ts` and `encryptedSecrets.ts` and neither imports it
 * back, so there is no cycle and the plain (unchecked) writers stay available to
 * the one caller that should have them — a migration.
 *
 * It reads credential *presence* only, through `ProviderCredentialStatus`'s
 * boolean. Nothing here decrypts, and {@link ResolvedTaskProvider} carries no
 * credential field, so ADR-0001's single-decryptor rule is untouched.
 *
 * `claude-code` is always runnable at save time. Its token is a run-time
 * concern: the shipped default provider is claude-code and the defaults exist
 * before anyone has pasted a token, so checking it here would refuse every save
 * on a fresh install — including the save that switches away from it.
 *
 * The escape hatch, named on purpose: `setSetting(key, value)` still writes any
 * key-value pair, provider rows included, with no check at all. An operator
 * fixing a wedged install needs it; nothing in the app should use it to change a
 * task's provider.
 */
import { Effect } from "effect";
import {
  MODEL_TASKS,
  isHostedProvider,
  isModelForProvider,
  type CredentialProvider,
  type ModelTask,
  type Provider,
} from "../providerModels";
import {
  ProviderNotRunnableError,
  type InvalidProviderCredentialError,
  type TaskProviderPhase,
} from "../errors";
import type { SecretStore, SettingsStore } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import {
  SETTING_KEYS,
  getModelSettingsEffect,
  modelSettingWrites,
  normalizeModelSettings,
  updateModelSettingsEffect,
  type ModelSettings,
  type UnknownSettingError,
} from "./settings";
import {
  CREDENTIAL_PROVIDERS,
  deleteProviderCredentialEffect,
  getProviderCredentialStatusEffect,
  type ProviderCredentialStatus,
} from "./encryptedSecrets";

const debug = createDebug("service:taskProviders");

/** The hosted vendors that have a key stored — presence only, never a key. */
export type ConfiguredProviders = ReadonlySet<CredentialProvider>;

/** Which provider and model a task runs on. Deliberately no credential field. */
export interface ResolvedTaskProvider {
  task: ModelTask;
  provider: Provider;
  model: string;
}

// ── The pure kernel ─────────────────────────────────────────────────────────

/**
 * The settings a patch would leave behind, given what is stored now.
 *
 * Built from the settings service's own {@link modelSettingWrites}, so the rule
 * that used to be duplicated — switching vendor with no model named lands on
 * that vendor's default — is applied here rather than restated. What the kernel
 * checks is therefore exactly what would be written, normalization included: a
 * legacy `hosted-api` or a prefixed model id from an old client is checked as
 * the value it becomes, not as the value it arrived as.
 */
export function settingsAfterPatch(
  patch: Partial<ModelSettings>,
  current: ModelSettings,
): ModelSettings {
  const rows: Record<string, string> = {};
  for (const task of MODEL_TASKS) {
    rows[SETTING_KEYS[`${task}Provider`]] = current[`${task}Provider`];
    rows[SETTING_KEYS[`${task}Model`]] = current[`${task}Model`];
  }
  for (const write of modelSettingWrites(patch, current)) {
    rows[write.key] = write.value;
  }
  return normalizeModelSettings(rows);
}

/** Which provider and model a task runs on, with nothing checked. */
export function resolvedTaskProvider(
  task: ModelTask,
  settings: ModelSettings,
): ResolvedTaskProvider {
  return { task, provider: settings[`${task}Provider`], model: settings[`${task}Model`] };
}

/**
 * Why this task could not run on the settings it would have, or null.
 *
 * The one checker: both doors below and the resolver are this function plus the
 * decision of *which* tasks and settings to hand it. The model is checked before
 * the credential because a model the vendor does not serve is wrong whether or
 * not a key exists.
 *
 * `phase` is carried on the refusal rather than decided by whoever catches it:
 * the doors refuse an edit, the resolver refuses a run, and a boundary maps the
 * two differently (#125). It defaults to `save` because that is what a caller
 * naming no phase is doing — checking something before storing it.
 */
export function taskProviderProblem(
  task: ModelTask,
  settings: ModelSettings,
  configured: ConfiguredProviders,
  phase: TaskProviderPhase = "save",
): ProviderNotRunnableError | null {
  const { provider, model } = resolvedTaskProvider(task, settings);
  if (!isModelForProvider(provider, model)) {
    return new ProviderNotRunnableError({
      task,
      provider,
      reason: "invalid_model_for_provider",
      phase,
      model,
    });
  }
  if (isHostedProvider(provider) && !configured.has(provider)) {
    return new ProviderNotRunnableError({
      task,
      provider,
      reason: "missing_provider_credential",
      phase,
    });
  }
  return null;
}

/** True when the patch has something to say about this task. */
const patchTouches = (patch: Partial<ModelSettings>, task: ModelTask): boolean =>
  patch[`${task}Provider`] !== undefined || patch[`${task}Model`] !== undefined;

/**
 * Why this patch cannot be saved, or null.
 *
 * Only the tasks the patch touches are checked — a model id stored before the
 * catalogue existed, or a vendor whose key went away out of band, must not make
 * every unrelated save fail. The check runs for a task whenever the patch names
 * either half of it, not only when it names a provider (#117): a model-only edit
 * resolves its vendor from the stored row, and that is a way into the same
 * unrunnable pairing through the front door.
 */
export function rejectModelPatch(
  patch: Partial<ModelSettings>,
  current: ModelSettings,
  configured: ConfiguredProviders,
): ProviderNotRunnableError | null {
  const after = settingsAfterPatch(patch, current);
  for (const task of MODEL_TASKS) {
    if (!patchTouches(patch, task)) continue;
    const problem = taskProviderProblem(task, after, configured);
    if (problem !== null) return problem;
  }
  return null;
}

/**
 * Why this credential cannot be deleted, or null.
 *
 * Deleting is the other door into the state {@link rejectModelPatch} exists to
 * shut: dropping the key of the vendor a task is presently running on leaves
 * that task unrunnable, and the failure surfaces on the next sync instead of
 * here, where the user is still looking at the row.
 *
 * A vendor no task points at is deleted as before — this is about the pairing,
 * not about the key. The rejection names the task that would be left without
 * one, and reports it as a missing credential rather than re-checking that
 * task's model: the deletion is what would break it, so that is what it says.
 */
export function rejectCredentialDeletion(
  provider: CredentialProvider,
  current: ModelSettings,
): ProviderNotRunnableError | null {
  const task = MODEL_TASKS.find((t) => current[`${t}Provider`] === provider);
  return task === undefined
    ? null
    : new ProviderNotRunnableError({
        task,
        provider,
        reason: "missing_provider_credential",
        phase: "save",
      });
}

// ── The checked doors ───────────────────────────────────────────────────────

/**
 * The stored state the doors read and the writes they guard.
 *
 * A seam, not a plugin point: {@link taskProviderDoors} is called once below
 * with the real services, and the only other caller is the test that proves a
 * refused patch wrote nothing. It exists so that proof needs no database and no
 * process-global module mock of the db client.
 *
 * `R` is whatever the store's own effects require, and it rides through to the
 * doors unchanged (#132): the live store composes the settings and secret
 * services, so its `R` is `SettingsStore | SecretStore` and the Promise facades
 * below provide the Postgres adapters; a fake built out of `Effect.succeed`
 * reaches nothing, so its `R` is `never` and the door effects it builds run
 * with nothing provided. Fixing it at `never` here would have made the live
 * wiring a type error, and made the doors' effects claim, falsely, that they
 * can run with no store provided.
 */
export interface TaskProviderStore<R = never> {
  readonly readSettings: () => Effect.Effect<ModelSettings, UnknownSettingError, R>;
  readonly readConfigured: () => Effect.Effect<ConfiguredProviders, never, R>;
  readonly writeSettings: (
    patch: Partial<ModelSettings>,
  ) => Effect.Effect<ModelSettings, UnknownSettingError, R>;
  readonly dropCredential: (
    provider: CredentialProvider,
  ) => Effect.Effect<ProviderCredentialStatus, InvalidProviderCredentialError, R>;
}

// `R` is the store seam's, threaded rather than erased: the live doors read and
// write through `SettingsStore`/`SecretStore` (#132), so that requirement rides
// out to the Promise facades below, while the in-memory doors a test builds
// require nothing. `NoInfer` so `R` comes from the call site rather than from
// the store literal: the live wiring names the two services, and a fake built
// out of `Effect.succeed` takes the default and stays runnable with
// `Effect.runSync`.
export const taskProviderDoors = <R = never>(store: TaskProviderStore<NoInfer<R>>) => {
  /**
   * Save a model/provider patch, or refuse it. Every task the patch touches is
   * checked before anything is written, so a two-task patch with one bad half is
   * refused whole rather than half-applied.
   */
  const checkedUpdateModelSettingsEffect = (
    patch: Partial<ModelSettings>,
  ): Effect.Effect<ModelSettings, ProviderNotRunnableError | UnknownSettingError, R> =>
    Effect.gen(function* () {
      const [current, configured] = yield* Effect.all(
        [store.readSettings(), store.readConfigured()],
        { concurrency: "unbounded" },
      );
      const rejection = rejectModelPatch(patch, current, configured);
      if (rejection !== null) {
        // Task, vendor and reason code — the same three fields the rejection
        // carries, and no more: there is no key to log here even by accident.
        debug("refused patch", {
          task: rejection.task,
          provider: rejection.provider,
          reason: rejection.reason,
        });
        return yield* Effect.fail(rejection);
      }
      return yield* store.writeSettings(patch);
    });

  /** Drop a vendor's key, unless a task is presently pointed at that vendor. */
  const checkedDeleteProviderCredentialEffect = (
    provider: CredentialProvider,
  ): Effect.Effect<
    ProviderCredentialStatus,
    ProviderNotRunnableError | UnknownSettingError | InvalidProviderCredentialError,
    R
  > =>
    Effect.gen(function* () {
      const rejection = rejectCredentialDeletion(provider, yield* store.readSettings());
      if (rejection !== null) {
        debug("refused deletion", { task: rejection.task, provider: rejection.provider });
        return yield* Effect.fail(rejection);
      }
      return yield* store.dropCredential(provider);
    });

  /**
   * The provider and model a task runs on, or why it cannot run.
   *
   * For a caller about to spend a request: the settings service answers what is
   * stored, this answers whether it is runnable. Credential presence is read
   * through the boolean status, so the resolved value carries no key.
   *
   * Since #125 this is what the Claude service calls before it picks a
   * transport, which is why the refusal is a run-phase one: nothing about the
   * request that triggered it is wrong, the install simply cannot do the work.
   */
  const resolveTaskProviderEffect = (
    task: ModelTask,
  ): Effect.Effect<ResolvedTaskProvider, ProviderNotRunnableError | UnknownSettingError, R> =>
    Effect.gen(function* () {
      const [settings, configured] = yield* Effect.all(
        [store.readSettings(), store.readConfigured()],
        { concurrency: "unbounded" },
      );
      const problem = taskProviderProblem(task, settings, configured, "run");
      if (problem !== null) {
        debug("refused run", { task, provider: problem.provider, reason: problem.reason });
        return yield* Effect.fail(problem);
      }
      return resolvedTaskProvider(task, settings);
    });

  return {
    checkedUpdateModelSettingsEffect,
    checkedDeleteProviderCredentialEffect,
    resolveTaskProviderEffect,
  };
};

/**
 * Which hosted vendors have a key stored, as booleans.
 *
 * All three are asked rather than only the vendor in hand, so the kernel gets a
 * set and stays a pure function of it. `orDie`: the providers come from the
 * catalogue, so the service's unknown-vendor failure is unreachable — reaching
 * it would be a bug in this module, not a rejected input.
 */
const readConfiguredProviders = (): Effect.Effect<ConfiguredProviders, never, SecretStore> =>
  Effect.map(
    Effect.all(
      CREDENTIAL_PROVIDERS.map((provider) =>
        Effect.orDie(getProviderCredentialStatusEffect(provider)),
      ),
      { concurrency: "unbounded" },
    ),
    (statuses) => new Set(statuses.filter((s) => s.configured).map((s) => s.provider)),
  );

/**
 * The live doors, over the two services this module composes. Their stores are
 * what the doors' effects require — the requirement rides in `R` all the way to
 * the Promise facades below, which is where production provides the Postgres
 * adapters (#132), the same place `settings.ts` does.
 */
const liveDoors = taskProviderDoors<SettingsStore | SecretStore>({
  readSettings: () => getModelSettingsEffect(),
  readConfigured: readConfiguredProviders,
  writeSettings: updateModelSettingsEffect,
  dropCredential: deleteProviderCredentialEffect,
});

export const checkedUpdateModelSettingsEffect = liveDoors.checkedUpdateModelSettingsEffect;
export const checkedDeleteProviderCredentialEffect =
  liveDoors.checkedDeleteProviderCredentialEffect;
export const resolveTaskProviderEffect = liveDoors.resolveTaskProviderEffect;

// Promise facades for the API/CLI boundary, and where the Postgres adapters are
// provided (#132). There is no facade over the plain writers here on purpose:
// those live in the services this one composes, and a caller that wants the
// checked door should not find an unchecked one beside it.
export async function checkedUpdateModelSettings(
  patch: Partial<ModelSettings>,
): Promise<ModelSettings> {
  return runWithStores(checkedUpdateModelSettingsEffect(patch));
}

export async function checkedDeleteProviderCredential(
  provider: CredentialProvider,
): Promise<ProviderCredentialStatus> {
  return runWithStores(checkedDeleteProviderCredentialEffect(provider));
}

export async function resolveTaskProvider(task: ModelTask): Promise<ResolvedTaskProvider> {
  return runWithStores(resolveTaskProviderEffect(task));
}
