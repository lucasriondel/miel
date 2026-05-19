import type { ReactNode } from "react";

interface Props {
  active: boolean;
  onClick: () => void;
  depth?: number;
  title?: string;
  children: ReactNode;
}

export const LabelListRow = ({
  active,
  onClick,
  depth = 0,
  title,
  children,
}: Props) => {
  const indent = depth > 0 ? { paddingLeft: `${0.5 + depth * 0.75}rem` } : undefined;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      style={indent}
      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm ${
        active
          ? "bg-miel-accent/10 text-miel-ink"
          : "text-miel-muted hover:bg-miel-line/40 hover:text-miel-ink"
      }`}
    >
      {children}
    </button>
  );
};
