import { useState } from "react";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { EmptyState } from "../../components/EmptyState";
import { LabelBadge } from "../../components/LabelBadge";
import { useAccounts, useLabels } from "../../api/queries";
import {
  useCreateLabel,
  useSyncAccountLabels,
} from "../../api/mutations";
import { ApiError } from "../../api/client";

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const LabelsManager = () => {
  const accounts = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(
    undefined,
  );
  const effectiveAccountId =
    selectedAccountId ?? accounts.data?.[0]?.id ?? undefined;
  const labels = useLabels(effectiveAccountId);
  const syncLabels = useSyncAccountLabels();
  const createLabel = useCreateLabel();
  const [newName, setNewName] = useState("");

  const userLabels =
    labels.data?.filter((l) => l.type !== "system") ?? [];
  const systemLabels =
    labels.data?.filter((l) => l.type === "system") ?? [];

  return (
    <div className="rounded border border-miel-line bg-white p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-miel-ink">Labels</h3>
        <p className="text-xs text-miel-muted">
          Pull the latest Gmail labels for an account, or create a new one.
        </p>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <label className="text-xs font-medium text-miel-muted">Account</label>
        <select
          value={effectiveAccountId ?? ""}
          onChange={(e) => setSelectedAccountId(e.target.value || undefined)}
          className="rounded border border-miel-line bg-white px-2 py-1.5 text-sm"
          disabled={!accounts.data || accounts.data.length === 0}
        >
          {accounts.data?.map((a) => (
            <option key={a.id} value={a.id}>
              {a.email}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          disabled={!effectiveAccountId || syncLabels.isPending}
          onClick={() => {
            if (!effectiveAccountId) return;
            syncLabels.mutate({ accountId: effectiveAccountId });
          }}
        >
          {syncLabels.isPending ? <Spinner size={12} /> : null}
          {syncLabels.isPending ? "Syncing…" : "Sync labels"}
        </Button>
      </div>
      {syncLabels.isError ? (
        <p className="mt-2 text-xs text-miel-high">
          Failed to sync labels: {describeError(syncLabels.error)}
        </p>
      ) : null}

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New label name"
          className="flex-1 rounded border border-miel-line bg-white px-2 py-1.5 text-sm"
        />
        <Button
          variant="primary"
          disabled={
            !effectiveAccountId ||
            newName.trim().length === 0 ||
            createLabel.isPending
          }
          onClick={() => {
            if (!effectiveAccountId) return;
            createLabel.mutate(
              { accountId: effectiveAccountId, name: newName.trim() },
              {
                onSuccess: () => setNewName(""),
              },
            );
          }}
        >
          {createLabel.isPending ? <Spinner size={12} /> : null}
          {createLabel.isPending ? "Creating…" : "Create label"}
        </Button>
      </div>
      {createLabel.isError ? (
        <p className="mt-2 text-xs text-miel-high">
          Failed to create label: {describeError(createLabel.error)}
        </p>
      ) : null}

      <div className="mt-4">
        {labels.isLoading ? (
          <div className="flex items-center gap-2 text-sm text-miel-muted">
            <Spinner /> Loading labels…
          </div>
        ) : labels.error ? (
          <p className="text-sm text-miel-high">
            Failed to load labels: {describeError(labels.error)}
          </p>
        ) : !effectiveAccountId ? (
          <EmptyState
            title="No account selected"
            description="Add an account first to manage its labels."
          />
        ) : userLabels.length === 0 && systemLabels.length === 0 ? (
          <EmptyState
            title="No labels yet"
            description="Click Sync labels to pull them from Gmail."
          />
        ) : (
          <div className="flex flex-col gap-3">
            <LabelGroup title="User labels" labels={userLabels} />
            <LabelGroup title="System labels" labels={systemLabels} muted />
          </div>
        )}
      </div>
    </div>
  );
};

interface GroupProps {
  title: string;
  labels: { id: string; name: string }[];
  muted?: boolean;
}

const LabelGroup = ({ title, labels, muted }: GroupProps) => {
  if (labels.length === 0) return null;
  return (
    <div>
      <h4
        className={`mb-1 text-xs font-medium ${muted ? "text-miel-muted" : "text-miel-ink"}`}
      >
        {title} ({labels.length})
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {labels.map((l) => (
          <LabelBadge key={l.id} name={l.name} />
        ))}
      </div>
    </div>
  );
};
