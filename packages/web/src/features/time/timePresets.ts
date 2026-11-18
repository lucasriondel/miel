/**
 * The times a "when?" menu offers, and how a chosen time is written back.
 *
 * Shared by the two places that ask the question: a snooze (when should this
 * come back?) and a scheduled send (when should this go?). Pure, with `now` as
 * a parameter, so what each preset resolves to on a given day is assertable.
 * Every time is local: "Tomorrow morning" means 08:00 where the user is.
 *
 * Exports, kept stable for the compose window's "Schedule send…":
 * - {@link TimePreset} — `{ id, label, at }`.
 * - {@link snoozePresets} / {@link schedulePresets} — the two menus' lists.
 * - {@link presetTimeLabel} — "Today 17:00", "Tue 08:00", "24 Nov 08:00".
 */

export interface TimePreset {
  /** Stable, for keys and tests. */
  id: string;
  /** What the menu calls it: "Tomorrow morning". */
  label: string;
  /** The moment it resolves to, from the `now` it was built against. */
  at: Date;
}

/** The hour "morning" means. */
const MORNING_HOUR = 8;
/** "Later today" is not offered once it would land at or after this hour. */
const EVENING_HOUR = 20;

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** `days` after `now`'s calendar day, at `hour`:00 local time. */
const dayAt = (now: Date, days: number, hour: number): Date =>
  new Date(now.getFullYear(), now.getMonth(), now.getDate() + days, hour, 0, 0, 0);

/** Days from `now` to the next `weekday` (0 = Sunday), never 0: today does not count. */
const daysUntilNext = (now: Date, weekday: number): number => {
  const diff = (weekday - now.getDay() + 7) % 7;
  return diff === 0 ? 7 : diff;
};

/** Three hours from now, rounded to the nearest hour — or null when that is evening. */
const laterToday = (now: Date): Date | null => {
  const at = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  if (at.getMinutes() >= 30) at.setHours(at.getHours() + 1);
  at.setMinutes(0, 0, 0);
  const sameDay = at.getDate() === now.getDate() && at.getMonth() === now.getMonth();
  return sameDay && at.getHours() < EVENING_HOUR ? at : null;
};

const isWeekend = (now: Date) => now.getDay() === 0 || now.getDay() === 6;

/**
 * The snooze menu: Later today (only while it lands before 20:00), Tomorrow
 * morning, This weekend (Saturday 08:00, left out on a Saturday or Sunday,
 * where "this weekend" is already now), Next week (Monday 08:00).
 */
export function snoozePresets(now: Date): TimePreset[] {
  const presets: TimePreset[] = [];
  const later = laterToday(now);
  if (later) presets.push({ id: "later-today", label: "Later today", at: later });
  presets.push({
    id: "tomorrow-morning",
    label: "Tomorrow morning",
    at: dayAt(now, 1, MORNING_HOUR),
  });
  if (!isWeekend(now)) {
    presets.push({
      id: "this-weekend",
      label: "This weekend",
      at: dayAt(now, daysUntilNext(now, 6), MORNING_HOUR),
    });
  }
  presets.push({
    id: "next-week",
    label: "Next week",
    at: dayAt(now, daysUntilNext(now, 1), MORNING_HOUR),
  });
  return presets;
}

/**
 * The schedule-send menu (Compose & Reply › Send options): Tomorrow morning
 * and Monday morning, both at 08:00. On a Sunday the two are a day apart, and
 * on a Monday "Monday morning" is a week out — both are what the words say.
 */
export function schedulePresets(now: Date): TimePreset[] {
  return [
    { id: "tomorrow-morning", label: "Tomorrow morning", at: dayAt(now, 1, MORNING_HOUR) },
    {
      id: "monday-morning",
      label: "Monday morning",
      at: dayAt(now, daysUntilNext(now, 1), MORNING_HOUR),
    },
  ];
}

const pad = (n: number) => String(n).padStart(2, "0");

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * A moment as the menus and lists print it, relative to `now`: "Today 17:00"
 * on the same day, the weekday within the next six days ("Tue 08:00"), the
 * date beyond that ("24 Nov 08:00"), with the year once it is not this one.
 * Local time, 24-hour clock — the design writes times that way.
 */
export function presetTimeLabel(at: Date, now: Date): string {
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  const days = Math.round((startOfDay(at) - startOfDay(now)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days > 0 && days < 7) return `${WEEKDAYS[at.getDay()]} ${time}`;
  const date = `${at.getDate()} ${MONTHS[at.getMonth()]}`;
  const year = at.getFullYear() === now.getFullYear() ? "" : ` ${at.getFullYear()}`;
  return `${date}${year} ${time}`;
}

/** `YYYY-MM-DD` of a local day, as an `<input type="date">` holds it. */
export const dateInputValue = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** `HH:MM` of a local time, as an `<input type="time">` holds it. */
export const timeInputValue = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * The local moment two inputs name, or null when either is empty or malformed.
 * The inverse of {@link dateInputValue} and {@link timeInputValue}.
 */
export function fromDateAndTime(date: string, time: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !t) return null;
  const at = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  return Number.isNaN(at.getTime()) ? null : at;
}

/** Where the custom form starts when the caller names nothing: the next whole hour after now. */
export const nextWholeHour = (now: Date): Date => {
  const at = new Date(now.getTime() + 60 * 60 * 1000);
  at.setMinutes(0, 0, 0);
  return at;
};
