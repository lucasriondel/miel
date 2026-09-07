interface Props {
  open: boolean;
  className?: string;
}

/** Chevron that flips when its popover is open. */
export const CaretIcon = ({ open, className = "h-3.5 w-3.5" }: Props) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.5"
    strokeLinecap="round"
    className={`flex-none transition-transform duration-200 ${open ? "rotate-180" : ""} ${className}`}
    aria-hidden
  >
    <path d="M6 9l6 6 6-6" />
  </svg>
);
