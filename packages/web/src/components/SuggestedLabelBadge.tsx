import { Badge, badgeClasses } from "@/components/ui/badge";

interface Props {
  name: string;
  kind?: "existing" | "new";
  onClick?: () => void;
  disabled?: boolean;
}

export const SuggestedLabelBadge = ({ name, kind = "existing", onClick, disabled }: Props) => {
  const isNew = kind === "new";
  const variant = isNew ? "suggestedNew" : "suggested";
  const title = onClick
    ? isNew
      ? `Apply new label "${name}"`
      : `Apply suggested label "${name}"`
    : isNew
      ? "Suggested new label"
      : "Suggested existing label";
  const content = (
    <>
      <span aria-hidden="true" className="text-sm">
        {isNew ? "+" : "?"}
      </span>
      {name}
    </>
  );

  if (!onClick) {
    return (
      <Badge variant={variant} title={title}>
        {content}
      </Badge>
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
      className={badgeClasses(
        { variant, interactive: true },
        "hover:border-solid hover:bg-gousse-accent/25 hover:text-gousse-accent disabled:cursor-progress disabled:opacity-60",
      )}
    >
      {content}
    </button>
  );
};
