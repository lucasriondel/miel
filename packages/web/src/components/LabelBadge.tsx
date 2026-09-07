import { Badge } from "@/components/ui/badge";

interface Props {
  name: string;
  colorBg?: string | null;
  colorFg?: string | null;
  onRemove?: () => void;
  removeDisabled?: boolean;
}

export const LabelBadge = ({ name, colorBg, colorFg, onRemove, removeDisabled }: Props) => {
  const hasColor = Boolean(colorBg || colorFg);
  const style = hasColor
    ? {
        backgroundColor: colorBg ?? undefined,
        color: colorFg ?? undefined,
      }
    : undefined;
  return (
    <Badge variant={hasColor ? "colored" : "neutral"} interactive style={style}>
      {name}
      {onRemove ? (
        <button
          type="button"
          title={`Remove label "${name}"`}
          aria-label={`Remove label ${name}`}
          disabled={removeDisabled}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          className="-mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full sm:h-5 sm:w-5 opacity-70 transition-[transform,opacity] active:scale-[0.96] hover:bg-black/20 hover:opacity-100 disabled:cursor-progress disabled:opacity-40"
        >
          <svg
            viewBox="0 0 8 8"
            aria-hidden="true"
            className="h-2.5 w-2.5"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          >
            <line x1="1.5" y1="1.5" x2="6.5" y2="6.5" />
            <line x1="6.5" y1="1.5" x2="1.5" y2="6.5" />
          </svg>
        </button>
      ) : null}
    </Badge>
  );
};
