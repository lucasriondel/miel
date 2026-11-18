import { useEffect, useState } from "react";
import { SavedFlash } from "@/components/ui/saved-flash";
import { BatchNumberField } from "./BatchNumberField";
import { SettingsPanel } from "./SettingsPanel";
import { useUpdateTriageBatchSettings } from "../../api/mutations";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import type { TriageBatchSettings as TriageBatchSettingsT } from "../../api/types";

interface Props {
  value: TriageBatchSettingsT;
}

/**
 * Triage-batching controls: two labelled number fields side by side in one card,
 * each showing its range inside the field. Each commits on blur/Enter
 * (free-text) and clamps to its min/max before saving; the card shares one
 * SavedFlash on its heading so the last write's result is visible.
 */
export const TriageBatchSettings = ({ value }: Props) => {
  const update = useUpdateTriageBatchSettings();
  const [batchSize, setBatchSize] = useState(value.batchSize);
  const [batchConcurrency, setBatchConcurrency] = useState(value.batchConcurrency);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setBatchSize(value.batchSize);
    setBatchConcurrency(value.batchConcurrency);
  }, [value.batchSize, value.batchConcurrency]);

  const commit = (next: { batchSize: number; batchConcurrency: number }) => {
    if (next.batchSize === value.batchSize && next.batchConcurrency === value.batchConcurrency) {
      return;
    }
    setSaved(false);
    update.mutate(next, { onSuccess: () => setSaved(true) });
  };

  const flash = (
    <SavedFlash
      saving={update.isPending}
      saved={saved && !update.isError}
      error={update.isError ? apiErrorMessage(update.error) : null}
    />
  );

  return (
    <SettingsPanel title="Triage batching" action={flash} divided={false}>
      <div className="grid gap-4 px-4 pt-0.5 pb-4 sm:grid-cols-2">
        <BatchNumberField
          label="Messages per batch"
          hint="How many messages go in each AI triage call."
          value={batchSize}
          min={1}
          max={50}
          disabled={update.isPending}
          onChange={setBatchSize}
          onCommit={(n) => commit({ batchSize: n, batchConcurrency })}
        />
        <BatchNumberField
          label="Batches at once"
          hint="How many triage batches run at the same time."
          value={batchConcurrency}
          min={1}
          max={10}
          disabled={update.isPending}
          onChange={setBatchConcurrency}
          onCommit={(n) => commit({ batchSize, batchConcurrency: n })}
        />
      </div>
    </SettingsPanel>
  );
};
