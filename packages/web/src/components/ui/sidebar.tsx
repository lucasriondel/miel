import type { CSSProperties, ComponentProps, ReactNode } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/gousse/utils";

/**
 * gousse's app-shell sidebar. A compound component built on gousse tokens and
 * native semantics — the shell is a plain `<aside>`, rows are `<a>`/`<button>`
 * with `aria-current`, and every color routes through the preset
 * (`bg-gousse-panel`, `border-gousse-line`, `text-gousse-ink`).
 *
 * Structure: SidebarShell (responsive shell + scrim) or Sidebar (static shell) /
 * SidebarHeader / SidebarContent (scroll region) / SidebarGroup
 * (+ SidebarGroupLabel) / SidebarItem (nav row) / SidebarGlyph (icon slot) /
 * SidebarFooter, plus SidebarTrigger for the collapsed-state open button.
 *
 * The hue-driven row surfaces (hover fill, left active bar, glyph tint) live in
 * `sidebar-chrome.css` — a single per-row `--hue` custom property feeds rest, hover and
 * active uniformly, which Tailwind can't express cleanly. Install that sheet
 * alongside this file or rows render flat.
 */

/* ------------------------------------------------------------------ shells */

/**
 * The collapse behaviour, shared by both shells.
 *
 * Collapsing animates `width` to 0 rather than narrowing to an icon rail, so the
 * page beside it reflows into the reclaimed space. The panel stays mounted
 * throughout so the transition has something to tween, and takes `inert` while
 * collapsed so its rows leave the tab order and the a11y tree.
 */
const SHELL_BASE =
  "flex h-full shrink-0 flex-col overflow-hidden border-r border-gousse-line bg-gousse-panel text-gousse-ink";

/** Fixed inner width so children don't reflow while the shell's width animates. */
function SidebarInner({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex h-full w-56 shrink-0 flex-col gap-4 px-3 py-4", className)}
      {...props}
    />
  );
}

/**
 * Static sidebar shell — no mobile overlay, no scrim. Use when the sidebar sits
 * in a layout that is always desktop-width, or when you want to own the
 * responsive behaviour yourself. For the standard app shell reach for
 * `SidebarShell`, which adds the mobile drawer.
 */
export function Sidebar({
  className,
  collapsed = false,
  children,
  ...props
}: ComponentProps<"aside"> & { collapsed?: boolean }) {
  return (
    <aside
      inert={collapsed ? true : undefined}
      data-collapsed={collapsed || undefined}
      className={cn(
        SHELL_BASE,
        "group/sidebar w-56 transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none",
        collapsed ? "w-0 border-r-0 opacity-0" : "w-56 opacity-100",
        className,
      )}
      {...props}
    >
      <SidebarInner>{children}</SidebarInner>
    </aside>
  );
}

/**
 * Responsive sidebar shell. Two axes off one `collapsed` flag: mobile slides a
 * fixed overlay in with `translate-x` over a tappable scrim, desktop (`sm+`)
 * reflows the layout by animating the static column's width between 14rem and 0.
 *
 * `onToggle` is what the scrim calls — pass the same handler the header's close
 * button and the `SidebarTrigger` use.
 */
export function SidebarShell({
  className,
  collapsed = false,
  onToggle,
  closeLabel = "Close sidebar",
  children,
  ...props
}: ComponentProps<"aside"> & {
  collapsed?: boolean;
  onToggle?: () => void;
  /** Accessible name for the mobile scrim button. */
  closeLabel?: string;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onToggle}
        aria-label={closeLabel}
        tabIndex={collapsed ? -1 : 0}
        className={cn(
          "fixed inset-0 z-[55] bg-black/50 transition-opacity duration-300 ease-out sm:hidden",
          collapsed ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      />
      <aside
        inert={collapsed ? true : undefined}
        data-collapsed={collapsed || undefined}
        className={cn(
          SHELL_BASE,
          "group/sidebar fixed inset-y-0 left-0 z-[60] w-56 transition-[width,transform,opacity] duration-300 ease-out motion-reduce:transition-none sm:static sm:z-auto sm:translate-x-0",
          collapsed
            ? "-translate-x-full sm:w-0 sm:border-r-0 sm:opacity-0"
            : "translate-x-0 sm:w-56 sm:opacity-100",
          className,
        )}
        {...props}
      >
        <SidebarInner>{children}</SidebarInner>
      </aside>
    </>
  );
}

/* ------------------------------------------------------------------ regions */

export function SidebarHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex items-center justify-between pl-1.5", className)}
      {...props}
    />
  );
}

