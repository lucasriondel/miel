import { Filter, Inbox, Tag } from "lucide-react";
import { LabelListRow } from "./LabelListRow";
import { SidebarGlyph } from "@/components/ui/sidebar";
import { SidebarNavLink } from "./SidebarNavLink";

interface Props {
  accountId: string;
  allMessagesActive: boolean;
  onSelectAllMessages: () => void;
}

/**
 * The virtual views at the top of the sidebar. Gmail's own mailbox rows are
 * deliberately absent — the app triages an inbox, so a column of Gmail folders
 * is navigation to somewhere it does not go — which is why this block is fixed
 * rather than derived from the synced labels, and why it renders whatever state
 * the label query is in.
 */
export const SidebarNavBlock = ({ accountId, allMessagesActive, onSelectAllMessages }: Props) => (
  <div className="flex flex-col gap-0.5">
    <LabelListRow active={allMessagesActive} onClick={onSelectAllMessages}>
      <SidebarGlyph>
        <Inbox className="sidebar-glyph h-4 w-4" aria-hidden />
      </SidebarGlyph>
      <span className="truncate">All messages</span>
    </LabelListRow>

    <SidebarNavLink
      to={`/account/${accountId}/filters`}
      icon={<Filter className="sidebar-glyph h-4 w-4" aria-hidden />}
    >
      Filters
    </SidebarNavLink>

    {/* The saved codes are global, so this way in is not account-scoped: which
        mailbox a code arrived in is trivia at a checkout. */}
    <SidebarNavLink to="/promo-codes" icon={<Tag className="sidebar-glyph h-4 w-4" aria-hidden />}>
      Promo codes
    </SidebarNavLink>
  </div>
);
