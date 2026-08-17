import type { ComponentType, SVGProps } from "react";
import { forwardRef, useRef } from "react";
import { Archive, ExternalLink, Filter, Mail, MailOpen, Trash2, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  useArchiveMessage,
  useSetMessageRead,
  useSetMessagePriority,
  useSuggestSimilarFilter,
  useTrashMessage,
} from "../api/mutations";
import { ApiError } from "../api/client";
import { apiErrorMessage } from "../api/apiErrorMessage";
import type { Priority, SuggestedFilter } from "../api/types";
import { usePopover } from "../hooks/usePopover";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FilterSimilarPopover } from "./FilterSimilarPopover";
import { buildGmailMessageUrl } from "../features/message-detail/gmailUrl";
import { useReturnToInbox } from "../features/inbox/useReturnToInbox";

export type MessageActionsVariant = "row" | "detail";

const PRIORITIES = ["high", "medium", "low"] as const;

interface Props {
  accountId: string;
  accountEmail: string;
  gmailMessageId: string;
  isUnread: boolean;
  isArchived: boolean;
  isTrashed: boolean;
  priority: Priority | null;
  variant: MessageActionsVariant;
  /**
   * Row variant only: when the actions are already mounted inside a container
   * that controls visibility (mobile swipe reveal), skip the hover-driven
   * absolute overlay and just lay the buttons out inline.
   */
  forceVisible?: boolean;
}

function describeSuggestion(s: SuggestedFilter): string {
  const criteria = s.criteriaFrom ?? s.criteriaSubject ?? s.criteriaQuery ?? "message";
  return `${criteria} → ${s.addLabelName}`;
}

/**
 * Shared set of message-level actions used by both the row (hover-revealed)
 * and the detail view (always visible). A single source of truth keeps the
 * row and detail in lockstep — same icons, same labels, same Filter-similar
 * popover and Change-priority menu.
 *
 * Variant controls presentation and post-action navigation: `row` overlays
 * the actions on hover and stays put after trash; `detail` shows them inline
 * and returns to the inbox after archive/trash so the user isn't left on a
 * stale page.
 */
