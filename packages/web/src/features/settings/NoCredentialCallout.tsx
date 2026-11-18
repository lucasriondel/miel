import { TriangleAlert } from "lucide-react";
import type { MissingCredentials } from "./missingCredentials";

/**
 * The amber callout at the top of the AI tab when a task cannot run for want of
 * a credential (`miel.figcraft`, Settings › AI tab, no credential yet) — said
 * where the fix is, before the next sync finds out.
 */
export const NoCredentialCallout = ({ missing }: { missing: MissingCredentials }) => (
  <div className="flex gap-3 rounded-xl border border-gousse-medium/35 bg-gousse-medium-bg px-4 py-3.5">
    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 flex-none text-gousse-medium" aria-hidden />
    <div className="flex flex-col gap-[3px]">
      <p className="text-[13px] font-semibold text-gousse-medium-text">{missing.title}</p>
      <p className="text-xs leading-[1.5] text-gousse-medium-text/90">{missing.body}</p>
    </div>
  </div>
);
