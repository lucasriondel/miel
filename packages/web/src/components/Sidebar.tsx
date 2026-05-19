import { NavLink } from "react-router-dom";
import { AccountPicker } from "./AccountPicker";
import { LabelList } from "./LabelList";
import { SyncButton } from "../features/sync/SyncButton";
import type { Account } from "../api/types";

interface Props {
  accounts: Account[];
  selectedAccountId: string | undefined;
  onSelectAccount: (id: string) => void;
  selectedLabelId: string | undefined;
  onSelectLabel: (id: string | undefined) => void;
  onSyncResult: (info: { fetched: number; triaged: number; errors: string[] }) => void;
  onSyncError: (message: string) => void;
}

export const Sidebar = ({
  accounts,
  selectedAccountId,
  onSelectAccount,
  selectedLabelId,
  onSelectLabel,
  onSyncResult,
  onSyncError,
}: Props) => {
  const selected = accounts.find((a) => a.id === selectedAccountId);
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-4 border-r border-miel-line bg-miel-panel p-4">
      <div>
        <NavLink
          to="/"
          className="text-base font-semibold tracking-tight text-miel-ink"
        >
          miel
        </NavLink>
        <p className="text-xs text-miel-muted">gmail triage</p>
      </div>

      <AccountPicker value={selectedAccountId} onChange={onSelectAccount} />

      <SyncButton
        accountEmail={selected?.email}
        onResult={onSyncResult}
        onError={onSyncError}
      />

      <div className="flex-1 overflow-y-auto">
        <LabelList
          accountId={selectedAccountId}
          selectedLabelId={selectedLabelId}
          onSelect={onSelectLabel}
        />
      </div>

      <nav className="border-t border-miel-line pt-3 text-sm">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `block rounded px-2 py-1 ${
              isActive
                ? "bg-miel-accent/10 text-miel-ink"
                : "text-miel-muted hover:bg-miel-line/40 hover:text-miel-ink"
            }`
          }
        >
          Settings
        </NavLink>
      </nav>
    </aside>
  );
};
