import { ChevronRight } from "lucide-react";
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
  // The colours come from the group around this header (`categoryStyle`):
  // `CATEGORY_PERSONAL` has no hue of its own — it is the absence of a category
  // as much as one — so it reads as the quietest band, an ink tint with a
  // muted glyph, which is right for the group most messages land in.
  return (
    // `px-4` matches a message row's own, so this header's actions and the row
    // actions below it end on the same right edge. Collapsed, the band is 4px
    // taller: it then carries the run of senders as its summary line.
    <div
      className={`category-group-header group/category flex items-center gap-2 px-4 ${
        collapsed ? "h-9" : "h-8"
      }`}
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
        // No padding of its own: the header row owns the height, so the toggle
        // fills it rather than adding to it.
        className="flex h-full min-w-0 flex-1 items-center gap-2 text-left"
      >
        {Icon ? <Icon className="category-group-glyph h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
        <span className="category-group-ink shrink-0 text-xs font-semibold">{name}</span>
        <span className="category-group-count shrink-0 text-xs font-medium tabular-nums">
          {messages.length}
        </span>
        {/* Only while collapsed: an open group is already showing these senders
            in its rows, so repeating them above would be noise. */}
        {collapsed ? <CategorySenderRun senders={senders} /> : <span className="flex-1" />}
        <ChevronRight
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-gousse-muted transition-[transform,opacity] duration-200 ${
            collapsed
              ? ""
              : "rotate-90 pointer-fine:opacity-0 pointer-fine:group-hover/category:opacity-100"
          }`}
        />
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
