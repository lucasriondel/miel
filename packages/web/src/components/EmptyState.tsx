import type { ReactNode } from "react";

interface Props {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
}

export const EmptyState = ({ title, description, action }: Props) => (
  <div className="flex flex-col items-center justify-center rounded-md border border-dashed border-miel-line bg-miel-panel px-6 py-12 text-center">
    <p className="text-sm font-medium text-miel-ink">{title}</p>
    {description ? (
      <p className="mt-1 max-w-md text-sm text-miel-muted">{description}</p>
    ) : null}
    {action ? <div className="mt-4">{action}</div> : null}
  </div>
);
