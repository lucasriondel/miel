import { useLabels } from "../api/queries";
import { Spinner } from "./Spinner";

interface Props {
  accountId: string | undefined;
  selectedLabelId: string | undefined;
  onSelect: (labelId: string | undefined) => void;
}

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

  const userLabels = data.filter((l) => l.type !== "system");
  const systemLabels = data.filter((l) => l.type === "system");

  const Row = ({ id, name }: { id: string | undefined; name: string }) => {
    const active = selectedLabelId === id || (id === undefined && !selectedLabelId);
    return (
      <button
        type="button"
        onClick={() => onSelect(id)}
        className={`block w-full truncate rounded px-2 py-1 text-left text-sm ${
          active
            ? "bg-miel-accent/10 text-miel-ink"
            : "text-miel-muted hover:bg-miel-line/40 hover:text-miel-ink"
        }`}
      >
        {name}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-0.5">
      <Row id={undefined} name="All messages" />
      {userLabels.length > 0 ? (
        <>
          <p className="mt-3 px-2 text-xs font-medium uppercase tracking-wide text-miel-muted">
            Labels
          </p>
          {userLabels.map((l) => (
            <Row key={l.id} id={l.id} name={l.name} />
          ))}
        </>
      ) : null}
      {systemLabels.length > 0 ? (
        <>
          <p className="mt-3 px-2 text-xs font-medium uppercase tracking-wide text-miel-muted">
            System
          </p>
          {systemLabels.map((l) => (
            <Row key={l.id} id={l.id} name={l.name} />
          ))}
        </>
      ) : null}
    </div>
  );
};
