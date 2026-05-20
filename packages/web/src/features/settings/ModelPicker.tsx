import { useEffect, useState } from "react";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { useUpdateSettings } from "../../api/mutations";
import { ApiError } from "../../api/client";

const MODEL_OPTIONS: { value: string; label: string }[] = [
  { value: "claude-haiku-4-5", label: "Haiku 4.5 (fast, cheap)" },
  { value: "claude-sonnet-4-6", label: "Sonnet 4.6 (balanced)" },
  { value: "claude-opus-4-7", label: "Opus 4.7 (highest quality)" },
];

interface Props {
  task: "triage" | "reply";
  label: string;
  description: string;
  value: string;
  onSaved?: (next: string) => void;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const ModelPicker = ({ task, label, description, value, onSaved }: Props) => {
  const [draft, setDraft] = useState(value);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const update = useUpdateSettings();

  useEffect(() => {
    setDraft(value);
  }, [value]);

  const dirty = draft !== value;
  const hasCustomValue =
    !MODEL_OPTIONS.some((opt) => opt.value === draft) && draft.length > 0;

  return (
    <div className="rounded border border-miel-line bg-miel-panel p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-miel-ink">{label}</h3>
        <p className="text-xs text-miel-muted">{description}</p>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <select
          value={hasCustomValue ? "__custom__" : draft}
          onChange={(e) => {
            const next = e.target.value;
            if (next === "__custom__") return;
            setDraft(next);
            setSavedMessage(null);
          }}
          className="rounded border border-miel-line bg-miel-panel px-2 py-1.5 text-sm"
        >
          {MODEL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
          {hasCustomValue ? (
            <option value="__custom__">Custom: {draft}</option>
          ) : null}
        </select>
        <input
          type="text"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setSavedMessage(null);
          }}
          placeholder="model id"
          className="flex-1 rounded border border-miel-line bg-miel-panel px-2 py-1.5 text-sm font-mono"
        />
        <Button
          variant="primary"
          disabled={!dirty || update.isPending || draft.trim().length === 0}
          onClick={() => {
            const payload =
              task === "triage"
                ? { triageModel: draft.trim() }
                : { replyModel: draft.trim() };
            update.mutate(payload, {
              onSuccess: (next) => {
                const savedValue =
                  task === "triage" ? next.triageModel : next.replyModel;
                setSavedMessage("Saved");
                onSaved?.(savedValue);
              },
            });
          }}
        >
          {update.isPending ? <Spinner size={12} /> : null}
          {update.isPending ? "Saving…" : "Save"}
        </Button>
      </div>
      {update.isError ? (
        <p className="mt-2 text-xs text-miel-high">
          Failed to save: {describeError(update.error)}
        </p>
      ) : null}
      {savedMessage && !dirty ? (
        <p className="mt-2 text-xs text-miel-muted">{savedMessage}</p>
      ) : null}
    </div>
  );
};
