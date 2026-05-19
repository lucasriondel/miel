interface Props {
  status:
    | { kind: "idle" }
    | { kind: "ok"; fetched: number; triaged: number; errors: string[] }
    | { kind: "error"; message: string };
  onDismiss?: () => void;
}

export const SyncStatusBanner = ({ status, onDismiss }: Props) => {
  if (status.kind === "idle") return null;

  if (status.kind === "error") {
    return (
      <div className="mb-3 flex items-start justify-between rounded border border-miel-high/40 bg-miel-high/10 px-3 py-2 text-sm text-miel-high">
        <span>Sync failed: {status.message}</span>
        {onDismiss ? (
          <button
            type="button"
            onClick={onDismiss}
            className="ml-3 text-xs underline"
          >
            dismiss
          </button>
        ) : null}
      </div>
    );
  }

  const hasErrors = status.errors.length > 0;
  return (
    <div
      className={`mb-3 flex items-start justify-between rounded border px-3 py-2 text-sm ${
        hasErrors
          ? "border-miel-medium/40 bg-miel-medium/10 text-miel-medium"
          : "border-miel-low/40 bg-miel-low/10 text-miel-low"
      }`}
    >
      <div>
        <p>
          Synced — {status.fetched} fetched, {status.triaged} triaged
          {hasErrors ? `, ${status.errors.length} error(s)` : ""}.
        </p>
        {hasErrors ? (
          <ul className="mt-1 list-disc pl-5 text-xs">
            {status.errors.slice(0, 3).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="ml-3 text-xs underline"
        >
          dismiss
        </button>
      ) : null}
    </div>
  );
};
