import { SkeletonCard } from "./SkeletonCard";

/**
 * What a tab shows while its settings load (`miel.figcraft`, Settings ›
 * Loading): two cards of grey bars in the shape of the rows to come, so the
 * page holds its layout instead of jumping when the data lands.
 */
export const SettingsSkeleton = ({ cards = 2 }: { cards?: number }) => (
  <div className="flex flex-col gap-6" aria-busy="true" aria-label="Loading settings">
    {Array.from({ length: cards }, (_, i) => (
      <SkeletonCard key={i} />
    ))}
  </div>
);
