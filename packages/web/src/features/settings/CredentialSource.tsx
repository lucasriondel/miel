import type { CredentialCopy } from "./credentialCopy";

/**
 * Where to get a credential, under the field that takes it: a link to the
 * vendor's console for a key, the command that prints one for the token.
 */
export const CredentialSource = ({ copy }: { copy: CredentialCopy }) =>
  copy.sourceUrl ? (
    <a
      href={copy.sourceUrl}
      target="_blank"
      rel="noreferrer"
      className="text-xs text-gousse-muted underline-offset-2 hover:text-gousse-ink hover:underline"
    >
      Create a {copy.noun} at {copy.source} ↗
    </a>
  ) : (
    <span className="text-xs text-gousse-muted">{copy.source} to get one.</span>
  );
