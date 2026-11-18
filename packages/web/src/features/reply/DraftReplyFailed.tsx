import { AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { AppButton } from "../../components/AppButton";
import { isProviderUnavailable } from "../compose/useComposeAi";
import { DraftReplyShell } from "./DraftReplyShell";

interface Props {
  error: unknown;
  onRetry: () => void;
  onReply: () => void;
}

/**
 * No draft. A provider that cannot run is the install's problem, not this
 * message's, so it points at Settings instead of offering a retry that would
 * fail the same way; either way the user can still write the reply themselves.
 */
export const DraftReplyFailed = ({ error, onRetry, onReply }: Props) => {
  const unavailable = isProviderUnavailable(error);
  return (
    <DraftReplyShell
      header={
        <>
          <AlertCircle
            className={unavailable ? "text-gousse-muted" : "text-gousse-error"}
            aria-hidden
          />
          <span
            role="alert"
            className={unavailable ? "text-gousse-quiet" : "text-gousse-high-text"}
          >
            {unavailable ? "Drafting is off — " : "Couldn’t draft — "}
            {apiErrorMessage(error)}
          </span>
        </>
      }
    >
      <div className="flex items-center gap-2">
        {unavailable ? (
          <Link
            to="/settings"
            className="inline-flex h-[30px] items-center rounded-lg border border-gousse-border bg-gousse-panel px-3 text-xs font-semibold text-gousse-ink hover:bg-gousse-hover"
          >
            Open Settings
          </Link>
        ) : (
          <AppButton tone="secondary" onClick={onRetry}>
            Retry
          </AppButton>
        )}
        <AppButton tone="ghost" onClick={onReply}>
          Write it myself
        </AppButton>
      </div>
    </DraftReplyShell>
  );
};
