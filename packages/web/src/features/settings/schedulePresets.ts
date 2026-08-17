// Preset options for the Automatic sync controls. Using a fixed set of presets
// (rather than free-text) guarantees every value we PUT to /settings/schedule
// is inside the API contract by construction: interval is an integer ≥ 1, and
// `since` is a non-empty window string in the manual-sync format ("6h"/"7d").

export interface IntervalPreset {
  /** Human label shown in the dropdown. */
  label: string;
  /** Value sent as `intervalMinutes`. Integer ≥ 1. */
  minutes: number;
}

export interface SincePreset {
  /** Human label shown in the dropdown. */
  label: string;
  /** Value sent as `since`. Non-empty window string. */
  value: string;
}

export const INTERVAL_PRESETS: readonly IntervalPreset[] = [
  { label: "Every 15 minutes", minutes: 15 },
  { label: "Every 30 minutes", minutes: 30 },
  { label: "Every hour", minutes: 60 },
  { label: "Every 2 hours", minutes: 120 },
  { label: "Every 6 hours", minutes: 360 },
];

export const SINCE_PRESETS: readonly SincePreset[] = [
  { label: "Last 6 hours", value: "6h" },
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 7 days", value: "7d" },
];

/**
 * Label for a persisted `intervalMinutes` value. Falls back to a synthesized
 * "Every N minutes" label so a value outside the preset set (e.g. set via CLI)
 * still renders sensibly instead of showing a blank/wrong option.
 */
export function intervalPresetLabel(minutes: number): string {
  const preset = INTERVAL_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return hours === 1 ? "Every hour" : `Every ${hours} hours`;
  }
  return minutes === 1 ? "Every minute" : `Every ${minutes} minutes`;
}

/**
 * Label for a persisted `since` value. Falls back to the raw window string so
 * an out-of-preset value still renders instead of showing a wrong option.
 */
export function sincePresetLabel(value: string): string {
  return SINCE_PRESETS.find((p) => p.value === value)?.label ?? value;
}
