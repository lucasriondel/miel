import type { ListedMessage } from "../api/types";
import { CategoryGroup } from "./CategoryGroup";
import { useCollapsedCategories } from "../hooks/useCollapsedCategories";
import { categoryOf, groupByCategory } from "../pages/categoryGroups";
import type { Presence } from "../hooks/presence";

interface Props {
  accountId: string;
  /** The section's rows, already merged for enter/exit by the section above. */
  presence: Presence<ListedMessage>[];
  /** Global row offset so the appear stagger flows across sections as one run. */
  startIndex: number;
  selectMode?: boolean;
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleSelect?: (accountId: string, gmailMessageId: string) => void;
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
}

/**
 * A section's rows, split into their category subgroups (req. 4). Both the
 * priority sections and untriaged mount this — untriaged is a category in the
 * same sense the priorities are (#146), so it groups the same way.
 *
 * The presence list arrives already merged and is *partitioned* here rather
 * than re-merged per group. That is the part to keep: `usePresence` keys a row
 * by account and message id, so a row leaving one category is the same entry
 * wherever it is drawn, and one merge over the section means a message whose
 * category changes moves between groups without either group treating it as a
 * message that appeared or vanished. A merge per group would give it an exit in
 * one and an enter in the other, animating a move that never happened.
 *
 * A leaving row is grouped by the category it had, since that is the group it
 * is animating out of.
 */
export const CategoryGroupList = ({
  accountId,
  presence,
  startIndex,
  selectMode,
  isSelected,
  onToggleSelect,
  onToggleCategory,
}: Props) => {
  const { isCollapsed, toggle } = useCollapsedCategories(accountId);

  // The order and membership of the groups come from the rows on screen — the
  // leaving ones included, so a group does not disappear from under a row that
  // is still animating out of it.
  const groups = groupByCategory(presence.map((p) => p.item));

  let offset = startIndex;
  return (
    <>
      {groups.map((group) => {
        const rows = presence.filter((p) => categoryOf(p.item) === group.category);
        const index = offset;
        offset += rows.length;
        return (
          <CategoryGroup
            key={group.category}
            category={group.category}
            accountId={accountId}
            messages={group.messages}
            presence={rows}
            startIndex={index}
            collapsed={isCollapsed(group.category)}
            onToggle={() => toggle(group.category)}
            selectMode={selectMode}
            isSelected={isSelected}
            onToggleSelect={onToggleSelect}
            onToggleCategory={onToggleCategory}
          />
        );
      })}
    </>
  );
};
