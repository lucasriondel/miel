/** `Kelly <kelly@corp.example>` → `kelly@corp.example`; a bare address passes through. */
const addressOf = (value: string): string => {
  const angled = value.match(/<([^>]+)>/);
  return (angled?.[1] ?? value).trim();
};

/**
 * The "to me + 2 others" note the sender line carries when a message went to
 * more than one person.
 *
 * The metadata table is behind a disclosure now (#88), so the recipient count
 * has to survive at rest: a thread that quietly includes four other people
 * changes how you reply, and that shouldn't need a click to discover. One
 * recipient says nothing — that's the case the disclosure is for.
 *
 * Returns null when there is nothing worth saying.
 */
export const recipientLine = (toEmails: string[], accountEmail: string): string | null => {
  if (toEmails.length < 2) return null;

  const addresses = toEmails.map(addressOf);
  const account = accountEmail.trim().toLowerCase();
  const primary = addresses.some((a) => a.toLowerCase() === account) ? "me" : addresses[0];

  const others = addresses.length - 1;
  return `to ${primary} + ${others} ${others === 1 ? "other" : "others"}`;
};