export const MessageActions = ({
  accountId,
  accountEmail,
  gmailMessageId,
  isUnread,
  isArchived,
  isTrashed,
  priority,
  variant,
  forceVisible,
}: Props) => {
  const navigate = useNavigate();
  const returnToInbox = useReturnToInbox();
  const setRead = useSetMessageRead();
  const archive = useArchiveMessage();
  const trash = useTrashMessage();
  const setPriority = useSetMessagePriority();
  const suggestFilter = useSuggestSimilarFilter();
  const filterMenu = usePopover<HTMLDivElement>();
  const filterTriggerRef = useRef<HTMLButtonElement>(null);

  const input = { accountId, gmailMessageId };
  const busy = setRead.isPending || archive.isPending || trash.isPending;
  // Detail only: the message the page is showing has just left the mailbox, so
  // staying on it would show a stale page. Returning is what keeps the inbox's
  // account, filters and scroll offset — the push to the root this replaces
  // discarded all three (#95).
  const returnToInboxOnSuccess = variant === "detail" ? { onSuccess: returnToInbox } : undefined;

  const handlePrioritySelect = (newPriority: Priority) => {
    setPriority.mutate({ ...input, priority: newPriority });
  };

  const handleFilterSubmit = (prompt: string) => {
    if (suggestFilter.isPending) return;
    suggestFilter.mutate(
      { ...input, prompt: prompt || undefined },
      {
        onSuccess: ({ suggestion, created }) => {
          filterMenu.close();
          if (!suggestion) {
            toast.info("The AI could not propose a filter for this message.");
            return;
          }
          const goToFilters = () => navigate(`/account/${accountId}/filters`);
          toast.success(created ? "Filter suggested" : "Filter already suggested", {
            description: describeSuggestion(suggestion),
            action: { label: "View on Filters", onClick: goToFilters },
          });
        },
        onError: (err) => {
          filterMenu.close();
          if (
            err instanceof ApiError &&
            (err.body as { error?: string } | undefined)?.error === "claude_not_logged_in"
          ) {
            toast.error("The AI provider is not logged in.");
            return;
          }
          toast.error(`Could not suggest a filter: ${apiErrorMessage(err)}`);
        },
      },
    );
  };

  const onToggleRead = () => {
    setRead.mutate({ ...input, read: isUnread });
  };

  const onArchive = () => {
    if (isArchived) return;
    archive.mutate(input, returnToInboxOnSuccess);
  };

  const onTrashClick = () => {
    if (isTrashed) return;
    trash.mutate(input, returnToInboxOnSuccess);
  };

  const gmailUrl = buildGmailMessageUrl({ accountEmail, gmailMessageId });

  const containerClass =
    variant !== "row"
      ? // Tighter than the row's gap: these sit inside a top-bar island, whose
        // own padding already separates them from the pill's edge.
        "flex items-center gap-0.5"
      : forceVisible
        ? "flex items-center gap-1"
        : // Desktop hover-reveal overlay. Confined to sm+ so mobile never gets a
          // phantom tap target (mobile uses the swipe-mounted wrapper instead).
          // Gradient stops are fixed pixel widths (not %) so the opaque zone
          // stays constant however many action icons are mounted — percentage
          // stops would shrink the solid area as the container grows, leaving
          // the leftmost icons on a transparent fade with text showing through.
          "pointer-events-none absolute inset-y-0 right-0 hidden items-center gap-2 bg-[linear-gradient(to_left,rgb(var(--gousse-bg))_0,rgb(var(--gousse-bg))_calc(100%-2.5rem),rgb(var(--gousse-bg)/0)_100%)] pl-12 pr-4 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 sm:flex";

  return (
    <div className={containerClass}>
      <div ref={filterMenu.ref} className="relative">
        <ActionButton
          ref={filterTriggerRef}
          Icon={Filter}
          label="Filter similar"
          onClick={filterMenu.toggle}
          variant={variant}
        />
        <FilterSimilarPopover
          open={filterMenu.open}
          anchorRef={filterTriggerRef}
          panelRef={filterMenu.panelRef}
          isPending={suggestFilter.isPending}
          onSubmit={handleFilterSubmit}
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              type="button"
              aria-label="Change priority"
              title="Change priority"
              className={buttonClass(variant)}
            >
              <Zap className={iconClass(variant)} aria-hidden />
            </button>
          }
        />
        <DropdownMenuContent align="end" className="min-w-[8rem]">
          {PRIORITIES.map((p) => (
            <DropdownMenuItem
              key={p}
              onClick={() => handlePrioritySelect(p)}
              className={cn("capitalize", priority === p && "bg-gousse-accent/20 font-bold")}
            >
              {p}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <ActionButton
        Icon={isUnread ? MailOpen : Mail}
        label={isUnread ? "Mark as read" : "Mark as unread"}
        onClick={onToggleRead}
        disabled={busy}
        loading={setRead.isPending}
        variant={variant}
      />
      <ActionButton
        Icon={Archive}
        label={isArchived ? "Archived" : "Archive"}
        onClick={onArchive}
        disabled={busy || isArchived}
        loading={archive.isPending}
        variant={variant}
      />
      <ActionButton
        Icon={Trash2}
        label={isTrashed ? "Trashed" : "Delete"}
        onClick={onTrashClick}
        disabled={busy || isTrashed}
        loading={trash.isPending}
        variant={variant}
        danger
      />
      <ActionLink href={gmailUrl} Icon={ExternalLink} label="View in Gmail" variant={variant} />
    </div>
  );
};

interface ActionButtonProps {
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  danger?: boolean;
  variant: MessageActionsVariant;
}

const ActionButton = forwardRef<HTMLButtonElement, ActionButtonProps>(
  ({ Icon, label, onClick, disabled, loading, danger, variant }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={buttonClass(variant, danger)}
    >
      {loading ? (
        <Spinner size={iconPx(variant)} />
      ) : (
        <Icon className={iconClass(variant)} aria-hidden />
      )}
    </button>
  ),
);
ActionButton.displayName = "ActionButton";

interface ActionLinkProps {
  href: string;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  variant: MessageActionsVariant;
}

const ActionLink = ({ href, Icon, label, variant }: ActionLinkProps) => (
  <a
    href={href}
    target="_blank"
    rel="noreferrer noopener"
    aria-label={label}
    title={label}
    onClick={(e) => e.stopPropagation()}
    className={buttonClass(variant)}
  >
    <Icon className={iconClass(variant)} aria-hidden />
  </a>
);

const ROW_BUTTON =
  "group/btn relative inline-flex h-8 w-8 items-center justify-center rounded-lg text-gousse-muted transition-[transform,background-color,color,box-shadow] active:scale-[0.96] hover:bg-gousse-line/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";
// `detail` renders inside a top-bar `Island` (a `rounded-full` pill with a
// 6px inset), so its buttons are pills too: §3's concentric rule wants a child
// radius of parent − padding, and the one shape exempt from that arithmetic is
// the pill itself. A `rounded-lg` icon inside the island read as a square
// rattling in a capsule.
const DETAIL_BUTTON =
  "inline-flex h-9 w-9 items-center justify-center rounded-full text-gousse-muted transition-[background-color,color,transform] duration-150 active:scale-[0.96] hover:bg-gousse-line/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent";

function buttonClass(variant: MessageActionsVariant, danger?: boolean): string {
  const base = variant === "row" ? ROW_BUTTON : DETAIL_BUTTON;
  const accent = danger
    ? "hover:text-gousse-high hover:bg-gousse-high/10"
    : "hover:text-gousse-ink";
  return `${base} ${accent}`;
}

function iconClass(variant: MessageActionsVariant): string {
  return variant === "row" ? "h-4 w-4" : "h-[18px] w-[18px]";
}

function iconPx(variant: MessageActionsVariant): number {
  return variant === "row" ? 14 : 16;
}
