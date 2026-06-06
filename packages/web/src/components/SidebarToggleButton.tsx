interface Props {
  onToggle: () => void;
}

export const SidebarToggleButton = ({ onToggle }: Props) => (
  <button
    type="button"
    onClick={onToggle}
    aria-label="Open sidebar"
    title="Open sidebar"
    className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-miel-muted hover:bg-miel-line/40 hover:text-miel-ink"
  >
    <span aria-hidden className="text-sm leading-none">»</span>
  </button>
);
