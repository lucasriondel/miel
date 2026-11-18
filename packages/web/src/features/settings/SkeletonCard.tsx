/** One placeholder card: a title bar and three rows of a label, a line and a control. */
export const SkeletonCard = () => (
  <div className="overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel">
    <div className="px-4 pt-5 pb-[18px]">
      <div className="h-3 w-24 animate-pulse rounded-md bg-gousse-line" />
    </div>
    {[0, 1, 2].map((row) => (
      <div key={row} className="flex items-center gap-4 border-t border-gousse-fill p-4">
        <div className="flex flex-1 flex-col gap-2">
          <div className="h-2.5 w-[120px] animate-pulse rounded-md bg-gousse-line" />
          <div className="h-2 w-[260px] max-w-full animate-pulse rounded bg-gousse-fill" />
        </div>
        <div className="h-[30px] w-[168px] rounded-lg border border-gousse-fill bg-gousse-bg" />
      </div>
    ))}
  </div>
);
