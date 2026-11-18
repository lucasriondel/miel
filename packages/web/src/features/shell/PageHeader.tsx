import type { ReactNode } from "react";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebarToggle } from "./sidebarToggle";

interface Props {
  /** The page's name, drawn as the 28px display title. */
  title: ReactNode;
  /** Beside the title: the inbox's period pill. */
  leading?: ReactNode;
  /** Centred in the row: the inbox's search field. */
  center?: ReactNode;
  /** Right-aligned: the period switch and Sync, a page's own actions. */
  trailing?: ReactNode;
  /** Under the title row: Settings' tabs. */
  below?: ReactNode;
  /** A hairline under the header — the tabbed pages draw one, the inbox does not. */
  bordered?: boolean;
  className?: string;
}

/**
 * A page's header, as every frame of the redesign draws it: the page title in
 * the display style at the top-left of the content column, with that page's
 * controls on the same row.
 *
 * It replaces the shared top bar. A header belongs to the page it names, so it
 * is rendered by the page, above the page's own scroll body (`PageLayout`) —
 * nothing is portalled anywhere and nothing sits above the content but this.
 *
 * Three slots on one row: `leading` hugs the title, `center` takes the middle
 * and `trailing` the right edge. The middle is its own flex cell rather than an
 * absolutely-centred box, so a narrow window squeezes the search field instead
 * of laying it over the title.
 */
export const PageHeader = ({
  title,
  leading,
  center,
  trailing,
  below,
  bordered,
  className,
}: Props) => {
  const openSidebar = useSidebarToggle();
  return (
    <header
      className={cn(
        // A container, so a page can drop controls by the width its own column
        // has (the inbox's header is much narrower beside an open reader) rather
        // than by the viewport's.
        "@container flex shrink-0 flex-col gap-[18px] px-5 pt-5 sm:px-8 sm:pt-[22px]",
        bordered ? "border-b border-gousse-line" : "pb-4",
        className,
      )}
    >
      <div className="flex min-h-[34px] items-center gap-3">
        <div className="flex min-w-0 shrink-0 items-center gap-3 @5xl:flex-1">
          {openSidebar ? (
            <button
              type="button"
              onClick={openSidebar}
              aria-label="Open sidebar"
              className="-ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-md text-gousse-muted hover:bg-gousse-fill hover:text-gousse-ink sm:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden />
            </button>
          ) : null}
          <h1 className="shrink-0 text-[28px] leading-[34px] font-bold tracking-[-0.01em] whitespace-nowrap text-gousse-ink">
            {title}
          </h1>
          {leading}
        </div>
        {center ? (
          <div className="flex min-w-[120px] flex-1 justify-center @5xl:flex-none">{center}</div>
        ) : null}
        {trailing ? (
          <div className="ml-auto flex shrink-0 items-center gap-2 @5xl:flex-1 @5xl:justify-end">
            {trailing}
          </div>
        ) : null}
      </div>
      {below}
    </header>
  );
};