/**
 * Scrolling middle region that holds the groups. The native scrollbar is hidden
 * (`.sidebar-scroll`): an always-on scrollbar claims real layout width, which
 * renders the scrolled rows narrower than the header and footer rows sitting
 * outside the scroller. Hiding it keeps every row exactly the same width.
 */
export function SidebarContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("sidebar-scroll flex-1 overflow-y-auto", className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: ComponentProps<"nav">) {
  return <nav className={cn("flex flex-col gap-0.5", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "px-2.5 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-gousse-muted",
        className,
      )}
      {...props}
    />
  );
}

export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "mt-auto flex flex-col gap-0.5 border-t border-gousse-line/60 pt-3",
        className,
      )}
      {...props}
    />
  );
}

/* --------------------------------------------------------------------- rows */

/**
 * The one class string every sidebar row wears, so the button flavour and the
 * link flavour can't drift apart. Hue-driven surfaces live in `.sidebar-row`
 * (sidebar-chrome.css); this covers layout, radius, typography and the press scale.
 *
 * Exported because a consumer rendering its own row element — a router `NavLink`
 * with a function `className`, say — needs the exact same string.
 */
const ROW_BASE =
  "sidebar-row flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition-[background-color,color,box-shadow,transform] active:scale-[0.97]";

export function sidebarRowClass(active: boolean, className?: string): string {
  return cn(
    ROW_BASE,
    active
      ? "font-bold text-gousse-ink shadow-gousse-sm"
      : "font-medium text-gousse-muted hover:text-gousse-ink",
    className,
  );
}

/**
 * Fixed icon slot for a sidebar row. Every row — mailbox glyph, label swatch,
 * virtual view — puts its mark in a slot of the same width so the text after it
 * lands on one vertical line. The mark itself decides its own size; the slot
 * only reserves the space and centers it.
 */
export function SidebarGlyph({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn("grid h-4 w-4 shrink-0 place-items-center", className)}
      {...props}
    />
  );
}

type SidebarItemOwnProps = {
  active?: boolean;
  /** Rendered inside a `SidebarGlyph` slot. */
  icon?: ReactNode;
  /** Trailing slot (e.g. an unread count or a collapse chevron). */
  trailing?: ReactNode;
  /** Indent level; one step aligns a child's text under its parent's text. */
  depth?: number;
  /** Row accent as an `r g b` triplet; drives the row's `--hue`. */
  hue?: string;
  /** Tint the glyph with the hue at rest (used for category mailboxes). */
  tinted?: boolean;
  /** Collapsed state of the branch this row heads; rotates a `.sidebar-chevron`. */
  branchCollapsed?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  /**
   * Render the row as your own element — a router link, most often. Receives the
   * computed `className` and the row's data attributes; spread them onto the
   * element you return. Keeps this file free of any router dependency.
   *
   * ```tsx
   * <SidebarItem render={(p) => <NavLink to="/logs" {...p} />}>Logs</SidebarItem>
   * ```
   */
  render?: (props: SidebarItemRenderProps) => ReactNode;
};

export type SidebarItemRenderProps = {
  className: string;
  children: ReactNode;
  style?: CSSProperties;
  "data-active"?: boolean;
  "data-tinted"?: "true";
  "data-collapsed"?: "true";
};

type SidebarItemProps = SidebarItemOwnProps &
  Omit<ComponentProps<"button">, keyof SidebarItemOwnProps>;

