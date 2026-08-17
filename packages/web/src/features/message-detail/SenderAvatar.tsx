interface Props {
  name: string | null;
  email: string;
}

/** `Bob Vance` → `BV`; a one-word name or a bare address falls back to two letters. */
const initialsFor = (name: string | null, email: string): string => {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    return `${words[0]![0]}${words.at(-1)![0]}`.toUpperCase();
  }
  const source = words[0] ?? email.split("@")[0] ?? email;
  return source.slice(0, 2).toUpperCase() || "?";
};

/**
 * The sender's initials, as the anchor of the resting header line (#88).
 *
 * Neutral fill rather than the account avatar's accent gradient: §4 keeps accent
 * for active states, and the two avatars sit on screen together — the top-bar one
 * is the mailbox you're in, this one is who wrote. Decorative, so `aria-hidden`:
 * the name it stands for is spelled out right beside it.
 */
export const SenderAvatar = ({ name, email }: Props) => (
  <span
    aria-hidden
    className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-gousse-line/50 text-xs font-bold tracking-wide text-gousse-muted"
  >
    {initialsFor(name, email)}
  </span>
);
