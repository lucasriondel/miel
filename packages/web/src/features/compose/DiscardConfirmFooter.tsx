import { AppButton } from "../../components/AppButton";

interface Props {
  /** A Gmail draft exists, so discarding removes it from Gmail drafts too. */
  hasDraft: boolean;
  onKeep: () => void;
  onDiscard: () => void;
}

/**
 * Discard, confirmed in place: the footer turns into the question rather than a
 * dialog opening over the window. Asked only when there is something to lose.
 */
export const DiscardConfirmFooter = ({ hasDraft, onKeep, onDiscard }: Props) => (
  <div
    role="alertdialog"
    aria-label="Discard this message?"
    className="flex shrink-0 flex-wrap items-center gap-2 border-t border-gousse-fill bg-gousse-medium-bg py-3 pr-3 pl-4"
  >
    <p className="min-w-0 flex-1 text-[13px] font-medium text-gousse-ink">
      {hasDraft ? "Discard this draft? It leaves Gmail drafts too." : "Discard this message?"}
    </p>
    {/* oxlint-disable-next-line jsx-a11y/no-autofocus -- the question was just asked; the safe answer takes the focus */}
    <AppButton tone="secondary" size="lg" onClick={onKeep} autoFocus>
      Keep editing
    </AppButton>
    <AppButton tone="danger" size="lg" onClick={onDiscard}>
      Discard
    </AppButton>
  </div>
);
