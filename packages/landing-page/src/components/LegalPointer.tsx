import { LEGAL_POINTER } from "../content/nav";
import { PRIVACY } from "../content/privacy";
import { TERMS } from "../content/terms";

/** Homepage pointer at the privacy policy and the terms of service. */
export function LegalPointer() {
  return (
    <p className="note">
      {LEGAL_POINTER.privacy} <a href={PRIVACY.path}>{PRIVACY.navLabel}</a>. {LEGAL_POINTER.terms}{" "}
      <a href={TERMS.path}>{TERMS.navLabel}</a>.
    </p>
  );
}
