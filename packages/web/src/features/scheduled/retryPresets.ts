import { schedulePresets, type TimePreset } from "../time/timePresets";

/**
 * A failed send's retry menu: the schedule presets, led by "Right away" — a
 * minute out, which the server accepts as future and the due-work loop picks up
 * on its next tick. A send that failed is usually one the user wants gone now,
 * not tomorrow.
 */
export const retryPresets = (now: Date): TimePreset[] => [
  { id: "right-away", label: "Right away", at: new Date(now.getTime() + 60_000) },
  ...schedulePresets(now),
];
