import type { ListedMessage } from "../api/types";
import { CategoryGroup } from "./CategoryGroup";
import { PresenceGroup } from "./PresenceGroup";
import { isCategoryCollapsedIn, useCollapsedCategories } from "../hooks/useCollapsedCategories";
import { groupPresenceByCategory } from "../pages/categoryGroups";
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
 * is animating out of — and by the account it belongs to, so an account switch
 * is the old account's groups leaving and the new one's arriving rather than
 * one group per category holding both mailboxes (`groupPresenceByCategory`).
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
  const groups = groupPresenceByCategory(presence);

  // Only rows that are arriving or staying advance the stagger: a leaving row
  // plays no enter, and counting the outgoing account's rows would hold the
  // incoming ones back by however many there were.
  let offset = startIndex;
  return (
    <>
      {groups.map((group) => {
        const index = offset;
        offset += group.rows.filter((p) => p.state === "present").length;
        const current = group.accountId === accountId;
        return (
          <PresenceGroup key={group.key} state={group.state}>
            <CategoryGroup
              category={group.category}
              accountId={group.accountId}
              messages={group.messages}
              presence={group.rows}
              startIndex={index}
              // A group from the account being left keeps that account's
              // preference for the length of its exit instead of snapping to
              // the next account's.
              collapsed={
                current
                  ? isCollapsed(group.category)
                  : isCategoryCollapsedIn(group.accountId, group.category)
              }
              onToggle={() => toggle(group.category)}
              selectMode={selectMode}
              isSelected={isSelected}
              onToggleSelect={onToggleSelect}
              onToggleCategory={onToggleCategory}
            />
          </PresenceGroup>
        );
      })}
    </>
  );
};
