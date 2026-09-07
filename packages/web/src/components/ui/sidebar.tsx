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
 * The hue-driven row surfaces (hover fill, glyph tint, count tint) live in
 * `sidebar-chrome.css` — a single per-row `--hue` custom property feeds rest, hover and
 * active uniformly, which Tailwind can't express cleanly. Install that sheet
 * alongside this file or rows render flat.
 *
 * The active row is marked by a stroke on its right edge — a per-row `::after`
 * in `sidebar-chrome.css`, pure CSS. Rows are full-bleed, so the stroke lands
 * against the shell's right edge without any positioning script, scrolls with
 * its row for free, and fades/grows in and out as `data-active` /
 * `aria-current` come and go. `markHue` on a row recolors the stroke alone;
 * `--mark-height` / `--mark-width` are the CSS-only knobs for its size.
 */

/* ------------------------------------------------------------------ shells */

/**
 * The collapse behaviour, shared by both shells.
 *
 * The shell draws no seam of its own: in the app frame the seam is the content
 * column's `border-l` (see `app-shell.tsx`), and a `border-r` here would stack
 * against it into a double hairline.
 *
 * Collapsing animates `width` to 0 rather than narrowing to an icon rail, so the
 * page beside it reflows into the reclaimed space. The panel stays mounted
 * throughout so the transition has something to tween, and takes `inert` while
 * collapsed so its rows leave the tab order and the a11y tree.
 */
const SHELL_BASE =
  "sidebar-shell relative flex h-full shrink-0 flex-col overflow-hidden bg-gousse-bg text-gousse-ink";

/**
 * Fixed inner width so children don't reflow while the shell's width animates.
 * No horizontal padding of its own — rows are full-bleed (the hue wash runs
 * edge to edge) and carry their inset themselves.
 */
