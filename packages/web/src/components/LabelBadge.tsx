interface Props {
  name: string;
  colorBg?: string | null;
  colorFg?: string | null;
  onRemove?: () => void;
  removeDisabled?: boolean;
}

export const LabelBadge = ({
  name,
  colorBg,
  colorFg,
  onRemove,
  removeDisabled,
}: Props) => {
  const hasColor = Boolean(colorBg || colorFg);
  const style = hasColor
    ? {
        backgroundColor: colorBg ?? undefined,
        color: colorFg ?? undefined,
      }
    : undefined;
  const className = hasColor
    ? "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium"
    : "inline-flex items-center gap-1 rounded bg-miel-line px-1.5 py-0.5 text-xs font-medium text-miel-muted";
  return (
    <span className={className} style={style}>
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
          className="-mr-0.5 inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm leading-none opacity-60 transition-opacity hover:bg-black/15 hover:opacity-100 disabled:cursor-progress disabled:opacity-40"
        >
          <svg
            viewBox="0 0 8 8"
            aria-hidden="true"
            className="h-2 w-2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          >
            <line x1="1.5" y1="1.5" x2="6.5" y2="6.5" />
            <line x1="6.5" y1="1.5" x2="1.5" y2="6.5" />
          </svg>
        </button>
      ) : null}
    </span>
  );
};
