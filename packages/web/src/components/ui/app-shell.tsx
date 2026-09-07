import { useCallback, useEffect, useState } from "react";
import type { ComponentProps } from "react";
import { cn } from "@/lib/gousse/utils";
import { SidebarTrigger } from "@/components/ui/sidebar";

/**
 * The app frame that wraps a {@link SidebarShell}: the two-tone surface split,
 * the top bar, and the scrolling content region.
 *
 * Structure: AppShell (the flex row) / AppMain (the content column, which owns
 * the panel surface) / TopBar (+ TopBarStart, TopBarTitle, TopBarEnd) /
 * AppContent (the scroll region).
 *
 * The colour contract is the whole point of the split. The sidebar sits on
 * `bg-gousse-bg` — the page's recessed ground — and the content column sits on
 * `bg-gousse-panel`, one step lighter (in dark mode, one step *less* black), so
 * the working surface reads as raised out of the chrome around it. A single
 * `border-l` hairline on the content column is the only seam — the sidebar
 * deliberately draws none, since a `border-r` there would stack into a double
 * hairline and would vanish anyway when the sidebar collapses to zero width.
 *
 * Nothing here owns the collapsed state. `AppShell` is layout only; the flag
 * lives in the consumer and is passed to both `SidebarShell` and `TopBar`,
 * which is what lets one piece of state drive the sidebar's width animation and
 * the trigger's appearance together.
 */

/**
 * The horizontal inset shared by {@link TopBar} and {@link AppContent}. One
 * string so the bar's title and the content beneath it land on the same left
 * edge — they are separate elements with separate padding, and nothing else
 * would keep them aligned.
 */
const SHELL_INSET = "px-5 sm:px-6";

/* -------------------------------------------------------------------- shell */

/**
 * The outer frame — a full-height flex row holding the sidebar and
 * {@link AppMain}. `h-screen` by default so the sidebar and content each get
 * their own scroll region rather than the document scrolling as one; pass
 * `className="h-full"` when the shell is nested inside something that already
 * bounds its height.
 */
export function AppShell({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex h-screen w-full overflow-hidden bg-gousse-bg text-gousse-ink", className)}
      {...props}
    />
  );
}

/**
 * The content column beside the sidebar. Owns the panel surface and the seam
 * hairline (see the note on the two-tone split above), and is a `min-w-0` flex
 * column so a wide table inside {@link AppContent} scrolls itself instead of
 * pushing the sidebar off-screen.
 */
export function AppMain({ className, ...props }: ComponentProps<"main">) {
  return (
    <main
      className={cn(
        "flex min-w-0 flex-1 flex-col border-l border-gousse-line/60 bg-gousse-panel",
        className,
      )}
      {...props}
    />
  );
}

/* ------------------------------------------------------------------ top bar */

/**
 * Tracks whether a scroll container has moved off its top, for the bar's
 * `data-scrolled` flag. Without a ref the answer is a flat `false`, which is
 * correct for a bar over a page that doesn't scroll.
 */
function useScrolled(node: HTMLElement | null): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!node) {
      setScrolled(false);
      return;
    }
    // Sync on bind too: a restored scroll position (browser back, a story
    // remount) starts non-zero, and a bar that only listened for the event
    // would render flat over already-scrolled content.
    const sync = () => setScrolled(node.scrollTop > 0);
    sync();
    node.addEventListener("scroll", sync, { passive: true });
    return () => node.removeEventListener("scroll", sync);
  }, [node]);

  return scrolled;
}

/**
 * The bar across the top of the content column.
 *
 * Composed through children, not slot props — compose it the way you would a
 * shadcn part:
 *
 * ```tsx
 * <TopBar collapsed={collapsed} onToggle={toggle} scrollNode={contentNode}>
 *   <TopBarStart>
 *     <Button variant="ghost"><ArrowLeft /></Button>
 *   </TopBarStart>
 *   <TopBarTitle>Transactions</TopBarTitle>
 *   <TopBarEnd>
 *     <Button>New</Button>
 *   </TopBarEnd>
 * </TopBar>
 * ```
 *
 * The three parts are siblings — the title is not nested inside the leading
 * cluster. Every one of them is optional, and the bar does no placing of its
 * own: each part carries the flex rules that put it where it belongs, so any
 * subset composes.
 *
 * The collapsed sidebar's open button is the one child the bar contributes
 * itself, rendered ahead of yours whenever `collapsed` is true, because a
 * trigger that lives outside the sidebar has to be somebody's child and the bar
 * is where it belongs. Pass `onToggle` (the same handler the sidebar's own close
 * button uses) to wire it; omit `collapsed` entirely and the bar is a plain
 * layout row.
 *
 * `group/bar` + `data-scrolled` are the contract {@link SidebarTrigger} already
 * reads to take a panel surface once content scrolls under it. The bar sets
 * that flag itself from `scrollNode` — pass {@link useAppShell}'s `contentNode`
 * — so the trigger's scrolled treatment needs no wiring. Without a node the
 * flag stays `false`, which is correct for a bar over a non-scrolling page.
 */
