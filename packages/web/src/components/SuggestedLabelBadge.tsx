interface Props {
  name: string;
  kind?: "existing" | "new";
}

export const SuggestedLabelBadge = ({ name, kind = "existing" }: Props) => {
  const isNew = kind === "new";
  return (
    <span
      title={isNew ? "Suggested new label" : "Suggested existing label"}
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-medium ${
        isNew
          ? "border-miel-accent/40 bg-miel-accent/10 text-miel-accent"
          : "border-dashed border-miel-line bg-white text-miel-muted"
      }`}
    >
      <span aria-hidden="true">{isNew ? "+" : "?"}</span>
      {name}
    </span>
  );
};
