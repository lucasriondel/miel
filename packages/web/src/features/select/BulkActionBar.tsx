import { forwardRef } from "react";
import { Archive, Mail, MailOpen, Trash2, X } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { useBatchMessageAction } from "../../api/mutations";
import type { BatchFlagAction } from "../../api/mutations";
import type { Label } from "../../api/types";
import { BulkLabelPicker } from "./BulkLabelPicker";
import { iconButtonClass, iconButtonIconClass } from "../../components/iconButton";

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

  const run = (action: BatchFlagAction) => {
    if (count === 0) return;
    batch.mutate({ accountId, gmailMessageIds: selectedIds, action }, { onSettled: onExit });
  };

  // The whole selection in one request, like the other four. The label travels
  // as a chip's worth of it — the optimistic plan draws it on the rows before
  // the server answers, so it needs the name and the colours, not just the id.
  const applyLabel = (label: Label) => {
    if (count === 0) return;
    batch.mutate(
      {
        accountId,
        gmailMessageIds: selectedIds,
        action: "label",
        label: {
          id: label.id,
          name: label.name,
          gmailLabelId: label.gmailLabelId,
          colorBg: label.colorBg,
          colorFg: label.colorFg,
        },
      },
      { onSettled: onExit },
    );
  };

  return (
    <section
      aria-label="Bulk actions"
      className="sticky top-0 z-40 flex flex-wrap items-center gap-2 rounded-xl border border-gousse-line bg-gousse-panel/95 px-3 py-2 shadow-gousse-md backdrop-blur"
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
        <BulkLabelPicker accountId={accountId} disabled={actionsDisabled} onPick={applyLabel} />
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
      // The shared icon-button skin, widened for the label it shows from `sm`
      // up: a pill eats its own horizontal padding at the ends (§3), so the
      // square `w-8` gives way to `px-2.5` rather than sitting inside it.
      className={`${iconButtonClass({ danger })} w-auto gap-1.5 px-2.5 text-sm font-medium`}
    >
      <Icon className={iconButtonIconClass()} aria-hidden />
      <span className="hidden sm:inline">{label}</span>
    </button>
  ),
);
BulkButton.displayName = "BulkButton";
