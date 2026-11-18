import { Check } from "lucide-react";
import type { Account } from "../../api/types";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { accountDisplayName } from "./accountDisplayName";

interface Props {
  account: Account;
  active: boolean;
  onSelect: () => void;
}

/** One mailbox in the switcher's menu, with a check on the one on screen. */
export const AccountMenuItem = ({ account, active, onSelect }: Props) => (
  <button
    type="button"
    role="menuitem"
    onClick={onSelect}
    className={cn(
      "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors duration-150",
      active ? "bg-gousse-primary/10" : "hover:bg-gousse-hover",
    )}
  >
    <Avatar email={account.email} avatarUrl={account.avatarUrl} className="h-6 w-6 text-[10px]" />
    <span className="flex min-w-0 flex-1 flex-col leading-tight">
      <span className="truncate text-[13px] font-semibold text-gousse-ink">
        {accountDisplayName(account)}
      </span>
      <span className="truncate text-[11px] text-gousse-muted">{account.email}</span>
    </span>
    {active ? <Check className="h-3.5 w-3.5 shrink-0 text-gousse-primary" aria-hidden /> : null}
  </button>
);
