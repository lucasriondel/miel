import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSidebarRail } from "./SidebarRailContext";

interface Props {
  to: string;
  icon: ReactNode;
  label: string;
  /** A count beside the label (and a badge on the rail). Hidden at 0. */
  count?: number;
  /**
   * Whether this is the view on screen. The caller decides rather than the
   * router: Inbox and Done share a path and differ by a query parameter, which
   * a `NavLink` match cannot see.
   */
  active: boolean;
}

/**
 * One row of the sidebar's navigation (UI System › Sidebar Nav Item): a 32px
 * row with an 8px corner, a 14px glyph, the label and a trailing count. Active
 * is the brand ink at 10% with the label and count in semibold ink; at rest the
 * label is plain ink and the count muted.
 *
 * On the collapsed rail the same item is a 40×36 icon tile, and the count
 * becomes a badge on its corner — the only place an unread total survives the
 * collapse.
 */
export const SidebarNavItem = ({ to, icon, label, count, active }: Props) => {
  const rail = useSidebarRail();
  const shownCount = count && count > 0 ? count : undefined;
  return (
    <Link
      to={to}
      title={rail ? label : undefined}
      aria-label={rail ? label : undefined}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex shrink-0 items-center text-[13px] transition-colors duration-150",
        rail ? "h-9 w-10 justify-center rounded-[10px]" : "h-8 w-full gap-2.5 rounded-lg px-2.5",
        active
          ? "bg-gousse-primary/10 font-semibold text-gousse-primary"
          : "text-gousse-ink hover:bg-gousse-primary/5",
      )}
    >
      <span
        className={cn(
          "grid h-3.5 w-3.5 shrink-0 place-items-center [&_svg]:h-3.5 [&_svg]:w-3.5",
          "text-gousse-muted group-aria-[current=page]:text-gousse-primary",
        )}
      >
        {icon}
      </span>
      {rail ? (
        shownCount ? (
          <span className="absolute -top-0.5 -right-1 flex h-[13px] min-w-[18px] items-center justify-center rounded-full bg-gousse-primary px-1 text-[9px] leading-none font-bold text-gousse-on-primary ring-[1.5px] ring-gousse-fill">
            {shownCount}
          </span>
        ) : null
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {shownCount ? (
            <span className="text-xs text-gousse-muted tabular-nums group-aria-[current=page]:text-gousse-primary">
              {shownCount}
            </span>
          ) : null}
        </>
      )}
    </Link>
  );
};
