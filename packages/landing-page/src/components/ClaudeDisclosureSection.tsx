import { CLAUDE_DISCLOSURE } from "../content/site";
import { LegalPointer } from "./LegalPointer";

export function ClaudeDisclosureSection() {
  return (
    <section aria-labelledby={`${CLAUDE_DISCLOSURE.id}-heading`} id={CLAUDE_DISCLOSURE.id}>
      <h2 id={`${CLAUDE_DISCLOSURE.id}-heading`}>{CLAUDE_DISCLOSURE.heading}</h2>
      {CLAUDE_DISCLOSURE.body.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <LegalPointer />
    </section>
  );
}
