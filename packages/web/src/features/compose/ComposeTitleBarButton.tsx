import type { ReactNode } from "react";

interface Props {
  label: string;
  onClick: () => void;
  children: ReactNode;
}

/** A 32px round glyph button in a compose title bar (minimize, restore, close). */
export const ComposeTitleBarButton = ({ label, onClick, children }: Props) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gousse-muted transition-[background-color,color,transform] hover:bg-gousse-fill hover:text-gousse-ink active:scale-[0.96] [&_svg]:h-3.5 [&_svg]:w-3.5"
  >
    {children}
  </button>
);
