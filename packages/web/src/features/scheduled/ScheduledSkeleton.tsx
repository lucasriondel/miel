/** Three rows in the list's own geometry while it loads, rather than a spinner (DESIGN.md §9). */
export const ScheduledSkeleton = () => (
  <div
    aria-hidden
    className="divide-y divide-gousse-fill rounded-xl border border-gousse-line bg-gousse-panel"
  >
    {[0, 1, 2].map((i) => (
      <div key={i} className="flex items-center gap-4 px-4 py-3">
        <span className="h-3 w-[72px] rounded bg-gousse-fill motion-safe:animate-pulse" />
        <span className="flex flex-1 flex-col gap-1.5">
          <span className="h-3 w-1/3 rounded bg-gousse-fill motion-safe:animate-pulse" />
          <span className="h-3 w-2/3 rounded bg-gousse-fill motion-safe:animate-pulse" />
        </span>
      </div>
    ))}
  </div>
);