export function TopBar({
  className,
  collapsed = false,
  onToggle,
  triggerLabel,
  scrollNode,
  children,
  ...props
}: ComponentProps<"header"> & {
  /** Whether the sidebar is collapsed. Mounts the open button when true. */
  collapsed?: boolean;
  /** Expands the sidebar. Pass the same handler as the sidebar's close button. */
  onToggle?: () => void;
  /** Accessible name for the mounted open button. */
  triggerLabel?: string;
  /** The scroll region whose position drives `data-scrolled` — pass `contentNode` from `useAppShell`. */
  scrollNode?: HTMLElement | null;
}) {
  const scrolled = useScrolled(scrollNode ?? null);

  return (
    <header
      data-scrolled={scrolled ? "true" : "false"}
      className={cn(
        // `relative` is the containing block a centred TopBarTitle positions against.
        "group/bar relative flex h-14 shrink-0 items-center gap-2 border-b border-gousse-line/70 transition-colors",
        SHELL_INSET,
        className,
      )}
      {...props}
    >
      {collapsed ? <SidebarTrigger onClick={onToggle} label={triggerLabel} /> : null}
      {children}
    </header>
  );
}

/**
 * Leading cluster in a {@link TopBar} — a back button, a breadcrumb, a filter.
 * Sits before {@link TopBarTitle}; `shrink-0` so its controls keep their size
 * and a long title is the thing that gives way.
 */
export function TopBarStart({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex shrink-0 items-center gap-2", className)} {...props} />;
}

/**
 * The bar's title. Sits between {@link TopBarStart} and {@link TopBarEnd} as
 * their sibling, not inside either — the three are the bar's own children.
 *
 * `truncate` because a breadcrumb or a document name is the one thing in the
 * bar with unbounded length, and it has to give way to the controls on either
 * side rather than push them out. `flex-1` claims the space between the two
 * clusters, which is also what pushes {@link TopBarEnd} to the right edge on a
 * bar that has a title.
 *
 * `centered` centres the title against the **bar**, not against the gap between
 * the clusters. Those differ whenever the two sides have unequal widths (a back
 * button on the left, three actions on the right), and centring in the flex row
 * would drift with them. So centred mode takes the title out of flow —
 * absolutely positioned and translated off its own midpoint — and the clusters
 * lay out underneath it as if it weren't there. Two consequences worth knowing:
 * the title no longer reserves width, so `max-w` keeps a long one from sliding
 * under the controls, and `pointer-events-none` keeps the invisible full-width
 * box from swallowing clicks meant for the bar beneath it.
 */
export function TopBarTitle({
  className,
  centered = false,
  ...props
}: ComponentProps<"h1"> & {
  /** Centre the title against the bar rather than letting it sit in the flow. */
  centered?: boolean;
}) {
  return (
    <h1
      className={cn(
        "truncate text-sm font-semibold tracking-tight text-gousse-ink",
        centered
          ? "pointer-events-none absolute left-1/2 max-w-[50%] -translate-x-1/2"
          : "min-w-0 flex-1",
        className,
      )}
      {...props}
    />
  );
}

/**
 * Trailing cluster in a {@link TopBar}. `shrink-0` so the actions keep their
 * size and a long title truncates instead.
 *
 * The `ml-auto` matters only when nothing else claims the middle — a bar with
 * no title, or one whose title is `centered` and therefore out of flow. With an
 * in-flow title its `flex-1` has already eaten the gap, and `ml-auto` is a
 * harmless no-op. Either way the cluster lands on the right edge without the
 * bar needing to know it is there.
 */
export function TopBarEnd({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("ml-auto flex shrink-0 items-center gap-2", className)} {...props} />;
}

/* ------------------------------------------------------------------ content */

/**
 * The scrolling content region under the bar. `min-h-0` is what makes the
 * column scroll here instead of at the document: a flex child's default
 * `min-height: auto` refuses to shrink below its content, so without it the
 * region grows past the shell and takes the bar with it.
 *
 * Takes a `ref` (React 19 passes it straight through as a prop) so
 * {@link TopBar} can watch its scroll position — pass the `contentRef` from
 * {@link useAppShell}, and that hook's `contentNode` to the bar.
 */
export function AppContent({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("min-h-0 flex-1 overflow-y-auto py-6", SHELL_INSET, className)}
      {...props}
    />
  );
}

/* -------------------------------------------------------------------- state */

/**
 * The collapsed flag plus the content ref, which is the wiring every shell
 * repeats: one boolean shared by the sidebar and the bar, and a ref/node pair
 * linking the bar to the scroll region — `contentRef` onto {@link AppContent},
 * `contentNode` into {@link TopBar}.
 *
 * Optional — the pieces are all controlled, so a consumer with its own state
 * (a route param, a persisted preference) can skip this and pass props
 * directly.
 */
export function useAppShell(initialCollapsed = false) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggle = useCallback(() => setCollapsed((value) => !value), []);

  /**
   * A *callback* ref, not a ref object, and the distinction matters. `TopBar`
   * renders before the content region below it, so a ref object is still empty
   * on the bar's first pass and nothing would re-render the bar once it filled
   * — the bar would watch nothing, forever. React calls a callback ref at
   * attach and detach, so routing the node through state re-renders the bar at
   * exactly the moment there is something to watch.
   */
  const [contentNode, setContentNode] = useState<HTMLElement | null>(null);
  const contentRef = useCallback((node: HTMLDivElement | null) => setContentNode(node), []);

  return { collapsed, setCollapsed, toggle, contentRef, contentNode };
}
