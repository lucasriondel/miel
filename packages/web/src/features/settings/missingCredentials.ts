import {
  CLAUDE_CODE_PROVIDER,
  PROVIDER_LABELS,
  isHostedProvider,
  type ModelTask,
  type Provider,
} from "@miel/core/providerModels";
import type { CredentialProvider, ModelSettings } from "../../api/types";
import { MODEL_ROWS } from "./ModelsCard";

const TASKS = Object.keys(MODEL_ROWS) as ModelTask[];

export interface MissingCredentials {
  title: string;
  body: string;
}

const joinNames = (names: string[]) => names.join(", ").replace(/, ([^,]*)$/, " and $1");

/**
 * Which tasks point at a provider with no credential, as the AI tab's callout
 * says it — or `null` when every task can run.
 *
 * Pure, so what the callout claims is assertable without a server. The fresh
 * install is the case the design draws: every task on the local provider and no
 * token, which gets the design's own sentence. Anything else names the tasks
 * and providers it is about, read off the catalogue rather than spelled out.
 */
export function missingCredentials(
  settings: ModelSettings,
  tokenConfigured: boolean,
  vendorKeys: ReadonlySet<CredentialProvider>,
): MissingCredentials | null {
  const runnable = (p: Provider) =>
    isHostedProvider(p) ? vendorKeys.has(p as CredentialProvider) : tokenConfigured;
  const missing = TASKS.filter((t) => !runnable(settings[`${t}Provider`]));
  if (missing.length === 0) return null;

  const providers = [...new Set(missing.map((t) => settings[`${t}Provider`]))];
  const local = PROVIDER_LABELS[CLAUDE_CODE_PROVIDER];
  const nothingStored = !tokenConfigured && vendorKeys.size === 0;
  if (
    nothingStored &&
    missing.length === TASKS.length &&
    providers.length === 1 &&
    providers[0] === CLAUDE_CODE_PROVIDER
  ) {
    return {
      title: "No AI credential yet",
      body: `Every task runs on ${local} by default and no token has been saved, so the next sync stops before triage. Add a token below, or point the tasks at a provider you have a key for.`,
    };
  }

  const taskNames = joinNames(missing.map((t) => MODEL_ROWS[t].title));
  const providerNames = joinNames(providers.map((p) => PROVIDER_LABELS[p]));
  return {
    title: nothingStored ? "No AI credential yet" : "A task has no credential",
    body: `${taskNames} ${missing.length === 1 ? "runs" : "run"} on ${providerNames} and nothing has been saved for it, so ${missing.length === 1 ? "that task stops" : "those tasks stop"} the next time ${missing.length === 1 ? "it runs" : "they run"}. Add one below, or point ${missing.length === 1 ? "it" : "them"} at a provider you have a key for.`,
  };
}