function SidebarInner({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex h-full w-62 shrink-0 flex-col pb-4.5 pt-5.5", className)}
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
        "group/sidebar w-62 transition-[width,opacity] duration-300 ease-out motion-reduce:transition-none",
        collapsed ? "w-0 opacity-0" : "w-62 opacity-100",
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
 * reflows the layout by animating the static column's width between 15.5rem and 0.
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
          "group/sidebar fixed inset-y-0 left-0 z-[60] w-62 transition-[width,transform,opacity] duration-300 ease-out motion-reduce:transition-none sm:static sm:z-auto sm:translate-x-0",
          collapsed
            ? "-translate-x-full sm:w-0 sm:opacity-0"
            : "translate-x-0 sm:w-62 sm:opacity-100",
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
      className={cn(
        "flex items-center justify-between gap-2 pb-6.5 pl-5 pr-3.5",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The class string the brand row wears. Kept as a constant for the same reason
 * `ROW_BASE` is: a consumer rendering its own element needs the exact string.
 *
 * Hover dims rather than recolors — the mark and the text have to fade together,
 * and the mark is usually an image the row can't recolor.
 */
const TITLE_BASE =
  "flex items-center gap-2.5 text-base font-bold tracking-tight text-gousse-accent transition-opacity hover:opacity-80 active:opacity-70";

/**
 * The mark's slot. Fixed square, so the name after it sits on one line whether
 * the slot is filled or empty. The mark decides its own size; the slot only
 * reserves the space and centers it.
 */
const TITLE_MARK = "grid h-6.5 w-6.5 shrink-0 place-items-center overflow-hidden";

/** Worn only while a mark is present: the radius clips a full-bleed logo image. */
const TITLE_MARK_FILLED = "rounded-lg";

/**
 * What `render` receives. Deliberately element-agnostic — a div-typed prop bag
 * can't be spread onto an `<a>` (every handler is typed to `HTMLDivElement`),
 * so this stays to what any element accepts, as `SidebarItemRenderProps` does.
 */
export type SidebarTitleRenderProps = {
  className: string;
  children: ReactNode;
};

/**
 * Render the row as your own element — a router link to the app root, most
 * often. Receives the computed `className`; spread it onto the element you
 * return. Keeps this file free of any router dependency, as `SidebarItem` does.
 *
 * ```tsx
 * <SidebarTitle render={(p) => <Link to="/" {...p} />}>miel</SidebarTitle>
 * ```
 *
 * Absent, the row renders as a plain `<div>` — a brand row that goes nowhere is
 * not a link — and then accepts the usual div props.
 */
type SidebarTitleRender = (props: SidebarTitleRenderProps) => ReactNode;

type SidebarTitleOwnProps = {
  /** Rendered in a fixed-size square slot ahead of the name — a logo, an icon. */
  mark?: ReactNode;
  className?: string;
  children?: ReactNode;
};

/**
 * Two shapes, not one: with `render` the consumer owns the element, so the div
 * props are gone from the type — passing one is a type error rather than the
 * silent no-op it would be if it were accepted and then dropped.
 */
type SidebarTitleProps =
  | (SidebarTitleOwnProps & { render: SidebarTitleRender })
  | (SidebarTitleOwnProps & { render?: never } & Omit<
        ComponentProps<"div">,
        keyof SidebarTitleOwnProps
      >);

/**
 * The brand row — logo mark plus product name — that heads the panel. Sits in
 * `SidebarHeader` beside `SidebarClose`; the header's `justify-between` lays the
 * two out, so this needs no layout of its own.
 *
 * The mark slot keeps its width whether or not a mark is passed, so the name
 * lands on the same vertical line across apps with and without a logo.
 */
export function SidebarTitle({
  mark,
  className,
  children,
  render,
  ...props
}: SidebarTitleProps) {
  const body = (
    <>
      <span className={cn(TITLE_MARK, mark != null && TITLE_MARK_FILLED)}>
        {mark}
      </span>
      {children}
    </>
  );

  const titleClass = cn(TITLE_BASE, className);

  // The `render` branch takes no div props — the type rules them out — so
  // nothing here is dropped on the floor.
  if (render) return <>{render({ className: titleClass, children: body })}</>;

  return (
    <div className={titleClass} {...props}>
      {body}
    </div>
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
      className={cn("sidebar-scroll flex flex-1 flex-col gap-6 overflow-y-auto", className)}
      {...props}
    />
  );
}

export function SidebarGroup({ className, ...props }: ComponentProps<"nav">) {
  return <nav className={cn("flex flex-col", className)} {...props} />;
}

export function SidebarGroupLabel({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "px-5.5 pb-2.5 text-[10.5px] font-medium uppercase tracking-[0.13em] text-gousse-muted/55",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The hairline above the footer is inset to the rows' own padding rather than
 * running border-to-border — a full-width rule would read as a second panel
 * edge against the full-bleed rows.
 */
export function SidebarFooter({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "relative mt-auto flex flex-col pt-4 before:absolute before:inset-x-5.5 before:top-0 before:h-px before:bg-gousse-line/70",
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
 * (sidebar-chrome.css); this covers layout and typography.
 *
 * Exported because a consumer rendering its own row element — a router `NavLink`
 * with a function `className`, say — needs the exact same string.
 */
const ROW_BASE =
  "sidebar-row flex h-8.5 w-full shrink-0 items-center gap-3 px-5.5 text-left text-sm transition-[background-color,color]";

/**
 * The label stays ink in every state — colour identifies, weight and ink rank.
 * If the label took the hue too, a pale row (yellow, green) would read as
 * disabled next to a dark one. The active row carries no shadow and no radius:
 * the wash runs edge to edge, and the travelling mark does the announcing.
 */
export function sidebarRowClass(active: boolean, className?: string): string {
  return cn(
    ROW_BASE,
    active
      ? "font-semibold text-gousse-ink"
      : "font-normal text-gousse-muted hover:text-gousse-ink/85",
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
      className={cn("sidebar-glyph grid h-4 w-4 shrink-0 place-items-center", className)}
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
  /**
   * The active mark's color as an `r g b` triplet, when it should differ from
   * the rest of the row. Defaults to `hue` (and so to the accent), which is
   * what keeps the mark, the hover fill and the glyph tint reading as one
   * color unless you deliberately split them. Only visible while the row is
   * the active one.
   */
  markHue?: string;
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
  markHue,
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
  if (markHue) (rowStyle as Record<string, string>)["--mark-hue"] = markHue;
  // One step = the glyph slot + its gap, so a child's text sits directly under
  // its parent's text rather than drifting off on its own margin.
  if (depth > 0) rowStyle.paddingLeft = `${1.375 + depth * 1.75}rem`;

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
