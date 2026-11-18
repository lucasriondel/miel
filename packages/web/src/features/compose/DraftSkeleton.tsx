const LINES = ["w-[24%]", "w-[94%]", "w-[88%]", "w-[60%]", "w-[18%]"];

/** The body while a draft is arriving: five soft bars, so the window does not jump when it lands. */
export const DraftSkeleton = () => (
  <output
    aria-label="Drafting"
    className="flex min-h-[180px] flex-1 flex-col gap-2.5 px-5 pt-[26px] pb-4"
  >
    {LINES.map((width) => (
      <span key={width} className={`h-2.5 ${width} animate-pulse rounded-full bg-gousse-fill`} />
    ))}
  </output>
);
