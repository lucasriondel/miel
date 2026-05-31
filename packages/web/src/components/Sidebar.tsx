import { useEffect, useState } from "react";
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

const STORAGE_KEY = "miel.sidebar.collapsed";

const useCollapsed = () => {
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(STORAGE_KEY) === "1",
  );
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);
  return [collapsed, setCollapsed] as const;
};

const CollapseToggle = ({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    aria-expanded={!collapsed}
    title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-miel-muted hover:bg-miel-line/40 hover:text-miel-ink"
  >
    <span aria-hidden className="text-sm leading-none">
      {collapsed ? "»" : "«"}
    </span>
  </button>
);

export const Sidebar = ({
  selectedAccountId,
  onSelectAccount,
  selectedLabelId,
  onSelectLabel,
}: Props) => {
  const [collapsed, setCollapsed] = useCollapsed();

  if (collapsed) {
    return (
      <aside className="flex h-full w-14 shrink-0 flex-col items-center gap-4 border-r border-miel-line bg-miel-panel p-2">
        <NavLink to="/" className="mt-1" title="miel">
          <img src="/miel.webp" alt="miel" className="h-6 w-6 shrink-0" />
        </NavLink>
        <CollapseToggle collapsed onToggle={() => setCollapsed(false)} />
        <div className="flex-1" />
        <ThemeToggle />
      </aside>
    );
  }

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
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <CollapseToggle collapsed={false} onToggle={() => setCollapsed(true)} />
        </div>
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
