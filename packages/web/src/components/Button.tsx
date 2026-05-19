import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
}

const styles: Record<Variant, string> = {
  primary:
    "bg-miel-ink text-white hover:bg-black disabled:bg-miel-muted disabled:cursor-not-allowed",
  secondary:
    "bg-white border border-miel-line text-miel-ink hover:bg-miel-bg disabled:opacity-50 disabled:cursor-not-allowed",
  ghost:
    "bg-transparent text-miel-ink hover:bg-miel-line/60 disabled:opacity-50 disabled:cursor-not-allowed",
  danger:
    "bg-miel-high text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed",
};

export const Button = ({ variant = "secondary", className, children, ...rest }: Props) => (
  <button
    {...rest}
    className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${styles[variant]} ${className ?? ""}`}
  >
    {children}
  </button>
);
