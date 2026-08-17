import { Filter, Inbox } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useLabels } from "../api/queries";
import { useCollapsedLabels } from "../hooks/useCollapsedLabels";
import { buildLabelTree } from "./buildLabelTree";
import { LabelListRow } from "./LabelListRow";
import { LabelTreeRow } from "./LabelTreeRow";
import { SidebarGlyph } from "@/components/ui/sidebar";
import { SidebarNavLink } from "./SidebarNavLink";
import { Spinner } from "@/components/ui/spinner";
import { Separator } from "@/components/ui/separator";
import { SystemLabelRow } from "./SystemLabelRow";
import { isSystemLabel, mailboxOrderIndex } from "./systemLabels";

interface Props {
  accountId: string | undefined;
  selectedLabelId: string | undefined;
  onSelect: (labelId: string | undefined) => void;
}

const HIDDEN_SYSTEM_LABELS = new Set(["UNREAD", "CHAT", "YELLOW_STAR"]);

export const LabelList = ({ accountId, selectedLabelId, onSelect }: Props) => {
  const { data, isLoading, error } = useLabels(accountId);
  const { isCollapsed, toggle } = useCollapsedLabels(accountId);
  const { pathname } = useLocation();
  const onInboxRoute = !pathname.endsWith("/filters") && !pathname.includes("/messages/");

  if (!accountId) return null;
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 px-2.5 text-xs text-gousse-muted">
        <Spinner size={12} /> Loading labels…
      </div>
    );
  }
  if (error) {
    return <p className="px-2.5 text-xs text-gousse-high">Failed to load labels.</p>;
  }
  if (!data || data.length === 0) {
    return <p className="px-2.5 text-xs text-gousse-muted">No labels yet.</p>;
  }

  const userLabels = data.filter((l) => l.type !== "system");
  const tree = buildLabelTree(userLabels);

  const mailboxes = data
    .filter((l) => l.type === "system" && !HIDDEN_SYSTEM_LABELS.has(l.name))
    .filter((l) => isSystemLabel(l.name))
    .toSorted(
      (a, b) =>
        mailboxOrderIndex(a.name) - mailboxOrderIndex(b.name) || a.name.localeCompare(b.name),
    );

  return (
    <div className="flex flex-col gap-4">
      {/* Nav block: virtual views, a divider, then the Gmail mailboxes —
          all one flat level. */}
      <div className="flex flex-col gap-0.5">
        <LabelListRow active={onInboxRoute && !selectedLabelId} onClick={() => onSelect(undefined)}>
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

        {mailboxes.length > 0 ? (
          <>
            <Separator className="my-2 mx-2.5 w-auto bg-gousse-line/60" />
            {mailboxes.map((l) => (
              <SystemLabelRow
                key={l.id}
                label={l}
                active={onInboxRoute && selectedLabelId === l.id}
                onSelect={() => onSelect(l.id)}
              />
            ))}
          </>
        ) : null}
      </div>

      {tree.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <p className="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-gousse-muted">
            Labels
          </p>
          {tree.map((node) => (
            <LabelTreeRow
              key={node.name}
              node={node}
              selectedLabelId={onInboxRoute ? selectedLabelId : undefined}
              onSelect={onSelect}
              isCollapsed={isCollapsed}
              onToggleCollapse={toggle}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
};
