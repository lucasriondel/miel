import { useState } from "react";
import {
  PROVIDER_LABELS,
  PROVIDER_MODELS,
  isHostedProvider,
  type ModelTask,
} from "@miel/core/providerModels";
import { SavedFlash } from "@/components/ui/saved-flash";
import { ProviderKeyField } from "./ProviderKeyField";
import { ProviderSelect } from "./ProviderSelect";
import { providerOptions } from "./providerOptions";
import { useUpdateSettings } from "../../api/mutations";
import { useProviderCredentials } from "../../api/providerCredential.hooks";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import type { CredentialProvider, ModelSettings, Provider } from "../../api/types";

// The catalogue's union, not a copy of it (#154). This module spelled three of
// the four tasks out, so the row could not be given the fourth — and the patch
// it builds is `${task}Provider`, a `ModelSettings` field, which is the same
// list from the other end.
export type { ModelTask };

interface Props {
  task: ModelTask;
  title: string;
  description: string;
  value: string;
  provider: Provider;
  /**
   * The settings the server answered with, so the card can restate them all.
   * Optional: a caller that reads them straight from the query cache — the
   * onboarding gate does — already has them, since the save writes them there.
   */
  onSaved?: (next: ModelSettings) => void;
}

/**
 * One row of the Tasks table: which provider runs this task, and which of that
 * provider's models it uses — the task's name in the first column, then the two
 * selects under the Provider and Model headings.
 *
 * The provider drives the model list (#105) — the ids a vendor serves are its
 * own, and the settings route refuses a pairing that crosses vendors, so a
 * free-text model id here could only produce a 400 later. Switching provider
 * sends no model at all; the service picks that vendor's default.
 *
 * The row does not ask for a key as part of choosing a provider. Credentials
 * are the Providers card below, and the select offers only what has one (see
 * `providerOptions`), so a pick is always a pick the route accepts. The one key
 * field left is the repair for the case that filter deliberately keeps: the
 * saved provider whose key went missing, which stays in the list because
 * removing it would misreport what the task runs on.
 *
 * `disabled` covers both selects rather than the provider one alone: a list
 * that grows under the cursor is worse than one that arrives a beat late, and
 * the model list is the selected provider's, so freezing the pair while the
 * roster settles is the coherent version of the same rule.
 *
 * The description is the row's tooltip rather than a second line: the table
 * reads as one line per task, and what a task spends money on is a hover away.
 */
export const ModelRow = ({ task, title, description, value, provider, onSaved }: Props) => {
  const update = useUpdateSettings();
  const [saved, setSaved] = useState(false);
  const credentials = useProviderCredentials();
  const options = providerOptions(provider, credentials.configured);
  // Since #117 the server refuses to clear the key of a vendor a task points
  // at, so this is a row saved before that or a key dropped out of band. Either
  // way it is the way back: the row says so where the choice is, not on the
  // next failed sync, and until a key is stored the server refuses even a
  // model-only edit on this task.
  const missingKey =
    isHostedProvider(provider) &&
    !credentials.pending &&
    !credentials.configured.has(provider as CredentialProvider);
  const disabled = credentials.pending || update.isPending;

  const save = (patch: Partial<ModelSettings>) => {
    setSaved(false);
    update.mutate(patch, {
      onSuccess: (next) => {
        onSaved?.(next);
        setSaved(true);
      },
    });
  };

  return (
    <div className="flex flex-col gap-2 px-4 py-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-[8rem] flex-1 items-center gap-2" title={description}>
          <span className="text-[13px] font-medium text-gousse-ink">{title}</span>
          <SavedFlash
            saving={update.isPending}
            saved={saved && !update.isError}
            error={update.isError ? apiErrorMessage(update.error) : null}
          />
        </div>
        <ProviderSelect
          ariaLabel={`${title} provider`}
          value={provider}
          options={options.map((p) => ({ id: p, label: PROVIDER_LABELS[p] }))}
          disabled={disabled}
          withMark
          onChange={(next) => save({ [`${task}Provider`]: next as Provider })}
          className="w-[150px]"
        />
        <ProviderSelect
          ariaLabel={`${title} model`}
          value={value}
          options={PROVIDER_MODELS[provider]}
          disabled={disabled}
          onChange={(next) => save({ [`${task}Model`]: next })}
          className="w-[200px]"
        />
      </div>
      {missingKey ? (
        <ProviderKeyField
          provider={provider as CredentialProvider}
          submitLabel={`Save ${PROVIDER_LABELS[provider]} key`}
        />
      ) : null}
    </div>
  );
};
