/** What each variable is, so the list is actionable without leaving the app. */
const DESCRIPTIONS: Record<string, string> = {
  GOOGLE_CLIENT_ID: "The OAuth client id of your Google Cloud Web application client.",
  GOOGLE_CLIENT_SECRET: "That client's secret. It stays on the server and is never sent here.",
  GOOGLE_REDIRECT_URI:
    "Where Google returns the browser after consent — this server's /auth/google/callback.",
};

interface Props {
  names: readonly string[];
}

/**
 * The `GOOGLE_*` variables the server reports as unset (#120).
 *
 * Names and explanations only: the server sends no values, one of the three
 * being a secret and the other two being of no use to a reader who is about to
 * set them anyway. An unrecognised name still renders — the list is whatever
 * the server said, not a fixed three, so a variable added later shows up here
 * without a matching entry above.
 *
 * A real `<ul>`/`<li>` so the count is announced, which is the part a screen
 * reader needs when the list is the whole content of a step.
 */
export const MissingEnvList = ({ names }: Props) => (
  <ul
    aria-label="Missing variables"
    className="divide-y divide-gousse-high-border overflow-hidden rounded-[10px] border border-gousse-high-border bg-gousse-high-bg"
  >
    {names.map((name) => (
      <li key={name} className="px-3 py-2">
        <code className="font-mono text-xs font-semibold text-gousse-high-text">{name}</code>
        {DESCRIPTIONS[name] ? (
          <p className="mt-0.5 text-xs leading-[18px] text-gousse-high-text/85">
            {DESCRIPTIONS[name]}
          </p>
        ) : null}
      </li>
    ))}
  </ul>
);
