import { format, isSameDay, isSameYear, subDays } from "date-fns";

/**
 * The reader's date beside the sender (Main view › Message Header: "Today,
 * 10:42"): today and yesterday by name, otherwise the date — with the year
 * only when it is not this one.
 */
export const readerDate = (date: Date, now: Date = new Date()): string => {
  const time = format(date, "HH:mm");
  if (isSameDay(date, now)) return `Today, ${time}`;
  if (isSameDay(date, subDays(now, 1))) return `Yesterday, ${time}`;
  return isSameYear(date, now)
    ? format(date, "EEE d MMM, HH:mm")
    : format(date, "d MMM yyyy, HH:mm");
};
