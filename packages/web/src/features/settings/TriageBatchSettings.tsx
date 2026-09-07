import { useEffect, useState } from "react";
import { SettingRow, SettingsCard } from "@/components/ui/setting-row";
import { SavedFlash } from "@/components/ui/saved-flash";
import { useUpdateTriageBatchSettings } from "../../api/mutations";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import type { TriageBatchSettings as TriageBatchSettingsT } from "../../api/types";

interface Props {
  value: TriageBatchSettingsT;
}

/**
 * Triage-batching controls as two number rows in one card. Each field commits
 * on blur/Enter (free-text) and clamps to its min/max before saving; the whole
 * card shares one SavedFlash so the last write's result is visible.
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
    <SettingsCard>
      <SettingRow
        title="Messages per batch"
        description="How many messages go in each AI triage call (1–50)."
        control={
          <>
            <NumberField
              ariaLabel="Messages per batch"
              value={batchSize}
              min={1}
              max={50}
              disabled={update.isPending}
              onChange={setBatchSize}
              onCommit={(n) => commit({ batchSize: n, batchConcurrency })}
            />
            {flash}
          </>
        }
      />
      <SettingRow
        title="Concurrent batches"
        description="How many triage batches run at once (1–10)."
        control={
          <NumberField
            ariaLabel="Concurrent batches"
            value={batchConcurrency}
            min={1}
            max={10}
            disabled={update.isPending}
            onChange={setBatchConcurrency}
            onCommit={(n) => commit({ batchSize, batchConcurrency: n })}
          />
        }
      />
    </SettingsCard>
  );
};

interface NumberFieldProps {
  ariaLabel: string;
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (n: number) => void;
  onCommit: (n: number) => void;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const NumberField = ({
  ariaLabel,
  value,
  min,
  max,
  disabled,
  onChange,
  onCommit,
}: NumberFieldProps) => (
  <input
    type="number"
    aria-label={ariaLabel}
    min={min}
    max={max}
    disabled={disabled}
    value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    onBlur={() => onCommit(clamp(value, min, max))}
    onKeyDown={(e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onCommit(clamp(value, min, max));
      }
    }}
    className="w-20 rounded-full border border-gousse-line bg-gousse-panel px-3.5 py-1.5 text-center text-sm tabular-nums text-gousse-ink transition-[border-color,box-shadow] focus:border-gousse-accent focus:outline-none focus:ring-2 focus:ring-gousse-accent/20 disabled:opacity-60"
  />
);
