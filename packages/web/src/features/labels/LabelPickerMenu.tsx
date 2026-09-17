import { Check } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { useLabels } from "../../api/queries";
import type { Label } from "../../api/types";

interface Props {
  accountId: string;
  /**
   * Labels already on what is being labelled. They are still listed, marked and
   * unpickable — hiding one would read as this account not having it, which is
   * the wrong answer to "where is Work?" (#167).
   */
  applied?: ReadonlySet<string>;
  onPick: (label: Label) => void;
}

/**
 * The contents of a label chooser, wherever one is opened from.
 *
 * Two faces mount it — the bulk bar's picker (#147) and the message detail's
 * "Add label" (#167) — and only the trigger and where the panel hangs differ,
 * so which labels are offered and what is shown while the list is loading,
 * failed or empty is written once, the way an attachment's menu is
 * (`components/AttachmentMenuContent.tsx`).
 *
 * Only labels of the account being shown are offered — `useLabels` is
 * account-scoped — and Gmail's own mailboxes are left out: putting INBOX or SENT
 * on a message is not what "label" means.
 */
export const LabelPickerMenu = ({ accountId, applied, onPick }: Props) => {
  const { data, isLoading, error } = useLabels(accountId);

  const labels = (data ?? [])
    .filter((l) => l.type !== "system")
    .toSorted((a, b) => a.name.localeCompare(b.name));

  if (isLoading) {
    return (
      <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-gousse-muted">
        <Spinner size={12} /> Loading labels…
      </p>
    );
  }
  if (error) {
    // Distinct from "No labels yet.": a list that failed to load is not an empty
    // one, and offering nothing without saying why reads as this account having
    // no labels at all.
    return <p className="px-2.5 py-2 text-xs text-gousse-high">Couldn't load labels.</p>;
  }
  if (labels.length === 0) {
    return <p className="px-2.5 py-2 text-xs text-gousse-muted">No labels yet.</p>;
  }

  return (
    <>
      {labels.map((l) => {
        const already = applied?.has(l.id) ?? false;
        return (
          <button
            key={l.id}
            type="button"
            role="menuitem"
            disabled={already}
            onClick={() => onPick(l)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-gousse-ink transition-colors hover:bg-gousse-line/40 disabled:cursor-default disabled:text-gousse-muted disabled:hover:bg-transparent"
          >
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full border border-gousse-line"
              style={l.colorBg ? { backgroundColor: l.colorBg } : undefined}
            />
            <span className="truncate">{l.name}</span>
            {already ? (
              <span className="ml-auto flex shrink-0 items-center gap-1 text-xs font-normal">
                <Check className="h-3 w-3" aria-hidden />
                Added
              </span>
            ) : null}
          </button>
        );
      })}
    </>
  );
};
