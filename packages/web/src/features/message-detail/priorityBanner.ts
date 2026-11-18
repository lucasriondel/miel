import type { Priority } from "../../api/types";

/**
 * How the reader's priority banner wears each level (UI System › Priority
 * Banner): high on the red tint with dark red text, medium on the amber tint,
 * low on the neutral fill with quiet text — and a dot in the level's colour.
 *
 * The text colours are the design's `*-text` tokens, which sit on their own
 * tint at well over 4.5:1; the word "priority" is always spelled out, so the
 * colour is emphasis and never the only carrier.
 */
interface BannerStyle {
  label: string;
  surface: string;
  text: string;
  dot: string;
  rule: string;
}

const BANNER: Record<Priority, BannerStyle> = {
  high: {
    label: "High priority",
    surface: "bg-gousse-high-bg",
    text: "text-gousse-high-text",
    dot: "bg-gousse-high",
    rule: "border-gousse-high-border",
  },
  medium: {
    label: "Medium priority",
    surface: "bg-gousse-medium-bg",
    text: "text-gousse-medium-text",
    dot: "bg-gousse-medium",
    rule: "border-gousse-medium/30",
  },
  low: {
    label: "Low priority",
    surface: "bg-gousse-fill",
    text: "text-gousse-quiet",
    dot: "bg-gousse-subtle",
    rule: "border-gousse-line",
  },
};

export const priorityBanner = (priority: Priority): BannerStyle => BANNER[priority];
