import { Check, Clock, Inbox, Send, Tag } from "lucide-react";
import { useSidebarRail } from "./SidebarRailContext";
import { SidebarNavItem } from "./SidebarNavItem";

export interface SidebarMailboxNavProps {
  /** `/account/:id` with the inbox's period carried, or undefined before one is picked. */
  inboxHref: string | undefined;
  /** The same, opening the Done view. */
  doneHref: string | undefined;
  /** The same, opening the Snoozed view. */
  snoozedHref?: string | undefined;
  /**
   * `/account/:id/scheduled`, or undefined to leave the row out — which is the
   * case whenever the account has no mail waiting to go and none that failed.
   */
  scheduledHref?: string | undefined;
  /** Which of the sidebar's places is on screen. */
  current: SidebarPlace;
  /** Unread messages in the period on screen. */
  inboxCount?: number;
  /** Snoozed messages of the account, whatever the period. */
  snoozedCount?: number;
  /** Scheduled sends pending, going out or failed. */
  scheduledCount?: number;
  /** Promo codes waiting to be reviewed. */
  promoCount?: number;
}

export type SidebarPlace =
  | "inbox"
  | "done"
  | "snoozed"
  | "scheduled"
  | "promo-codes"
  | "settings"
  | "filters"
  | "logs"
  | null;

/**
 * The sidebar's views, in the design's order: Inbox, Snoozed, Done, Promo codes.
 * Snoozed is miel's own (`snoozedOnly`; Gmail's API has no snooze), Done is
 * Gmail's archive (`archivedOnly`), the place a checked-off message goes.
 *
 * Scheduled is not in the design. miel holds a scheduled send until it goes,
 * and one can fail; without a row, a failed send would be invisible. So it is
 * drawn only while there is something in it, after Done.
 */
export const SidebarMailboxNav = ({
  inboxHref,
  doneHref,
  snoozedHref,
  scheduledHref,
  current,
  inboxCount,
  snoozedCount,
  scheduledCount,
  promoCount,
}: SidebarMailboxNavProps) => {
  const rail = useSidebarRail();
  return (
    <nav
      aria-label="Views"
      className={rail ? "flex flex-col items-center gap-1" : "flex flex-col gap-0.5"}
    >
      {inboxHref ? (
        <SidebarNavItem
          to={inboxHref}
          icon={<Inbox aria-hidden />}
          label="Inbox"
          count={inboxCount}
          active={current === "inbox"}
        />
      ) : null}
      {snoozedHref ? (
        <SidebarNavItem
          to={snoozedHref}
          icon={<Clock aria-hidden />}
          label="Snoozed"
          count={snoozedCount}
          active={current === "snoozed"}
        />
      ) : null}
      {doneHref ? (
        <SidebarNavItem
          to={doneHref}
          icon={<Check aria-hidden />}
          label="Done"
          active={current === "done"}
        />
      ) : null}
      {scheduledHref ? (
        <SidebarNavItem
          to={scheduledHref}
          icon={<Send aria-hidden />}
          label="Scheduled"
          count={scheduledCount}
          active={current === "scheduled"}
        />
      ) : null}
      {/* The saved codes are global, so this way in is not account-scoped: which
          mailbox a code arrived in is trivia at a checkout. */}
      <SidebarNavItem
        to="/promo-codes"
        icon={<Tag aria-hidden />}
        label="Promo codes"
        count={promoCount}
        active={current === "promo-codes"}
      />
    </nav>
  );
};
