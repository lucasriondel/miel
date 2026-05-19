const SINCE_PATTERN = /^(\d+)([dhwmy])$/i;

export function parseSince(since: string): string {
  const trimmed = since.trim();
  if (!SINCE_PATTERN.test(trimmed)) {
    throw new Error(
      `Invalid --since value: "${since}". Expected forms like "7d", "24h", "2w".`,
    );
  }
  return `newer_than:${trimmed.toLowerCase()}`;
}
