import { Spinner } from "@/components/ui/spinner";
import type { Label } from "../../api/types";
import { LabelPickerItem } from "./LabelPickerItem";

interface Props {
  isLoading: boolean;
  failed: boolean;
  /** Whether the account has any label at all, filter or no. */
  hasLabels: boolean;
  matches: readonly Label[];
  applied?: ReadonlySet<string>;
  onPick: (label: Label) => void;
}

/**
 * What is inside the picker's `menu` element: the labels the filter left, or the
 * one line saying why there are none.
 *
 * The four answers are kept apart on purpose. A list still loading, a list that
 * failed to load and an account with no labels yet are different news (#167),
 * and a filter that matched nothing is a fourth (#169) — an account with eighty
 * labels and no "Zzz" has not run out of labels.
 */
export const LabelPickerBody = ({
  isLoading,
  failed,
  hasLabels,
  matches,
  applied,
  onPick,
}: Props) => {
  if (isLoading) {
    return (
      <p className="flex items-center gap-2 px-2.5 py-2 text-xs text-gousse-muted">
        <Spinner size={12} /> Loading labels…
      </p>
    );
  }
  if (failed) {
    return <p className="px-2.5 py-2 text-xs text-gousse-high">Couldn't load labels.</p>;
  }
  if (!hasLabels) {
    return <p className="px-2.5 py-2 text-xs text-gousse-muted">No labels yet.</p>;
  }
  if (matches.length === 0) {
    return <p className="px-2.5 py-2 text-xs text-gousse-muted">No labels match that.</p>;
  }

  return (
    <>
      {matches.map((l) => (
        <LabelPickerItem
          key={l.id}
          label={l}
          applied={applied?.has(l.id) ?? false}
          onPick={onPick}
        />
      ))}
    </>
  );
};
