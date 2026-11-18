import { Loader } from "lucide-react";

/**
 * Stands in for the triage row when a message has never been triaged. Keeps the
 * dashed edge — the shape says "nothing here yet" — on the shared card radius,
 * without the accent gradient wash DESIGN.md never sanctioned (§1, §3).
 */
export const UntriagedNotice = () => (
  <section className="flex min-h-[38px] items-center gap-2 rounded-lg border border-gousse-line bg-gousse-hover px-2.5 text-[13px] text-gousse-muted">
    <Loader className="h-3.5 w-3.5 shrink-0" aria-hidden />
    <span className="font-medium">Not triaged yet — run a sync to generate a priority.</span>
  </section>
);
