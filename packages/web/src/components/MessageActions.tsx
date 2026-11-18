import type { ComponentType, SVGProps } from "react";
import { forwardRef } from "react";
import { Archive, Check, ExternalLink, Mail, MailOpen, Trash2 } from "lucide-react";
import {
  useArchiveMessage,
  useSetMessageRead,
  useSetMessagePriority,
  useTrashMessage,
} from "../api/mutations";
import type { Priority } from "../api/types";
import { Spinner } from "@/components/ui/spinner";
import {
  iconButtonClass,
  iconButtonIconClass,
  iconButtonIconPx,
  type IconButtonSize,
} from "./iconButton";
import { PriorityPicker } from "./PriorityPicker";
import { RowAddLabelButton } from "../features/labels/RowAddLabelButton";
import { buildGmailMessageUrl } from "../features/message-detail/gmailUrl";
import { useReturnToInbox } from "../features/inbox/useReturnToInbox";

export type MessageActionsVariant = "row" | "detail";

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
   * Row variant only: the labels the message already carries, so the picker the
   * label action opens can mark them (#170).
   */
  appliedLabelIds?: readonly string[];
  /**
   * Row variant only: when the actions are already mounted inside a container
   * that controls visibility (mobile swipe reveal), skip the hover-driven
   * absolute overlay and just lay the buttons out inline.
   */
  forceVisible?: boolean;
}

/**
 * Shared set of message-level actions used by both the row (hover-revealed)
 * and the detail view (always visible). A single source of truth keeps the
 * row and detail in lockstep — same icons, same labels, same Change-priority
 * menu.
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
  appliedLabelIds,
  forceVisible,
}: Props) => {
  const returnToInbox = useReturnToInbox();
  const setRead = useSetMessageRead();
  const archive = useArchiveMessage();
  const trash = useTrashMessage();
  const setPriority = useSetMessagePriority();

  const input = { accountId, gmailMessageId };
  const busy = setRead.isPending || archive.isPending || trash.isPending;
  // Detail only: the message the page is showing has just left the mailbox, so
  // staying on it would show a stale page. Returning is what keeps the inbox's
  // account, filters and scroll offset — the push to the root this replaces
  // discarded all three (#95).
  //
  // It happens on the click rather than on the answer (#145): the row is
  // already gone from the lists optimistically, so there is nothing left to
  // wait for and waiting only holds the user on a page they have finished with.
  // A failure rolls the row back and says so from the mutation itself, since by
  // then this component is unmounted and react-query drops a `mutate` callback
  // whose component is.
  const leaveDetail = variant === "detail" ? returnToInbox : undefined;

  const handlePrioritySelect = (newPriority: Priority) => {
    setPriority.mutate({ ...input, priority: newPriority });
  };

  const onToggleRead = () => {
    setRead.mutate({ ...input, read: isUnread });
  };

  const onArchive = () => {
    if (isArchived) return;
    archive.mutate(input);
    leaveDetail?.();
  };

  const onTrashClick = () => {
    if (isTrashed) return;
    trash.mutate(input);
    leaveDetail?.();
  };

  const gmailUrl = buildGmailMessageUrl({ accountEmail, gmailMessageId });

  const containerClass =
    variant !== "row"
      ? // Tighter than the row's gap: these sit inside a top-bar island, whose
        // own padding already separates them from the pill's edge.
        "flex items-center gap-0.5"
      : forceVisible
        ? // The row's hover toolbar (Main view › Row Actions): a white strip
          // with a hairline and a soft shadow floating at the row's end, the
          // priority picker leading and a divider before the icon actions.
          "flex h-[30px] items-center gap-0.5 rounded-lg border border-gousse-line bg-gousse-panel px-[3px] shadow-[0_2px_6px_rgb(20_32_46/0.08)]"
        : // Desktop hover-reveal overlay. Confined to sm+ so mobile never gets a
          // phantom tap target (mobile uses the swipe-mounted wrapper instead).
          // Gradient stops are fixed pixel widths (not %) so the opaque zone
          // stays constant however many action icons are mounted — percentage
          // stops would shrink the solid area as the container grows, leaving
          // the leftmost icons on a transparent fade with text showing through.
          "pointer-events-none absolute inset-y-0 right-0 hidden items-center gap-1 bg-[linear-gradient(to_left,rgb(var(--gousse-bg))_0,rgb(var(--gousse-bg))_calc(100%-2.5rem),rgb(var(--gousse-bg)/0)_100%)] pl-12 pr-4 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100 sm:flex";

  return (
    <div className={containerClass}>
      <PriorityPicker priority={priority} onSelect={handlePrioritySelect} />
      {variant === "row" ? <span aria-hidden className="mx-0.5 h-4 w-px bg-gousse-line" /> : null}
      {/* Row only (#170). Filing a mail you can identify from its row is the
          common case, and it used to cost opening the message or entering select
          mode. The detail bar has no need of it: its own trigger sits in the
          header, in the badge row it adds to. It sits after the priority picker and
          ahead of the trio for the same reason the trio trails the strip — everything a surface offers on top of
          read/archive/delete goes to their left, so those three keep their
          columns from the right edge inwards. */}
      {variant === "row" ? (
        <RowAddLabelButton
          accountId={accountId}
          gmailMessageId={gmailMessageId}
          appliedLabelIds={appliedLabelIds ?? []}
        />
      ) : null}
      <ActionLink href={gmailUrl} Icon={ExternalLink} label="View in Gmail" variant={variant} />
      {/* Read / archive / delete are the three every set of message actions has
          — a row's, the detail bar's and a section header's — so they are last,
          in that order, and everything a set has on top of them sits to their
          left. That is what lets the strips line up in columns from the right
          edge inwards however many extra actions a surface offers; an action
          appended after them would break every one of those columns. */}
      <ActionButton
        Icon={isUnread ? MailOpen : Mail}
        label={isUnread ? "Mark as read" : "Mark as unread"}
        onClick={onToggleRead}
        disabled={busy}
        loading={setRead.isPending}
        variant={variant}
      />
      <ActionButton
        // In the reader the archive is the design's "done" check: archiving is
        // what moves a message to Done.
        Icon={variant === "detail" ? Check : Archive}
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

function buttonClass(variant: MessageActionsVariant, danger?: boolean): string {
  return iconButtonClass({ size: buttonSize(variant), danger });
}

function iconClass(variant: MessageActionsVariant): string {
  return iconButtonIconClass(buttonSize(variant));
}

function iconPx(variant: MessageActionsVariant): number {
  return iconButtonIconPx(buttonSize(variant));
}

// The row's actions sit in a dense hover overlay; the detail's sit in a top-bar
// island the user goes to deliberately and can afford the larger target.
function buttonSize(variant: MessageActionsVariant): IconButtonSize {
  return variant === "row" ? "sm" : "md";
}
