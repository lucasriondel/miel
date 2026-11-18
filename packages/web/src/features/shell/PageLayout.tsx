import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useScrollRegionRef } from "./scrollRegion";

interface Props {
  /** The page's `PageHeader`, fixed above the scroll body. */
  header?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Classes for the scrolling body: the page's own padding lives here. */
  bodyClassName?: string;
}

/**
 * A page: its header, then a body that is the page's one scrolling element.
 *
 * The body registers itself with the layout (`scrollRegion.ts`) so returning to
 * a page restores where it was left. A page must not introduce a second
 * `overflow-y-auto` inside it, and something sticky inside it sticks at `top-0`.
 */
export const PageLayout = ({ header, children, className, bodyClassName }: Props) => {
  const registerScroll = useScrollRegionRef();
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", className)}>
      {header}
      <div ref={registerScroll} className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>
        {children}
      </div>
    </div>
  );
};
