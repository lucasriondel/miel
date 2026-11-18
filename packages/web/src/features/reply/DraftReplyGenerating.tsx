import { Loader2 } from "lucide-react";
import { AppButton } from "../../components/AppButton";
import { DraftReplyShell } from "./DraftReplyShell";

/** Drafting: the card's shape with placeholder lines and its actions held off. */
export const DraftReplyGenerating = () => (
  <DraftReplyShell
    header={
      <>
        <Loader2 className="animate-spin text-gousse-muted" aria-hidden />
        <output className="font-semibold text-gousse-primary">Drafting reply…</output>
        <span className="text-gousse-muted">with AI</span>
      </>
    }
  >
    <div className="flex flex-col gap-2.5 py-1.5" aria-hidden>
      <span className="h-2.5 w-full animate-pulse rounded-full bg-gousse-fill" />
      <span className="h-2.5 w-full animate-pulse rounded-full bg-gousse-fill" />
      <span className="h-2.5 w-[56%] animate-pulse rounded-full bg-gousse-fill" />
    </div>
    <div className="flex items-center gap-2">
      <AppButton tone="primary" disabled>
        Send
      </AppButton>
      <AppButton tone="secondary" disabled>
        Edit
      </AppButton>
    </div>
  </DraftReplyShell>
);
