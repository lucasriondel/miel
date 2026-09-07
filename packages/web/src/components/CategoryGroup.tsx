import type { CSSProperties } from "react";
import type { ListedMessage } from "../api/types";
import { CategoryGroupBody } from "./CategoryGroupBody";
import { CategoryHeader } from "./CategoryHeader";
import { MessageRow } from "./MessageRow";
import { PresenceRow } from "./PresenceRow";
import { getSystemLabelMeta } from "./systemLabels";
import { senderRun, type CategoryName } from "../pages/categoryGroups";
import type { Presence } from "../hooks/presence";

interface Props {
  category: CategoryName;
  accountId: string;
  messages: ListedMessage[];
  /** The rows with their enter/exit states, merged by the section above. */
  presence: Presence<ListedMessage>[];
  /** Global row offset so the appear stagger keeps flowing across groups. */
  startIndex: number;
  collapsed: boolean;
  onToggle: () => void;
  selectMode?: boolean;
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleSelect?: (accountId: string, gmailMessageId: string) => void;
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
}

/**
 * One Gmail category inside a priority section: a heading, and the run of rows
 * under it (req. 4).
 *
 * The tint is the whole reason this is one element rather than a header and a
 * list side by side — `--hue` is set here and every surface below derives from
 * it (`index.css`, "Inbox category subgroups"), so the rail runs unbroken from
 * the heading down the last row. The hue itself is `systemLabels`' `hue` field,
 * the same one the sidebar rows use; there is no second colour table.
 *
 * Collapsed hides the rows and nothing else: the heading keeps its count and
 * picks up the sender run instead, so a collapsed group still says what is in
 * it. It *hides* them rather than unmounting them — `CategoryGroupBody` keeps
 * the run mounted and animates the space it takes, so the group closes and
 * opens instead of blinking.
 */
export const CategoryGroup = ({
  category,
  accountId,
  messages,
  presence,
  startIndex,
  collapsed,
  onToggle,
  selectMode,
  isSelected,
  onToggleSelect,
  onToggleCategory,
}: Props) => {
  const meta = getSystemLabelMeta(category);
  const style = meta?.hue ? ({ "--hue": meta.hue } as CSSProperties) : undefined;

  return (
    <div
      style={style}
      className="category-group group/category border-b border-gousse-line last:border-b-0"
    >
      <CategoryHeader
        category={category}
        accountId={accountId}
        messages={messages}
        collapsed={collapsed}
        onToggle={onToggle}
        senders={senderRun(messages)}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleCategory={onToggleCategory}
      />
      <CategoryGroupBody collapsed={collapsed}>
        {presence.map(({ item: m, key, state }, idx) => (
          <PresenceRow key={key} state={state} index={startIndex + idx}>
            <MessageRow
              message={m}
              selectMode={selectMode}
              selected={isSelected?.(m.accountId, m.gmailMessageId) ?? false}
              onToggleSelect={onToggleSelect}
            />
          </PresenceRow>
        ))}
      </CategoryGroupBody>
    </div>
  );
};
