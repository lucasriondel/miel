import { useParams } from "react-router-dom";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { Empty } from "@/components/ui/empty";
import { apiErrorMessage } from "../api/apiErrorMessage";
import {
  isNotEditable,
  useCancelScheduledSend,
  useRescheduleSend,
  useScheduledSends,
} from "../api/scheduledSends.hooks";
import { PageHeader } from "../features/shell/PageHeader";
import { PageLayout } from "../features/shell/PageLayout";
import { InboxEmptyState } from "../features/inbox/InboxEmptyState";
import { ScheduledSendRow } from "../features/scheduled/ScheduledSendRow";
import { ScheduledSkeleton } from "../features/scheduled/ScheduledSkeleton";
import { presetTimeLabel } from "../features/time/timePresets";

/** What a refused change says: the send already on its way, or the server's reason. */
const refusal = (err: unknown) =>
  isNotEditable(err) ? "It is already being sent" : apiErrorMessage(err);

/**
 * Mail miel is holding to send later, for the account on screen (A12).
 *
 * The design draws no such page: in it, scheduling hands Gmail a time and
 * Gmail keeps the list. Gmail's API has no scheduled send, so miel holds the
 * message and sends it itself — and a send can then fail with nobody looking.
 * This is the smallest place that makes a waiting or failed send visible and
 * actionable: the display title over one hairline card of rows.
 *
 * The mutations live here rather than in each row: a cancelled row leaves the
 * list on the re-read, and a callback held by a row would leave with it.
 */
export const ScheduledPage = () => {
  const { accountId } = useParams<{ accountId: string }>();
  const { data, isLoading, error } = useScheduledSends(accountId);
  const cancel = useCancelScheduledSend();
  const reschedule = useRescheduleSend();
  const now = new Date();

  const onCancel = (id: string) =>
    cancel.mutate(id, {
      onSuccess: () => toast("Scheduled send cancelled"),
      onError: (err) => toast.error(refusal(err)),
    });

  const onReschedule = (id: string, sendAt: Date) =>
    reschedule.mutate(
      { id, sendAt },
      {
        onSuccess: () => toast(`Scheduled for ${presetTimeLabel(sendAt, new Date())}`),
        onError: (err) => toast.error(refusal(err)),
      },
    );

  const busyId = cancel.isPending
    ? cancel.variables
    : reschedule.isPending
      ? reschedule.variables?.id
      : undefined;

  return (
    <PageLayout header={<PageHeader title="Scheduled" />} bodyClassName="px-4 pt-2 pb-12 sm:px-8">
      <div className="mx-auto flex w-full max-w-[880px] flex-col gap-4">
        <p className="text-[13px] text-gousse-muted">
          Mail waiting to go, soonest first. miel sends it while the server is running; anything
          that falls due while it is down goes as soon as it is back.
        </p>
        {isLoading ? (
          <ScheduledSkeleton />
        ) : error ? (
          <Empty title="Couldn't load scheduled mail" description={apiErrorMessage(error)} />
        ) : !data || data.items.length === 0 ? (
          <InboxEmptyState
            icon={<Send aria-hidden />}
            title="Nothing scheduled"
            description="Mail you schedule from the compose window waits here until it goes."
          />
        ) : (
          <ul
            aria-label="Scheduled mail"
            className="divide-y divide-gousse-fill rounded-xl border border-gousse-line bg-gousse-panel shadow-[0_1px_2px_rgb(20_32_46/0.04)]"
          >
            {data.items.map((item) => (
              <ScheduledSendRow
                key={item.id}
                item={item}
                now={now}
                busy={busyId === item.id}
                onCancel={onCancel}
                onReschedule={onReschedule}
              />
            ))}
          </ul>
        )}
      </div>
    </PageLayout>
  );
};
