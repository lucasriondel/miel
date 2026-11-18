/**
 * The list before its first answer (Main view › Loading, first load): two
 * section headers and cards of placeholder rows in the exact geometry of the
 * real ones, so nothing moves when the mail arrives.
 */
const SkeletonRow = () => (
  <div className="flex h-11 items-center gap-3 border-t border-gousse-fill px-4 first:border-t-0">
    <div className="flex w-[184px] shrink-0 items-center pl-3.5">
      <span className="h-2.5 w-[104px] rounded-full bg-gousse-line" />
    </div>
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="h-[18px] w-[54px] shrink-0 rounded-full bg-gousse-fill" />
      <span className="h-2.5 w-[220px] shrink rounded-full bg-gousse-line" />
      <span className="hidden h-2.5 w-[320px] shrink rounded-full bg-gousse-fill md:block" />
    </div>
    <span className="h-2.5 w-[30px] shrink-0 rounded-full bg-gousse-line" />
  </div>
);

const SkeletonSection = ({ rows }: { rows: number }) => (
  <div className="flex flex-col gap-2">
    <div className="flex h-6 items-center gap-2 px-4">
      <span className="h-2 w-2 rounded-full bg-gousse-line" />
      <span className="h-2.5 w-24 rounded-full bg-gousse-line" />
    </div>
    <div className="overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  </div>
);

export const InboxSkeleton = () => (
  <output
    aria-label="Loading messages"
    className="flex flex-col gap-[30px] motion-safe:animate-pulse"
  >
    <SkeletonSection rows={8} />
    <SkeletonSection rows={5} />
  </output>
);
