import { useState } from "react";
import { PROVIDER_LABELS, PROVIDER_MODELS, isHostedProvider } from "@miel/core/providerModels";
import { ModelRow as GousseModelRow } from "@/components/ui/model-row";
import { ProviderKeyField } from "./ProviderKeyField";
import { providerOptions } from "./providerOptions";
import { useUpdateSettings } from "../../api/mutations";
import { useProviderCredentials } from "../../api/providerCredential.hooks";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import type { CredentialProvider, ModelSettings, Provider } from "../../api/types";

export type ModelTask = "triage" | "filter" | "reply";

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
 * One model-picker row inside the Models card: which provider runs this task,
 * and which of that provider's models it uses.
 *
 * The row itself is gousse-ui's, which is controlled and autosaving: it draws
 * the two selects and the save tick and knows no catalogue, so what stays here
 * is the part that is miel's — the mutation, the roster the select is narrowed
 * to, and the repair field underneath.
 *
 * The provider drives the model list (#105) — the ids a vendor serves are its
 * own, and the settings route refuses a pairing that crosses vendors, so a
 * free-text model id here could only produce a 400 later. Switching provider
 * sends no model at all; the service picks that vendor's default.
 *
 * The row no longer asks for a key as part of choosing a provider. Credentials
 * are a section of their own above this one, and the select offers only what
 * has one (see `providerOptions`), so a pick is always a pick the route
 * accepts. The one key field left is the repair for the case that filter
 * deliberately keeps: the saved provider whose key went missing, which stays in
 * the list because removing it would misreport what the task runs on.
 *
 * `disabled` covers both selects rather than the provider one alone, which is
 * where the roster guard now lands too: a list that grows under the cursor is
 * worse than one that arrives a beat late, and the model list is the selected
 * provider's, so freezing the pair while the roster settles is the coherent
 * version of the same rule.
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
    <GousseModelRow
      title={title}
      description={description}
      provider={provider}
      providers={options.map((p) => ({ id: p, label: PROVIDER_LABELS[p] }))}
      model={value}
      models={PROVIDER_MODELS[provider]}
      onProviderChange={(next) => save({ [`${task}Provider`]: next as Provider })}
      onModelChange={(next) => save({ [`${task}Model`]: next })}
      disabled={credentials.pending}
      saving={update.isPending}
      saved={saved}
      error={update.isError ? apiErrorMessage(update.error) : null}
      alignTop={missingKey}
    >
      {missingKey ? (
        <ProviderKeyField
          provider={provider as CredentialProvider}
          submitLabel={`Save ${PROVIDER_LABELS[provider]} key`}
        />
      ) : null}
    </GousseModelRow>
  );
};
