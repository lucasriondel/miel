import { forwardRef } from "react";
import { Archive, Mail, MailOpen, Trash2, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useBatchMessageAction } from "../../api/mutations";
import type { BatchMessageAction } from "../../api/mutations";

interface Props {
  accountId: string;
  selectedIds: string[];
  totalCount: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onExit: () => void;
}

export const BulkActionBar = ({
  accountId,
  selectedIds,
  totalCount,
  allSelected,
  onSelectAll,
  onClear,
  onExit,
}: Props) => {
  const batch = useBatchMessageAction();
  const count = selectedIds.length;
  const actionsDisabled = count === 0 || batch.isPending;

  const run = (action: BatchMessageAction) => {
    if (count === 0) return;
    batch.mutate({ accountId, gmailMessageIds: selectedIds, action }, { onSettled: onExit });
  };

  return (
    <section
      aria-label="Bulk actions"
      className="sticky top-[64px] z-40 flex flex-wrap items-center gap-2 rounded-xl border border-gousse-line bg-gousse-panel/95 px-3 py-2 shadow-gousse-md backdrop-blur"
    >
      <span className="text-sm font-semibold text-gousse-ink tabular-nums">{count} selected</span>
      <button
        type="button"
        className="text-xs font-medium text-gousse-accent hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        onClick={allSelected ? onClear : onSelectAll}
        disabled={totalCount === 0}
      >
        {allSelected ? "Clear" : `Select all (${totalCount})`}
      </button>
      <div className="ml-auto flex items-center gap-1.5">
        <BulkButton
          Icon={MailOpen}
          label="Mark as read"
          onClick={() => run("read")}
          disabled={actionsDisabled}
        />
        <BulkButton
          Icon={Mail}
          label="Mark as unread"
          onClick={() => run("unread")}
          disabled={actionsDisabled}
        />
        <BulkButton
          Icon={Archive}
          label="Archive"
          onClick={() => run("archive")}
          disabled={actionsDisabled}
        />
        <BulkButton
          Icon={Trash2}
          label="Delete"
          onClick={() => run("trash")}
          disabled={actionsDisabled}
          danger
        />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <BulkButton Icon={X} label="Exit select mode" onClick={onExit} />
      </div>
    </section>
  );
};

interface BulkButtonProps {
  Icon: typeof Archive;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

const BulkButton = forwardRef<HTMLButtonElement, BulkButtonProps>(
  ({ Icon, label, onClick, disabled, danger }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-gousse-muted transition-all active:scale-[0.96] hover:bg-gousse-line/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${
        danger ? "hover:text-gousse-high hover:bg-gousse-high/10" : "hover:text-gousse-ink"
      }`}
    >
      <Icon className="h-4 w-4" aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  ),
);
BulkButton.displayName = "BulkButton";
