import { useLabels } from "../api/queries";
import type { Label } from "../api/types";
import { LabelListRow } from "./LabelListRow";
import { Spinner } from "./Spinner";
import { SystemLabelRow } from "./SystemLabelRow";
import { UserLabelRow } from "./UserLabelRow";
import { isSystemLabel } from "./systemLabels";

interface Props {
  accountId: string | undefined;
  selectedLabelId: string | undefined;
  onSelect: (labelId: string | undefined) => void;
}

const HIDDEN_SYSTEM_LABELS = new Set([
  "UNREAD",
  "CHAT",
  "YELLOW_STAR",
]);

const userLabelSort = (a: Label, b: Label) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: "base" });

export const LabelList = ({ accountId, selectedLabelId, onSelect }: Props) => {
  const { data, isLoading, error } = useLabels(accountId);

  if (!accountId) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-miel-muted">
        <Spinner size={12} /> Loading labels…
      </div>
    );
  }
  if (error) {
    return <p className="text-xs text-miel-high">Failed to load labels.</p>;
  }
  if (!data || data.length === 0) {
    return <p className="text-xs text-miel-muted">No labels yet.</p>;
  }

  const userLabels = data
    .filter((l) => l.type !== "system")
    .slice()
    .sort(userLabelSort);
  const systemLabels = data
    .filter((l) => l.type === "system" && !HIDDEN_SYSTEM_LABELS.has(l.name))
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex flex-col gap-0.5">
      <LabelListRow
        active={!selectedLabelId}
        onClick={() => onSelect(undefined)}
      >
        <span className="truncate">All messages</span>
      </LabelListRow>

      {userLabels.length > 0 ? (
        <>
          <p className="mt-3 px-2 text-xs font-medium uppercase tracking-wide text-miel-muted">
            Labels
          </p>
          {userLabels.map((l) => {
            const parts = l.name.split("/");
            const leaf = parts[parts.length - 1];
            const depth = parts.length - 1;
            return (
              <UserLabelRow
                key={l.id}
                label={l}
                leafName={leaf}
                depth={depth}
                active={selectedLabelId === l.id}
                onSelect={() => onSelect(l.id)}
              />
            );
          })}
        </>
      ) : null}

      {systemLabels.length > 0 ? (
        <>
          <p className="mt-3 px-2 text-xs font-medium uppercase tracking-wide text-miel-muted">
            System
          </p>
          {systemLabels
            .filter((l) => isSystemLabel(l.name) || l.type === "system")
            .map((l) => (
              <SystemLabelRow
                key={l.id}
                label={l}
                active={selectedLabelId === l.id}
                onSelect={() => onSelect(l.id)}
              />
            ))}
        </>
      ) : null}
    </div>
  );
};
