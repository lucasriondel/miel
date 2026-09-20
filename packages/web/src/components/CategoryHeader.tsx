import type { CSSProperties } from "react";
import { ChevronDown } from "lucide-react";
import type { ListedMessage } from "../api/types";
import { CategorySelectButton } from "../features/select/CategorySelectButton";
import { CategorySenderRun } from "./CategorySenderRun";
import { SectionActions } from "./SectionActions";
import { getSystemLabelMeta } from "./systemLabels";
import type { CategoryName } from "../pages/categoryGroups";

interface Props {
  category: CategoryName;
  accountId: string;
  messages: ListedMessage[];
  collapsed: boolean;
  onToggle: () => void;
  /** The senders to preview while collapsed — already deduped and ordered. */
  senders: string[];
  selectMode?: boolean;
  isSelected?: (accountId: string, gmailMessageId: string) => boolean;
  onToggleCategory?: (accountId: string, gmailMessageIds: string[]) => void;
}

/**
 * The heading of one category subgroup inside a priority section (req. 4).
 *
 * The whole heading is the collapse toggle, which is why it is a `<button>`:
 * the chevron is an affordance, not the target. The actions beside it are
 * therefore *not* nested inside it — a button inside a button is invalid and
 * the browser resolves it by ignoring one of them — so they sit in a sibling
 * cell and stop the click from reaching the toggle.
 *
 * `Primary` appears here and nowhere else (req. 3): as a heading it names
 * the band, which is the one place saying it is worth the room.
 */
export const CategoryHeader = ({
  category,
  accountId,
  messages,
  collapsed,
  onToggle,
  senders,
  selectMode,
  isSelected,
  onToggleCategory,
}: Props) => {
  const meta = getSystemLabelMeta(category);
  const Icon = meta?.Icon;
  const name = meta?.label ?? category;
  // `CATEGORY_PERSONAL` has no hue of its own — it is the absence of a category
  // as much as one — so it falls back to the muted token and reads as the
  // quietest band, which is right for the group most messages land in.
  const style = meta?.hue ? ({ "--hue": meta.hue } as CSSProperties) : undefined;

  return (
    <div
      style={style}
      // `pr-4` matches a message row's own `px-4`, so this header's actions and
      // the row actions below it end on the same right edge.
      className="category-group-header group/category flex items-center gap-2 py-2 pl-3 pr-4 sm:gap-2.5"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        // Named explicitly rather than by its contents: the heading holds a
        // count and, while collapsed, a run of senders, so the text inside it
        // would announce as "Primary 3 KoRo, Vinted" and say nothing about
        // what pressing it does.
        aria-label={collapsed ? `Expand ${name}` : `Collapse ${name}`}
        title={collapsed ? `Expand ${name}` : `Collapse ${name}`}
        // No padding of its own: the header row owns the height (T1's 8px), so
        // the toggle fills it rather than adding to it.
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <ChevronDown
          aria-hidden
          className={`category-group-ink h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
        {Icon ? <Icon className="category-group-glyph h-4 w-4 shrink-0" aria-hidden /> : null}
        <span className="category-group-ink shrink-0 text-[11px] font-bold uppercase tracking-[0.07em]">
          {name}
        </span>
        <span className="category-group-ink category-group-count inline-flex h-[18px] min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-bold leading-none tabular-nums">
          {messages.length}
        </span>
        {/* Only while collapsed: an open group is already showing these senders
            in its rows, so repeating them above would be noise. */}
        {collapsed ? <CategorySenderRun senders={senders} /> : null}
      </button>
      {/* Reachable at every width and on every device — the rule #144 set, kept
          whole. These were once `hidden` below `sm` and `opacity-0` above it
          until the group was hovered, which made a pointer the one way to reach
          them: on a touch device the three buttons were in the DOM, invisible,
          and a category could never be acted on as a whole.

          The reveal is back, but only behind `pointer-fine:` — a device that
          can actually hover and aim (see the variant in `index.css`). Anything
          that fails that query, every touch device among them, never gets the
          `opacity-0` at all and keeps the buttons on screen. So this is a
          refinement for mice, not the gate it used to be: three bands of icons
          stacked down the page is a lot of chrome for a pointer that can summon
          them on approach, and no quieter for a finger that cannot.

          `focus-within` is in the reveal for the same reason touch is exempt
          from it: a keyboard tabbing into an invisible button is #144's bug in
          another modality. Opacity rather than `hidden` so the heading beside
          it does not reflow as the pointer arrives, and the cell still refuses
          to shrink, so the heading is what gives way when the row runs out of
          room. */}
      <div className="category-group-actions flex shrink-0 items-center gap-1 transition-opacity duration-150 pointer-fine:opacity-0 pointer-fine:group-hover/category:opacity-100 pointer-fine:group-focus-within/category:opacity-100">
        <CategorySelectButton
          category={name.toLowerCase()}
          accountId={accountId}
          messages={messages}
          isSelected={isSelected}
          onToggleCategory={onToggleCategory}
        />
        {!selectMode && <SectionActions messages={messages} scope={`in ${name}`} />}
      </div>
    </div>
  );
};
