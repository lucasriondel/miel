import { useState } from "react";
import {
  CLAUDE_CODE_PROVIDER,
  CREDENTIAL_PROVIDERS,
  PROVIDER_LABELS,
  type ModelTask,
} from "@miel/core/providerModels";
import { SettingsCard } from "@/components/ui/setting-row";
import { ModelRow } from "./ModelRow";
import { useProviderCredentials } from "../../api/providerCredential.hooks";
import type { ModelSettings } from "../../api/types";

interface Props {
  value: ModelSettings;
}

/**
 * Every provider name in this note is read off the catalogue rather than
 * written out. Two reasons, and they point the same way: a provider added there
 * is named here without a second edit, and #93 keeps vendor names out of the
 * source's copy — the catalogue is where they are allowed to live.
 */
const localName = PROVIDER_LABELS[CLAUDE_CODE_PROVIDER];
/** "Anthropic, Google or OpenAI". */
const vendorNames = CREDENTIAL_PROVIDERS.map((p) => PROVIDER_LABELS[p])
  .join(", ")
  .replace(/, ([^,]*)$/, " or $1");

/**
 * What each task is called on screen, and what it does in one line.
 *
 * A table keyed by the task rather than a row per picker written out below
 * (#154): the card carried three rows while the catalogue had four tasks, so
 * promo extraction was the one task nobody could point anywhere — it ran on the
 * shipped default on every sync, and an install running everything else on a
 * vendor had no credential for it. `satisfies Record<ModelTask, …>` is what
 * makes the fourth row mandatory rather than aspirational, the way the task
 * table in core does it: a fifth task stops this file compiling until it is
 * named here too.
 *
 * The copy is what a picker is worth — a title alone leaves a reader guessing
 * what "Filter" spends money on — so each row says when its task runs.
 */
export const MODEL_ROWS = {
  triage: {
    title: "Triage",
    description: "Classifies priority and suggests labels in each sync batch.",
  },
  filter: {
    title: "Filter",
    description: "Proposes Gmail filters from each synced batch.",
  },
  reply: {
    title: "Reply",
    description: "Generates a draft when you click Generate in the composer.",
  },
  "promo-extract": {
    title: "Promo codes",
    description: "Reads new promotional mail during sync and extracts its discount codes.",
  },
} satisfies Record<ModelTask, { title: string; description: string }>;

/**
 * The rows in the order they are read, which is the table's own rather than
 * `MODEL_TASKS`'s: the catalogue orders the tasks by when they were added, and
 * reshuffling a settings card a user has learned is a worse cost than the entry
 * order being stated in one place. A task added to the table lands at the end.
 */
const ROWS = Object.entries(MODEL_ROWS) as Array<[ModelTask, (typeof MODEL_ROWS)[ModelTask]]>;

/**
 * One provider/model picker per AI task, as dense rows in a single card.
 *
 * The pickers only offer providers with a stored credential, so when nothing
 * but the local one is set up every select has a single option. That is not
 * self-explanatory — it looks like the vendors are missing — so the card says
 * where they come from, once, under the rows rather than in each of them.
 */
export const ModelsCard = ({ value }: Props) => {
  // Every save answers with the whole settings object, so the card restates it
  // rather than patching one field: switching provider also moves the model.
  const [settings, setSettings] = useState(value);
  const credentials = useProviderCredentials();
  const noVendorKeys = !credentials.pending && credentials.configured.size === 0;

  return (
    <div className="flex flex-col gap-2">
      <SettingsCard>
        {ROWS.map(([task, row]) => (
          <ModelRow
            key={task}
            task={task}
            title={row.title}
            description={row.description}
            value={settings[`${task}Model`]}
            provider={settings[`${task}Provider`]}
            onSaved={setSettings}
          />
        ))}
      </SettingsCard>
      {noVendorKeys ? (
        <p className="px-1 text-xs text-gousse-muted">
          Only {localName} is set up, so it is the only provider offered. Add a vendor key under
          Connections to run a task on {vendorNames}.
        </p>
      ) : null}
    </div>
  );
};
