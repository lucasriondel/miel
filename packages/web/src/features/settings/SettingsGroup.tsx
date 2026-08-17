import type { ReactNode } from "react";

interface Props {
  /** Anchor id, shared with the rail (e.g. "general" / "connections" / "ai"). */
  id: string;
  label: string;
  children: ReactNode;
}

/**
 * One titled settings group in the single-scroll layout. The label is a sticky,
 * blurred header (`.settings-group-head`) that floats over its cards while the
 * group is in view; content scrolls beneath it. `scroll-mt` keeps anchor jumps
 * from tucking the header under the page top.
 */
export const SettingsGroup = ({ id, label, children }: Props) => (
  <section id={id} className="flex scroll-mt-6 flex-col gap-5">
    <div className="settings-group-head flex items-center gap-3 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-gousse-muted">
        {label}
      </span>
      <span className="h-px flex-1 bg-gousse-line/60" />
    </div>
    {children}
  </section>
);
