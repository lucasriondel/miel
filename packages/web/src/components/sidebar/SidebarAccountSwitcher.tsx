import { ChevronsUpDown, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useAccounts } from "../../api/queries";
import { usePopover } from "../../hooks/usePopover";
import { Avatar } from "@/components/ui/avatar";
import { PopoverPanel } from "../PopoverPanel";
import { cn } from "@/lib/utils";
import { AccountMenuItem } from "./AccountMenuItem";
import { useSidebarRail } from "./SidebarRailContext";
import { accountDisplayName } from "./accountDisplayName";

interface Props {
  selectedAccountId: string | undefined;
  onSelectAccount: (id: string) => void;
}

/**
 * The mailbox on screen, at the top of the sidebar (UI System › Account
 * Switcher): a white card with the avatar, the account's name and address, and
 * a chevron pair that opens the list of the others. On the rail it is the
 * avatar alone.
 *
 * The design names mailboxes by nickname ("Lucas — Pro"); miel stores no
 * nickname, so the name is the Google display name, or the address's local
 * part when Google gave none.
 */
export const SidebarAccountSwitcher = ({ selectedAccountId, onSelectAccount }: Props) => {
  const rail = useSidebarRail();
  const { data } = useAccounts();
  const { open, toggle, close, ref, panelRef } = usePopover();

  const selected = data?.find((a) => a.id === selectedAccountId) ?? data?.[0];
  if (!selected) return null;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={rail ? `Mailbox: ${selected.email}` : undefined}
        title={selected.email}
        className={cn(
          "flex shrink-0 items-center text-left transition-[background-color,border-color] duration-150",
          rail
            ? "h-9 w-9 justify-center rounded-full"
            : "h-[47px] w-full gap-2.5 rounded-[10px] border border-gousse-line bg-gousse-panel pr-2.5 pl-2 hover:border-gousse-border-strong",
        )}
      >
        <Avatar
          email={selected.email}
          avatarUrl={selected.avatarUrl}
          className={rail ? "h-9 w-9" : "h-7 w-7"}
        />
        {rail ? null : (
          <>
            <span className="flex min-w-0 flex-1 flex-col gap-px leading-tight">
              <span className="truncate text-[13px] font-semibold text-gousse-ink">
                {accountDisplayName(selected)}
              </span>
              <span className="truncate text-[11px] text-gousse-muted">{selected.email}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-gousse-muted" aria-hidden />
          </>
        )}
      </button>

      <PopoverPanel open={open} anchorRef={ref} panelRef={panelRef} align="left">
        <div className="flex w-[220px] flex-col gap-0.5" role="menu">
          {data?.map((account) => (
            <AccountMenuItem
              key={account.id}
              account={account}
              active={account.id === selected.id}
              onSelect={() => {
                onSelectAccount(account.id);
                close();
              }}
            />
          ))}
          <div className="my-1 h-px bg-gousse-line" />
          <Link
            to="/settings?tab=mailboxes"
            onClick={close}
            role="menuitem"
            className="flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-gousse-muted transition-colors hover:bg-gousse-hover hover:text-gousse-ink"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add account…
          </Link>
        </div>
      </PopoverPanel>
    </div>
  );
};
