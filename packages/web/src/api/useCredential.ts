import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isHostedProvider } from "@miel/core/providerModels";
import {
  claudeCodeTokenQueryOptions,
  deleteClaudeCodeTokenMutationOptions,
  setClaudeCodeTokenMutationOptions,
} from "./claudeCodeToken.hooks";
import {
  deleteProviderCredentialMutationOptions,
  providerCredentialStatusQueryOptions,
  setProviderCredentialMutationOptions,
} from "./providerCredential.hooks";
import { apiErrorMessage } from "./apiErrorMessage";
import type { CredentialProvider, Provider } from "./types";

/**
 * One provider's credential, whatever kind of credential it is.
 *
 * The same shape for all four, which is the point: nothing outside this module
 * has to know that a vendor key and the local provider's token are written
 * through different endpoints, so nothing outside it asks "is this provider
 * hosted?" to find out which pair of hooks to reach for.
 */
export interface Credential {
  provider: Provider;
  configured: boolean;
  /** The masked hint the server sent (`sk-ant-…3f9`), shown once stored. */
  hint: string | null;
  /** The status read is in flight and has never settled. */
  loading: boolean;
  saving: boolean;
  clearing: boolean;
  /** The last failure as a sentence — a save, a clear or the status read. */
  error: string | null;
  /**
   * The secret being typed. Held here rather than by the field, so it is
   * emptied the moment the server has the value and kept when the value is
   * refused: a secret sits in the DOM for as short a time as possible, and a
   * rejected one is still the user's to correct.
   */
  draft: string;
  setDraft: (value: string) => void;
  /** Store the draft. A blank draft or a save in flight is a no-op. */
  save: () => void;
  clear: () => void;
}

interface Options {
  /** Called once the credential is stored — a model row saves its switch on it. */
  onSaved?: () => void;
}

/**
 * Everything one credential does, in one hook (#135).
 *
 * A credential's fetch, display, edit, save and removal used to span eleven
 * files, with two tile wrappers spelling out the same error ladder word for
 * word and each of them free to get it slightly different — which is how a
 * refused vendor key came to be dropped on the floor while the token beside it
 * reported its failure (#116). There is one ladder here now, and one `error`
 * for a caller to render: the last write's failure, or failing that the read's.
 *
 * The branch it hides is which endpoint the credential lives behind. Three
 * vendors keep an API key at `/settings/provider-credentials/<vendor>`; the
 * local provider keeps a token at `/settings/claude-code-token`, which is not a
 * vendor key and is neither named nor written like one. Both queries are
 * declared on every call and the one that does not apply is disabled rather
 * than fetched and ignored — `/settings/provider-credentials/claude-code` is a
 * 400, and hooks cannot be called conditionally anyway.
 */
export function useCredential(provider: Provider, options: Options = {}): Credential {
  const qc = useQueryClient();
  const hosted = isHostedProvider(provider);
  // Safe past the `hosted` branch below, and inert before it: the query is
  // disabled for the local provider and neither mutation is ever called for it.
  const vendor = provider as CredentialProvider;

  const keyStatus = useQuery(providerCredentialStatusQueryOptions(provider));
  const tokenStatus = useQuery({ ...claudeCodeTokenQueryOptions(), enabled: !hosted });
  const saveKey = useMutation(setProviderCredentialMutationOptions(qc, vendor));
  const saveToken = useMutation(setClaudeCodeTokenMutationOptions(qc));
  const clearKey = useMutation(deleteProviderCredentialMutationOptions(qc, vendor));
  const clearToken = useMutation(deleteClaudeCodeTokenMutationOptions(qc));

  const status = hosted ? keyStatus : tokenStatus;
  const save = hosted ? saveKey : saveToken;
  const clear = hosted ? clearKey : clearToken;

  const [draft, setDraft] = useState("");

  const stored = () => {
    setDraft("");
    options.onSaved?.();
  };

  const submit = () => {
    const secret = draft.trim();
    if (secret.length === 0 || save.isPending) return;
    if (hosted) saveKey.mutate({ apiKey: secret }, { onSuccess: stored });
    else saveToken.mutate({ token: secret }, { onSuccess: stored });
  };

  return {
    provider,
    configured: status.data?.configured === true,
    hint: status.data?.hint ?? null,
    loading: status.isLoading,
    saving: save.isPending,
    clearing: clear.isPending,
    // A write the user just made outranks the read behind it: the ladder ends
    // on the status query, which is the failure they did not ask for.
    error: save.isError
      ? apiErrorMessage(save.error)
      : clear.isError
        ? apiErrorMessage(clear.error)
        : status.error
          ? apiErrorMessage(status.error)
          : null,
    draft,
    setDraft,
    save: submit,
    clear: () => {
      if (clear.isPending) return;
      if (hosted) clearKey.mutate();
      else clearToken.mutate();
    },
  };
}
