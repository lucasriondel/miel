import { Loader } from "lucide-react";

const PARAGRAPHS = [[120], [564, 530, 552, 310], [548, 420], [72]];

/**
 * The reader while the message is being read (Main view › Reader, loading
 * body): placeholder title and paragraphs in the body's own rhythm, and one
 * line saying what is happening.
 */
export const ReaderSkeleton = () => (
  <output aria-label="Loading message" className="flex flex-col gap-5">
    <span className="h-6 w-3/4 rounded-full bg-gousse-line motion-safe:animate-pulse" />
    <span className="h-[38px] w-full rounded-lg bg-gousse-fill motion-safe:animate-pulse" />
    <div className="flex flex-col gap-6 pt-1.5 motion-safe:animate-pulse">
      {PARAGRAPHS.map((lines, i) => (
        <div key={i} className="flex flex-col gap-[11px]">
          {lines.map((w, j) => (
            <span
              key={j}
              className="h-2.5 max-w-full rounded-full bg-gousse-fill"
              style={{ width: `${w}px` }}
            />
          ))}
        </div>
      ))}
    </div>
    <span className="flex items-center gap-2 pt-2 text-xs text-gousse-subtle">
      <Loader className="h-3.5 w-3.5 motion-safe:animate-spin" aria-hidden />
      Fetching message…
    </span>
  </output>
);
