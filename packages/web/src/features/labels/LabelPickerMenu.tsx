import { useState } from "react";
import { useLabels } from "../../api/queries";
import type { Label } from "../../api/types";
import { LabelFilterField } from "./LabelFilterField";
import { LabelPickerBody } from "./LabelPickerBody";
import { offeredLabels } from "./offeredLabels";

interface Props {
  accountId: string;
  /** Labels already on what is being labelled — see {@link LabelPickerItem}. */
  applied?: ReadonlySet<string>;
  onPick: (label: Label) => void;
}

/**
 * The contents of an open label panel: the filter field, and what it narrows.
 *
 * Which labels are offered is `offeredLabels`' business, which of four things is
 * shown is `LabelPickerBody`'s, and where the panel hangs is `LabelPicker`'s —
 * so this is the composition, and only the account it reads is a caller's.
 *
 * The query is state here rather than in the picker because this component is
 * unmounted with the panel, so the next open starts from the whole list without
 * anything having to remember to clear it.
 *
 * The field sits outside the `menu` element rather than in it: a text box is not
 * a menu item, and only the results scroll, so what narrows them cannot scroll
 * away from the list it is narrowing.
 */
export const LabelPickerMenu = ({ accountId, applied, onPick }: Props) => {
  const { data, isLoading, error } = useLabels(accountId);
  const [query, setQuery] = useState("");

  const all = offeredLabels(data ?? [], "");
  const matches = offeredLabels(all, query);

  return (
    <>
      {/* Nothing to narrow while the list is loading, failed or empty — a field
          over a one-line notice is furniture. */}
      {!isLoading && !error && all.length > 0 ? (
        <LabelFilterField value={query} onChange={setQuery} />
      ) : null}
      <div
        role="menu"
        aria-label="Labels"
        className="flex max-h-56 flex-col gap-0.5 overflow-y-auto"
      >
        <LabelPickerBody
          isLoading={isLoading}
          failed={Boolean(error)}
          hasLabels={all.length > 0}
          matches={matches}
          applied={applied}
          onPick={onPick}
        />
      </div>
    </>
  );
};
