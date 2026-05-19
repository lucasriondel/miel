interface Props {
  name: string;
  colorBg?: string | null;
  colorFg?: string | null;
}

export const LabelBadge = ({ name, colorBg, colorFg }: Props) => {
  const hasColor = Boolean(colorBg || colorFg);
  const style = hasColor
    ? {
        backgroundColor: colorBg ?? undefined,
        color: colorFg ?? undefined,
      }
    : undefined;
  const className = hasColor
    ? "inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium"
    : "inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700";
  return (
    <span className={className} style={style}>
      {name}
    </span>
  );
};
