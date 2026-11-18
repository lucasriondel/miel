import type { ReactNode } from "react";

interface Props {
  icon: ReactNode;
  title: string;
  description: string;
  actions?: ReactNode;
}

/**
 * An empty list, as the redesign draws every one (Main view › Empty week,
 * Search no results, All caught up): a white icon well, a 17px title, one line
 * of explanation and the one or two things worth doing next, centred 200px
 * down the column.
 */
export const InboxEmptyState = ({ icon, title, description, actions }: Props) => (
  <div className="mx-auto flex max-w-[380px] flex-col items-center gap-4 pt-24 text-center sm:pt-[200px]">
    <div className="grid h-14 w-14 place-items-center rounded-2xl border border-gousse-line bg-gousse-panel text-gousse-muted shadow-[0_2px_6px_rgb(20_32_46/0.06)] [&_svg]:h-6 [&_svg]:w-6">
      {icon}
    </div>
    <div className="flex flex-col gap-1.5">
      <h2 className="text-[17px] font-semibold text-gousse-ink">{title}</h2>
      <p className="text-[13px] leading-[1.5] text-gousse-muted">{description}</p>
    </div>
    {actions ? <div className="flex items-center gap-2 pt-1">{actions}</div> : null}
  </div>
);
