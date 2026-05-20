import { Inbox } from "lucide-react";
import type { Priority } from "../api/types";

const subtitles: Record<Priority, string> = {
  high: "Nothing urgent right now.",
  medium: "No medium-priority messages to review.",
  low: "Inbox is quiet down here.",
};

interface Props {
  priority: Priority;
}

export const PrioritySectionEmpty = ({ priority }: Props) => (
  <div className="flex flex-col items-center justify-center px-6 py-10 text-center">
    <Inbox className="h-12 w-12 text-miel-line" strokeWidth={1.5} />
    <p className="mt-3 text-sm text-miel-muted">{subtitles[priority]}</p>
  </div>
);
