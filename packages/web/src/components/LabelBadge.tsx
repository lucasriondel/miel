interface Props {
  name: string;
}

export const LabelBadge = ({ name }: Props) => (
  <span className="inline-flex items-center rounded bg-rose-100 px-1.5 py-0.5 text-xs font-medium text-rose-900">
    {name}
  </span>
);
