import type { ViewMode } from "../features/sync/useDateRange";

interface Props {
  viewMode: ViewMode;
}

const COPY: Record<ViewMode, { title: string; description: string }> = {
  week: {
    title: "All caught up this week",
    description: "Nothing left to triage for the selected week.",
  },
  month: {
    title: "All caught up this month",
    description: "Nothing left to triage for the selected month.",
  },
  all: {
    title: "All caught up",
    description: "Nothing left to triage.",
  },
};

export const AllCaughtUp = ({ viewMode }: Props) => {
  const { title, description } = COPY[viewMode];
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 px-8 py-20 text-center">
      <CheckMark />
      <p className="text-sm font-medium text-gousse-muted">{title}</p>
      <p className="max-w-xs text-xs text-gousse-muted/70">{description}</p>
    </div>
  );
};

const CheckMark = () => (
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    className="mb-2 size-6 text-gousse-muted/50"
  >
    <circle cx="12" cy="12" r="9" />
    <path d="m8.5 12.5 2.5 2.5 4.5-5" />
  </svg>
);
