import { PERMISSIONS } from "../content/site";
import { ScopeTable } from "./ScopeTable";

export function PermissionsSection() {
  return (
    <section aria-labelledby={`${PERMISSIONS.id}-heading`} id={PERMISSIONS.id}>
      <h2 id={`${PERMISSIONS.id}-heading`}>{PERMISSIONS.heading}</h2>
      {PERMISSIONS.intro.map((paragraph) => (
        <p key={paragraph}>{paragraph}</p>
      ))}
      <ScopeTable />
      {PERMISSIONS.notes.map((note) => (
        <p className="note" key={note}>
          {note}
        </p>
      ))}
    </section>
  );
}
