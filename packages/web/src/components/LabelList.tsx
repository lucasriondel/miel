import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useLabels } from "../api/queries";
import { useCollapsedLabels } from "../hooks/useCollapsedLabels";
import { buildLabelTree } from "./buildLabelTree";
import { LabelTreeRow } from "./LabelTreeRow";
import { SidebarNavBlock } from "./SidebarNavBlock";
import { Spinner } from "@/components/ui/spinner";

interface Props {
  accountId: string | undefined;
  selectedLabelId: string | undefined;
  onSelect: (labelId: string | undefined) => void;
}

export const LabelList = ({ accountId, selectedLabelId, onSelect }: Props) => {
  const { data, isLoading, error } = useLabels(accountId);
  const { isCollapsed, toggle } = useCollapsedLabels(accountId);
  const { pathname } = useLocation();
  // The list's "current" mark is the inbox's: on any other page (a message,
  // filters, logs, settings) no row is current, whatever label is selected.
  const onInboxRoute = pathname === "/" || /^\/account\/[^/]+\/?$/.test(pathname);

  if (!accountId) return null;

  const tree = buildLabelTree((data ?? []).filter((l) => l.type !== "system"));

  return (
    <div className="flex flex-col gap-4">
      <SidebarNavBlock
        accountId={accountId}
        allMessagesActive={onInboxRoute && !selectedLabelId}
        onSelectAllMessages={() => onSelect(undefined)}
      />

      <LabelSection>
        {isLoading ? (
          <div className="flex items-center gap-2 px-2.5 text-xs text-gousse-muted">
            <Spinner size={12} /> Loading labels…
          </div>
        ) : error ? (
          <p className="px-2.5 text-xs text-gousse-high">Failed to load labels.</p>
        ) : tree.length === 0 ? (
          <p className="px-2.5 text-xs text-gousse-muted">No labels yet.</p>
        ) : (
          tree.map((node) => (
            <LabelTreeRow
              key={node.name}
              node={node}
              selectedLabelId={onInboxRoute ? selectedLabelId : undefined}
              onSelect={onSelect}
              isCollapsed={isCollapsed}
              onToggleCollapse={toggle}
            />
          ))
        )}
      </LabelSection>
    </div>
  );
};

const LabelSection = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <p className="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-gousse-muted">
      Labels
    </p>
    {children}
  </div>
);
