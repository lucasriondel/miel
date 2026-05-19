interface Props {
  name: string;
}

export const LabelBadge = ({ name }: Props) => (
  <span className="inline-flex items-center rounded border border-miel-line bg-miel-bg px-1.5 py-0.5 text-xs font-medium text-miel-ink">
    {name}
  </span>
);
