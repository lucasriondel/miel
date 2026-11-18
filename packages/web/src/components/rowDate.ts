/**
 * When a message arrived, the way the redesign's rows say it: the time for
 * today's mail ("10:42"), the weekday for the past week ("Thu"), the day and
 * month this year ("Oct 27") and the full date before that ("Oct 27, 2024").
 *
 * It replaces the relative age (`4h`, `19d`) the rows used to carry: a list
 * scoped to one week or month reads more naturally against the calendar it is
 * showing than against "now". `now` is a parameter so the wording is
 * assertable.
 */
const DAY = 24 * 60 * 60 * 1000;

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

export const rowDate = (date: Date, now: Date = new Date()): string => {
  if (Number.isNaN(date.getTime())) return "";
  if (sameDay(date, now)) {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (date.getTime() < startOfToday && startOfToday - date.getTime() < 6 * DAY) {
    return date.toLocaleDateString("en-US", { weekday: "short" });
  }
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};
