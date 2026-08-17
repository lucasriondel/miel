interface Props {
  email: string;
  avatarUrl?: string | null;
  /** Initials length — 2 for the trigger, 1 for compact list rows. */
  chars?: 1 | 2;
  className?: string;
}

function initialsFor(email: string, chars: 1 | 2): string {
  const local = email.split("@")[0] ?? email;
  return local.slice(0, chars).toUpperCase() || "?";
}

/**
 * Circular account avatar — image when available, gradient initials otherwise.
 * Sizing comes from `className` (height/width); defaults to 34px.
 *
 * `referrerPolicy="no-referrer"` is load-bearing: Google's avatar CDN
 * (lh3.googleusercontent.com) 403s requests carrying a foreign `Referer`, so
 * without it every OAuth profile picture renders as a broken image.
 */
export const Avatar = ({ email, avatarUrl, chars = 2, className = "h-[34px] w-[34px]" }: Props) => (
  <span
    className={`inline-flex flex-none items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-gousse-accent to-orange-700 text-[11px] font-bold tracking-wide text-white ${className}`}
  >
    {avatarUrl ? (
      <img
        src={avatarUrl}
        alt={email}
        referrerPolicy="no-referrer"
        className="h-full w-full object-cover"
      />
    ) : (
      initialsFor(email, chars)
    )}
  </span>
);