/**
 * A nav row. Renders a `<button>` by default; pass `render` to swap in a router
 * link (the CSS keys its active rules off `aria-current="page"` as well as
 * `data-active`, so a `NavLink` lights up without extra wiring).
 *
 * In a collapsed shell the whole panel is `inert`, so rows need no collapsed
 * variant of their own.
 */
export function SidebarItem({
  active = false,
  icon,
  trailing,
  depth = 0,
  hue,
  tinted,
  branchCollapsed,
  className,
  style,
  children,
  render,
  ...props
}: SidebarItemProps) {
  const rowStyle: CSSProperties = { ...style };
  if (hue) (rowStyle as Record<string, string>)["--hue"] = hue;
  // One step = the glyph slot + its gap, so a child's text sits directly under
  // its parent's text rather than drifting off on its own margin.
  if (depth > 0) rowStyle.paddingLeft = `${0.625 + depth * 1.625}rem`;

  const body = (
    <>
      {icon ? <SidebarGlyph>{icon}</SidebarGlyph> : null}
      {children}
      {trailing}
    </>
  );

  const shared = {
    className: sidebarRowClass(active, className),
    style: rowStyle,
    "data-active": active || undefined,
    "data-tinted": tinted ? ("true" as const) : undefined,
    "data-collapsed": branchCollapsed ? ("true" as const) : undefined,
  };

  if (render) return <>{render({ ...shared, children: body })}</>;

  return (
    <button type="button" {...shared} {...props}>
      {body}
    </button>
  );
}

/* ----------------------------------------------------------------- triggers */

/**
 * The open button, for when the sidebar is collapsed and lives outside it —
 * typically in a top bar. `.sidebar-toggle-in` fades it in over the sidebar's
 * own 300ms close so the two read as one motion.
 *
 * On `sm+` it is chromeless until the bar it sits in reports a scroll
 * (`group-data-[scrolled=true]/bar`), at which point it takes a panel surface so
 * it stays legible over content.
 */
export function SidebarTrigger({
  className,
  label = "Open sidebar",
  ...props
}: ComponentProps<"button"> & { label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "sidebar-toggle-in flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gousse-line bg-gousse-panel text-gousse-muted shadow-gousse-sm transition-[background-color,border-color,color,box-shadow,transform] active:scale-[0.96] hover:bg-gousse-line/30 hover:text-gousse-ink sm:border-transparent sm:bg-transparent sm:shadow-none group-data-[scrolled=true]/bar:border-gousse-line group-data-[scrolled=true]/bar:bg-gousse-panel group-data-[scrolled=true]/bar:shadow-gousse-lg",
        className,
      )}
      {...props}
    >
      <PanelLeftOpen aria-hidden className="h-4 w-4 shrink-0" />
    </button>
  );
}

/** The close button that lives inside `SidebarHeader`. */
export function SidebarClose({
  className,
  label = "Collapse sidebar",
  ...props
}: ComponentProps<"button"> & { label?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-expanded
      title={label}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-gousse-muted transition-[background-color,color,transform] active:scale-[0.96] hover:bg-gousse-line/30 hover:text-gousse-ink",
        className,
      )}
      {...props}
    >
      <PanelLeftClose aria-hidden className="h-4 w-4 shrink-0" />
    </button>
  );
}

/* -------------------------------------------------------------- collapsible */

/**
 * Animated container for a row's children. The grid-rows trick tweens height
 * without needing a fixed pixel value; `.sidebar-children` in sidebar-chrome.css owns
 * the transition.
 */
export function SidebarCollapsible({
  collapsed = false,
  className,
  children,
  ...props
}: ComponentProps<"div"> & { collapsed?: boolean }) {
  return (
    <div
      className={cn("sidebar-children", className)}
      data-collapsed={collapsed ? "true" : undefined}
      {...props}
    >
      <div className="sidebar-children-inner">{children}</div>
    </div>
  );
}
