import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useLabels } from "../api/queries";
import { useCollapsedLabels } from "../hooks/useCollapsedLabels";
import { buildLabelTree } from "./buildLabelTree";
import { LabelTreeRow } from "./LabelTreeRow";
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
  // The list's "current" mark is the inbox's: on any other page (filters,
  // logs, settings) no row is current, whatever label is selected. An open
  // message is still the inbox — the list is beside it.
  const onInboxRoute =
    pathname === "/" || /^\/account\/[^/]+(\/messages\/[^/]+)?\/?$/.test(pathname);

  if (!accountId) return null;

  const tree = buildLabelTree((data ?? []).filter((l) => l.type !== "system"));

  return (
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
  );
};

const LabelSection = ({ children }: { children: ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <p className="px-2.5 pb-1.5 text-[11px] font-semibold tracking-[0.04em] text-gousse-muted uppercase">
      Labels
    </p>
    {children}
  </div>
);
