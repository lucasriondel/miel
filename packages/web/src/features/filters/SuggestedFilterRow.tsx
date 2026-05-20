import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { SuggestedFilter } from "../../api/types";
import { apiFetch, ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";

interface Props {
  suggestion: SuggestedFilter;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const SuggestedFilterRow = ({ suggestion }: Props) => {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<null | "accept" | "dismiss">(null);
  const [error, setError] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["filters"] });
  };

  const onAccept = async () => {
    setPending("accept");
    setError(null);
    try {
      await apiFetch({
        path: `/filters/suggestions/${suggestion.id}/accept`,
        method: "POST",
      });
      await invalidate();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(null);
    }
  };

  const onDismiss = async () => {
    setPending("dismiss");
    setError(null);
    try {
      await apiFetch({
        path: `/filters/suggestions/${suggestion.id}/dismiss`,
        method: "POST",
      });
      await invalidate();
    } catch (err) {
      setError(describeError(err));
    } finally {
      setPending(null);
    }
  };

  const criteria: { label: string; value: string }[] = [];
  if (suggestion.criteriaFrom)
    criteria.push({ label: "from", value: suggestion.criteriaFrom });
  if (suggestion.criteriaSubject)
    criteria.push({ label: "subject", value: suggestion.criteriaSubject });
  if (suggestion.criteriaQuery)
    criteria.push({ label: "query", value: suggestion.criteriaQuery });

  return (
    <div className="rounded-md border border-miel-accent/40 bg-miel-accent/5 px-3 py-2.5">
      <div className="grid grid-cols-[1fr_auto_1fr_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-miel-muted">
            When
          </div>
          <div className="flex flex-wrap gap-1.5">
            {criteria.length === 0 ? (
              <span className="text-xs text-miel-muted">(no criteria)</span>
            ) : (
              criteria.map((c) => (
                <span
                  key={`${c.label}:${c.value}`}
                  className="inline-flex items-center gap-1 rounded-md border border-miel-line bg-miel-bg px-2 py-0.5 text-xs"
                >
                  <span className="font-mono uppercase tracking-wide text-miel-muted">
                    {c.label}
                  </span>
                  <span className="text-miel-ink">{c.value}</span>
                </span>
              ))
            )}
          </div>
        </div>
        <div className="flex h-full items-center px-1 text-miel-muted">
          <span aria-hidden>→</span>
        </div>
        <div className="min-w-0">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-miel-muted">
            Do
          </div>
          <span className="inline-flex items-center rounded-md border border-miel-accent/30 bg-miel-accent/10 px-2 py-0.5 text-xs text-miel-ink">
            {suggestion.addLabelName}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="primary"
            onClick={onAccept}
            disabled={pending !== null}
          >
            {pending === "accept" ? <Spinner /> : null}
            Create
          </Button>
          <Button
            variant="ghost"
            onClick={onDismiss}
            disabled={pending !== null}
          >
            {pending === "dismiss" ? <Spinner /> : null}
            Dismiss
          </Button>
        </div>
      </div>
      {suggestion.reasoning ? (
        <p className="mt-2 text-xs text-miel-muted">{suggestion.reasoning}</p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-miel-high">{error}</p>
      ) : null}
    </div>
  );
};
