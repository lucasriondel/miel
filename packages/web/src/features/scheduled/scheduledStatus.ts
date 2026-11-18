import type { ScheduledSendStatus } from "../../api/types";

/** What a row says about where its send is. Only the listed three reach the page. */
export const SCHEDULED_STATUS_LABEL: Record<ScheduledSendStatus, string> = {
  pending: "Scheduled",
  sending: "Sending…",
  sent: "Sent",
  failed: "Failed",
  cancelled: "Cancelled",
};
