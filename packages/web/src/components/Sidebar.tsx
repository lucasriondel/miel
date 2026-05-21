import { NavLink } from "react-router-dom";
import { AccountPicker } from "./AccountPicker";
import { LabelList } from "./LabelList";
import { ThemeToggle } from "../features/theme/ThemeToggle";

interface Props {
  selectedAccountId: string | undefined;
  onSelectAccount: (id: string) => void;
  selectedLabelId: string | undefined;
  onSelectLabel: (id: string | undefined) => void;
}

export const Sidebar = ({
  selectedAccountId,
  onSelectAccount,
  selectedLabelId,
  onSelectLabel,
}: Props) => {
  return (
    <aside className="flex h-full w-64 shrink-0 flex-col gap-4 border-r border-miel-line bg-miel-panel p-4">
      <div className="flex items-center justify-between">
        <NavLink
          to="/"
          className="flex items-center gap-2 text-base font-semibold tracking-tight text-miel-ink"
        >
          <img src="/miel.webp" alt="" className="h-6 w-6 shrink-0" />
          miel
        </NavLink>
        <ThemeToggle />
      </div>

      <AccountPicker value={selectedAccountId} onChange={onSelectAccount} />

      <div className="flex-1 overflow-y-auto">
        <LabelList
          accountId={selectedAccountId}
          selectedLabelId={selectedLabelId}
          onSelect={onSelectLabel}
        />
      </div>

      <nav className="flex flex-col gap-1 border-t border-miel-line pt-3 text-sm">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `block rounded px-2 py-1 ${isActive
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
