import { Check, Inbox, Tag } from "lucide-react";
import { useSidebarRail } from "./SidebarRailContext";
import { SidebarNavItem } from "./SidebarNavItem";

export interface SidebarMailboxNavProps {
  /** `/account/:id` with the inbox's period carried, or undefined before one is picked. */
  inboxHref: string | undefined;
  /** The same, opening the Done view. */
  doneHref: string | undefined;
  /** Which of the sidebar's places is on screen. */
  current: SidebarPlace;
  /** Unread messages in the period on screen. */
  inboxCount?: number;
  /** Promo codes waiting to be reviewed. */
  promoCount?: number;
}

export type SidebarPlace =
  | "inbox"
  | "done"
  | "promo-codes"
  | "settings"
  | "filters"
  | "logs"
  | null;

/**
 * The sidebar's views. Snoozed is drawn in the design and absent here: Gmail's
 * API has no snooze and miel keeps no snooze state, so a row for it would lead
 * nowhere. Done is Gmail's archive (`archivedOnly`), the place a checked-off
 * message goes.
 */
export const SidebarMailboxNav = ({
  inboxHref,
  doneHref,
  current,
  inboxCount,
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
      {doneHref ? (
        <SidebarNavItem
          to={doneHref}
          icon={<Check aria-hidden />}
          label="Done"
          active={current === "done"}
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
