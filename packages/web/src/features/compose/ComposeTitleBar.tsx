import type { ReactNode } from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";

interface Props {
  title: string;
  minimized: boolean;
  onMinimize: () => void;
  onRestore: () => void;
  onClose: () => void;
  closeLabel?: string;
}

/**
 * The window's handle: what is being written, and the two ways to get it out of
 * the way (#96). Minimize keeps the draft, close discards it — so they are two
 * controls and never one toggle.
 *
 * Icon-only controls, so each carries §5's 40px hit floor as padding around a
 * small glyph rather than a shrunken target, and the press feedback the rest of
 * the app uses. The bar is not itself a button: a clickable bar wrapping two
 * buttons nests interactive elements, and the glyph is the affordance anyway.
 */
export const ComposeTitleBar = ({
  title,
  minimized,
  onMinimize,
  onRestore,
  onClose,
  closeLabel = "Close",
}: Props) => (
  <div className="flex items-center gap-2 border-b border-gousse-line/60 bg-gousse-line/20 py-1 pl-5 pr-2">
    <p className="flex-1 truncate text-sm font-semibold text-gousse-ink" title={title}>
      {title}
    </p>
    <TitleBarButton
      label={minimized ? "Restore" : "Minimize"}
      onClick={minimized ? onRestore : onMinimize}
    >
      {minimized ? (
        <ChevronUp className="h-4 w-4" aria-hidden />
      ) : (
        <ChevronDown className="h-4 w-4" aria-hidden />
      )}
    </TitleBarButton>
    <TitleBarButton label={closeLabel} onClick={onClose}>
      <X className="h-4 w-4" aria-hidden />
    </TitleBarButton>
  </div>
);

const TitleBarButton = ({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    onClick={onClick}
    className="inline-flex h-10 w-10 items-center justify-center rounded-full text-gousse-muted transition-[background-color,color,transform] hover:bg-gousse-line/60 hover:text-gousse-ink active:scale-[0.96]"
  >
    {children}
  </button>
);
