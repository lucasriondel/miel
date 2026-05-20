interface Props {
  name: string;
  kind?: "existing" | "new";
  onClick?: () => void;
  disabled?: boolean;
}

export const SuggestedLabelBadge = ({
  name,
  kind = "existing",
  onClick,
  disabled,
}: Props) => {
  const isNew = kind === "new";
  const title = onClick
    ? isNew
      ? `Apply new label "${name}"`
      : `Apply suggested label "${name}"`
    : isNew
      ? "Suggested new label"
      : "Suggested existing label";
  const baseClass = `inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${
    isNew
      ? "border-miel-accent/40 bg-miel-accent/10 text-miel-accent"
      : "border-dashed border-miel-line bg-miel-panel text-miel-muted"
  }`;
  const content = (
    <>
      <span aria-hidden="true">{isNew ? "+" : "?"}</span>
      {name}
    </>
  );

  if (!onClick) {
    return (
      <span title={title} className={baseClass}>
        {content}
      </span>
    );
  }

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      }}
      className={`${baseClass} transition-colors hover:border-solid hover:bg-miel-bg disabled:cursor-progress disabled:opacity-60`}
    >
      {content}
    </button>
  );
};
