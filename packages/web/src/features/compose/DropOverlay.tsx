import { Paperclip } from "lucide-react";

/**
 * What the window turns into while files are dragged over it: a dashed honey
 * panel saying the drop attaches, and Gmail's limit.
 */
export const DropOverlay = () => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-3 z-10 flex flex-col items-center justify-center gap-1.5 rounded-2xl border-2 border-dashed border-gousse-medium/60 bg-gousse-tint-amber/95 text-gousse-tint-amber-ink"
  >
    <Paperclip className="h-4 w-4" />
    <p className="text-[13px] font-semibold">Drop to attach</p>
    <p className="text-xs opacity-80">Up to 25 MB in total — Gmail’s limit</p>
  </div>
);
