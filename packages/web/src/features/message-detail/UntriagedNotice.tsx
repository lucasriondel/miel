import { Sparkles } from "lucide-react";
import { detailSurfaceClass } from "./detailSurface";

/**
 * Stands in for the triage row when a message has never been triaged. Keeps the
 * dashed edge — the shape says "nothing here yet" — on the shared card radius,
 * without the accent gradient wash DESIGN.md never sanctioned (§1, §3).
 */
export const UntriagedNotice = () => (
  <section
    className={`${detailSurfaceClass()} flex items-center gap-3 border-dashed px-5 py-4 text-sm text-gousse-muted`}
  >
    <Sparkles className="h-5 w-5 shrink-0 text-gousse-muted" aria-hidden />
    <span className="font-medium">
      Not triaged yet — run a sync to generate a priority and label suggestions.
    </span>
  </section>
);
