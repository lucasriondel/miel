import { CLAUDE_CODE_PROVIDER, PROVIDER_LABELS } from "@miel/core/providerModels";
import type { Provider } from "../../api/types";

export interface CredentialCopy {
  /** What this credential is called, under the provider's name on the tile. */
  kind: string;
  /** The word the buttons use: "Save key", "Clear token". */
  noun: string;
  /** Names the field for assistive tech — "Anthropic API key". */
  fieldLabel: string;
  /** What one looks like, so the field is recognisable before anything is typed. */
  placeholder: string;
  /** Where to get one, since the tile has a single line to say it in. */
  source: string;
}

/**
 * How each provider's credential is spelled out to the user.
 *
 * A table rather than a branch on "is this provider hosted?", which is what the
 * two tile wrappers this replaces were mostly made of (#135). The differences
 * between a vendor key and the local provider's token are a handful of strings,
 * and a handful of strings is a row in a record; the behaviour behind them is
 * identical, and `useCredential` proves it by being the same hook for all four.
 *
 * The local provider's source names `claude setup-token` rather than an
 * environment variable, because there is no longer a variable to name (#109) —
 * pointing at one would send an operator looking for something nothing reads.
 */
export const CREDENTIAL_COPY: Record<Provider, CredentialCopy> = {
  [CLAUDE_CODE_PROVIDER]: {
    kind: "Token",
    noun: "token",
    fieldLabel: `${PROVIDER_LABELS[CLAUDE_CODE_PROVIDER]} token`,
    placeholder: "sk-ant-oat…",
    source: "Run `claude setup-token`",
  },
  anthropic: {
    kind: "API key",
    noun: "key",
    fieldLabel: `${PROVIDER_LABELS.anthropic} API key`,
    placeholder: "sk-ant-…",
    source: "console.anthropic.com",
  },
  google: {
    kind: "API key",
    noun: "key",
    fieldLabel: `${PROVIDER_LABELS.google} API key`,
    placeholder: "AIza…",
    source: "aistudio.google.com",
  },
  openai: {
    kind: "API key",
    noun: "key",
    fieldLabel: `${PROVIDER_LABELS.openai} API key`,
    placeholder: "sk-…",
    source: "platform.openai.com",
  },
};
