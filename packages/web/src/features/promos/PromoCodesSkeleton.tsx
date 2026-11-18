/** A grey bar standing in for text that is still loading. */
const Bar = ({ className }: { className: string }) => (
  <span aria-hidden className={`block rounded-full bg-gousse-fill ${className}`} />
);

const CardSkeleton = () => (
  <div className="flex flex-col gap-3 rounded-xl border border-gousse-line bg-gousse-panel p-4">
    <div className="flex items-center gap-2.5">
      <span className="h-7 w-7 rounded-full bg-gousse-fill" />
      <Bar className="h-2.5 w-36" />
    </div>
    <Bar className="h-4 w-28" />
    <span className="h-[34px] rounded-lg bg-gousse-bg" />
    <div className="flex items-center justify-between">
      <Bar className="h-2.5 w-32" />
      <span className="h-6 w-14 rounded-md bg-gousse-fill" />
    </div>
  </div>
);

const RowSkeleton = () => (
  <div className="flex h-16 items-center gap-4 border-b border-gousse-fill px-4 last:border-b-0">
    <span className="h-8 w-8 shrink-0 rounded-full bg-gousse-fill" />
    <div className="flex flex-1 flex-col gap-2">
      <Bar className="h-2.5 w-40" />
      <Bar className="h-2 w-72 max-w-full" />
    </div>
    <span className="hidden h-8 w-[200px] rounded-lg bg-gousse-bg md:block" />
    <Bar className="hidden h-[22px] w-[100px] sm:block" />
  </div>
);

/** The page while its two reads are in flight: three cards and five rows. */
export const PromoCodesSkeleton = () => (
  <output aria-label="Loading promo codes" className="flex flex-col gap-7">
    <div className="flex flex-col gap-2.5">
      <Bar className="ml-4 h-2.5 w-14" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
    </div>
    <div className="flex flex-col gap-2">
      <Bar className="ml-4 h-2.5 w-10" />
      <div className="overflow-hidden rounded-xl border border-gousse-line bg-gousse-panel">
        {Array.from({ length: 5 }, (_, i) => (
          <RowSkeleton key={i} />
        ))}
      </div>
    </div>
  </output>
);
