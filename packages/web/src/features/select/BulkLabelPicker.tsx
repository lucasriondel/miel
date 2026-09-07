import { Tag } from "lucide-react";
import { useLabels } from "../../api/queries";
import { usePopover } from "../../hooks/usePopover";
import { Spinner } from "@/components/ui/spinner";
import type { Label } from "../../api/types";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";

interface Props {
  accountId: string;
  disabled?: boolean;
  onPick: (label: Label) => void;
}

/**
 * The bulk bar's label chooser (#147): the account's own labels, one click
 * away from the selection.
 *
 * Click-to-open rather than hover-to-open, so a finger reaches it as readily as
 * a pointer, and click-outside/Escape close it — `usePopover`'s business, the
 * same as the row's "Filter similar". The panel is anchored inside the bar
 * rather than portalled: the bar is `sticky`, not clipped, so it has nothing to
 * escape from.
 *
 * Only labels of the account being shown are offered — `useLabels` is
 * account-scoped — and Gmail's own mailboxes are left out of the list: applying
 * INBOX or SENT to a selection is not what "apply a label" means.
 */
export const BulkLabelPicker = ({ accountId, disabled, onPick }: Props) => {
  const popover = usePopover<HTMLDivElement>();
  const { data, isLoading, error } = useLabels(accountId);

  const labels = (data ?? [])
    .filter((l) => l.type !== "system")
    .toSorted((a, b) => a.name.localeCompare(b.name));

  const pick = (label: Label) => {
    popover.close();
    onPick(label);
  };

  return (
    <div ref={popover.ref} className="relative">
      <button
        type="button"
        aria-label="Apply label"
        title="Apply label"
        aria-haspopup="menu"
        aria-expanded={popover.open}
        onClick={popover.toggle}
        disabled={disabled}
        className={`${iconButtonClass()} w-auto gap-1.5 px-2.5 text-sm font-medium`}
      >
        <Tag className={iconButtonIconClass()} aria-hidden />
        <span className="hidden sm:inline">Label</span>
      </button>
      {popover.open ? (
        <div
          role="menu"
          aria-label="Labels"
          className="absolute right-0 top-full z-[60] mt-1.5 flex max-h-64 w-56 max-w-[calc(100vw-2rem)] flex-col gap-0.5 overflow-y-auto rounded-xl border border-gousse-line bg-gousse-panel p-1.5 shadow-gousse-lg"
        >
          {isLoading ? (
            <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-gousse-muted">
              <Spinner size={12} /> Loading labels…
            </p>
          ) : error ? (
            // Distinct from "No labels yet.": a list that failed to load is not
            // an empty one, and offering nothing without saying why reads as
            // this account having no labels at all.
            <p className="px-2.5 py-2 text-xs text-gousse-high">Couldn't load labels.</p>
          ) : labels.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-gousse-muted">No labels yet.</p>
          ) : (
            labels.map((l) => (
              <button
                key={l.id}
                type="button"
                role="menuitem"
                onClick={() => pick(l)}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-gousse-ink transition-colors hover:bg-gousse-line/40"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full border border-gousse-line"
                  style={l.colorBg ? { backgroundColor: l.colorBg } : undefined}
                />
                <span className="truncate">{l.name}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
};
