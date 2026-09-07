import type { ComponentProps, ReactNode } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/gousse/utils";

/**
 * An inline message block — the thing a form shows when a submit fails, a setup
 * screen shows when the server is misconfigured, a settings page shows when a
 * value needs explaining. Not a toast: a Notice sits in the layout and stays.
 *
 * Tinted fill rather than a border. A bordered box inside an already-bordered
 * card reads as a second card; a `/10` wash of the state's own hue reads as the
 * same surface, coloured. The radius is `rounded-2xl` because a Notice is a
 * surface, not a control — the pill is for things you click.
 *
 * `role="alert"` is set for `danger` and `warning` only, since those are the
 * variants that appear in response to something going wrong and should
 * interrupt a screen reader. `info` and `success` announce politely or not at
 * all. Override with an explicit `role` when your case differs — a `success`
 * that lands after a submit is worth announcing.
 */

const notice = cva(
  "flex w-full items-start gap-2.5 rounded-2xl px-4 py-3 text-left text-sm font-medium leading-relaxed",
  {
    variants: {
      variant: {
        danger: "bg-gousse-high/10 text-gousse-high",
        warning: "bg-gousse-accent/10 text-gousse-accent",
        success: "bg-gousse-low/10 text-gousse-low",
        info: "bg-gousse-line/50 text-gousse-muted",
      },
    },
    defaultVariants: { variant: "danger" },
  },
);

const ICONS = {
  danger: CircleAlert,
  warning: TriangleAlert,
  success: CircleCheck,
  info: Info,
} as const;

export type NoticeVariant = keyof typeof ICONS;

interface NoticeProps
  extends Omit<ComponentProps<"div">, "children">,
    VariantProps<typeof notice> {
  /**
   * Replaces the variant's default lucide glyph. Pass `null` for a text-only
   * notice — the gap collapses, so no empty column is left behind.
   */
  icon?: ReactNode;
  children: ReactNode;
}

export function Notice({
  variant = "danger",
  icon,
  className,
  children,
  role,
  ...props
}: NoticeProps) {
  const Fallback = ICONS[variant ?? "danger"];
  const glyph =
    icon === undefined ? <Fallback size={16} className="mt-0.5 shrink-0" aria-hidden /> : icon;

  return (
    <div
      role={role ?? (variant === "danger" || variant === "warning" ? "alert" : undefined)}
      className={cn(notice({ variant }), className)}
      {...props}
    >
      {glyph}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/**
 * A stack of Notices sharing one variant — a list of missing env vars, a list
 * of validation failures. Renders `<ul>`/`<li>` so the count is announced,
 * which a pile of sibling `<div>`s does not do.
 */
export function NoticeList({ className, ...props }: ComponentProps<"ul">) {
  return <ul className={cn("flex w-full flex-col gap-2 text-left", className)} {...props} />;
}

/**
 * One row of a {@link NoticeList}. Takes the same chrome as {@link Notice} and
 * splits the content in two: `title` on its own line (monospaced when it names
 * a variable or a key), `children` as the quieter explanation under it.
 */
export function NoticeListItem({
  variant = "danger",
  icon,
  title,
  className,
  children,
  ...props
}: Omit<ComponentProps<"li">, "title"> &
  VariantProps<typeof notice> & { icon?: ReactNode; title: ReactNode }) {
  const Fallback = ICONS[variant ?? "danger"];
  const glyph =
    icon === undefined ? <Fallback size={16} className="mt-0.5 shrink-0" aria-hidden /> : icon;

  return (
    <li className={cn(notice({ variant }), className)} {...props}>
      {glyph}
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {children ? (
          <span className="mt-0.5 block text-xs font-medium leading-relaxed opacity-80">
            {children}
          </span>
        ) : null}
      </span>
    </li>
  );
}
