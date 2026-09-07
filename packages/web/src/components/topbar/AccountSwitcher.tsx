import { useAccounts } from "../../api/queries";
import { usePopover } from "../../hooks/usePopover";
import { Avatar } from "@/components/ui/avatar";
import { Spinner } from "@/components/ui/spinner";
import { PopoverPanel } from "../PopoverPanel";
import { CaretIcon } from "./CaretIcon";

interface Props {
  selectedAccountId: string | undefined;
  onSelectAccount: (id: string) => void;
}

/**
 * The inbox bar's leading control: the current account, opening a picker of
 * the rest. A bare ghost-style trigger on the bar — the bar is a flat row with
 * a hairline under it, so a control that carried its own pill would be the one
 * thing on it with a border.
 */
export const AccountSwitcher = ({ selectedAccountId, onSelectAccount }: Props) => {
  const { data, isLoading } = useAccounts();
  const { open, toggle, close, ref, panelRef } = usePopover();

  if (isLoading) {
    return <Spinner size={14} />;
  }
  // No account to show means the request failed — a settled list always has one,
  // since the onboarding gate blocks the app until an account is connected.
  const selected = data?.find((a) => a.id === selectedAccountId) ?? data?.[0];
  if (!selected) return null;

  const displayName = selected.displayName ?? selected.email.split("@")[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className="-ml-1.5 flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition-[background,transform] duration-150 hover:bg-gousse-line/60 active:scale-[0.98]"
        title={selected.email}
      >
        <Avatar email={selected.email} avatarUrl={selected.avatarUrl} />
        {/* Name and address from `md` only: between `sm` and `md` the bar is one
            fixed-height row holding this, Triage and Sync, and the address is
            what pushed Sync off the edge. */}
        <span className="hidden flex-col text-left leading-tight md:flex">
          <span className="text-[13px] font-bold text-gousse-ink">{displayName}</span>
          <span className="max-w-[180px] truncate text-[11px] text-gousse-muted">
            {selected.email}
          </span>
        </span>
        <CaretIcon open={open} className="hidden h-3.5 w-3.5 text-gousse-muted md:block" />
      </button>

      <PopoverPanel open={open} anchorRef={ref} panelRef={panelRef} align="left">
        <div className="flex flex-col gap-1">
          {data?.map((account) => {
            const active = account.id === selected.id;
            const name = account.displayName ?? account.email.split("@")[0];
            return (
              <button
                key={account.id}
                type="button"
                onClick={() => {
                  onSelectAccount(account.id);
                  close();
                }}
                className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-[background,transform] duration-150 active:scale-[0.98] ${
                  active
                    ? "bg-gousse-accent/15 text-gousse-ink"
                    : "text-gousse-muted hover:bg-gousse-line/40 hover:text-gousse-ink"
                }`}
              >
                <Avatar
                  email={account.email}
                  avatarUrl={account.avatarUrl}
                  chars={2}
                  className="h-[26px] w-[26px] text-[10px]"
                />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="truncate text-[13px] font-bold text-gousse-ink">{name}</span>
                  <span className="truncate text-[11px] text-gousse-muted">{account.email}</span>
                </span>
                {active && (
                  <svg
                    className="ml-auto flex-none text-gousse-accent"
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    aria-hidden
                  >
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </PopoverPanel>
    </div>
  );
};
