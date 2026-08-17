import type { ComponentProps } from "react";
import { Menu } from "@base-ui-components/react/menu";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/gousse/utils";

/**
 * shadcn-flavoured wrappers over Base UI's `Menu` primitives, restyled with
 * gousse's design tokens so the dropdown matches the app's other popovers
 * (`bg-gousse-panel`, `border-gousse-line`, rounded-2xl, shadow-gousse-xl).
 *
 * Follows the shadcn Base UI dropdown-menu registry structure: Root / Trigger /
 * Content (Portal → Positioner → Popup) / Item / Sub (SubmenuRoot) /
 * SubTrigger / SubContent / Separator / Label / Group. Item and SubTrigger
 * close the menu on click by default (Base UI `closeOnClick`).
 */

export const DropdownMenu = Menu.Root;
export const DropdownMenuTrigger = Menu.Trigger;
export const DropdownMenuGroup = Menu.Group;
export const DropdownMenuSub = Menu.SubmenuRoot;

/** Enter/exit animation keyed off Base UI's data-open/closed + starting/ending. */
const POPUP_ANIM =
  "origin-[var(--transform-origin)] transition-[opacity,transform] duration-200 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] " +
  "data-[starting-style]:scale-95 data-[starting-style]:opacity-0 " +
  "data-[ending-style]:scale-95 data-[ending-style]:opacity-0 " +
  "motion-reduce:transition-none motion-reduce:data-[starting-style]:scale-100";

const POPUP_SURFACE =
  "z-[70] min-w-[10rem] max-w-[min(15rem,calc(100vw-2rem))] rounded-2xl border border-gousse-line bg-gousse-panel p-2 shadow-gousse-xl outline-hidden";

const ITEM_BASE =
  "flex w-full cursor-default select-none items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm font-medium text-gousse-ink outline-hidden transition-[background,transform] duration-150 active:scale-[0.98] " +
  "data-[highlighted]:bg-gousse-line/40 hover:bg-gousse-line/40 data-[disabled]:pointer-events-none data-[disabled]:cursor-progress data-[disabled]:opacity-60";

export function DropdownMenuContent({
  className,
  sideOffset = 6,
  align = "start",
  side = "bottom",
  ...props
}: ComponentProps<typeof Menu.Popup> & {
  sideOffset?: number;
  align?: ComponentProps<typeof Menu.Positioner>["align"];
  side?: ComponentProps<typeof Menu.Positioner>["side"];
}) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        sideOffset={sideOffset}
        align={align}
        side={side}
        className="z-[70]"
      >
        <Menu.Popup
          className={cn(POPUP_SURFACE, POPUP_ANIM, className)}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: ComponentProps<typeof Menu.Item>) {
  return <Menu.Item className={cn(ITEM_BASE, className)} {...props} />;
}

export function DropdownMenuSubTrigger({
  className,
  children,
  ...props
}: ComponentProps<typeof Menu.SubmenuTrigger>) {
  return (
    <Menu.SubmenuTrigger
      className={cn(
        ITEM_BASE,
        "data-[popup-open]:bg-gousse-line/40 [&>svg]:shrink-0 [&>img]:shrink-0",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRight
        className="ml-auto h-3.5 w-3.5 shrink-0 text-gousse-muted"
        aria-hidden
      />
    </Menu.SubmenuTrigger>
  );
}

export function DropdownMenuSubContent({
  className,
  sideOffset = 4,
  ...props
}: ComponentProps<typeof Menu.Popup> & { sideOffset?: number }) {
  return (
    <Menu.Portal>
      <Menu.Positioner
        side="inline-end"
        align="start"
        sideOffset={sideOffset}
        className="z-[70]"
      >
        <Menu.Popup
          className={cn(POPUP_SURFACE, POPUP_ANIM, className)}
          {...props}
        />
      </Menu.Positioner>
    </Menu.Portal>
  );
}

export function DropdownMenuSeparator({
  className,
  ...props
}: ComponentProps<typeof Menu.Separator>) {
  return (
    <Menu.Separator
      className={cn("-mx-1 my-1 h-px bg-gousse-line", className)}
      {...props}
    />
  );
}

/**
 * Decorative header row. Kept as a plain `div` rather than `Menu.GroupLabel`
 * so it can sit at the top of the popup without an enclosing `Menu.Group`
 * (Base UI throws if a GroupLabel has no MenuGroupRootContext).
 */
export function DropdownMenuLabel({
  className,
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wider text-gousse-muted",
        className,
      )}
      {...props}
    />
  );
}
