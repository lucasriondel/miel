import { PERMISSIONS } from "../content/site";
import { SCOPE_DISCLOSURES } from "../content/scopes";

/**
 * A real table — caption, header row, row headers — rather than a grid of divs,
 * so a screen-reader user can navigate it cell by cell and hear which
 * permission each cell belongs to. Rows come from the canonical scope list.
 */
export function ScopeTable() {
  return (
    <div className="scope-table">
      <table>
        <caption>{PERMISSIONS.tableCaption}</caption>
        <thead>
          <tr>
            <th scope="col">{PERMISSIONS.columns.permission}</th>
            <th scope="col">{PERMISSIONS.columns.consent}</th>
            <th scope="col">{PERMISSIONS.columns.feature}</th>
          </tr>
        </thead>
        <tbody>
          {SCOPE_DISCLOSURES.map((row) => (
            <tr key={row.scope}>
              <th scope="row">{row.permission}</th>
              <td>
                {row.consentWording}
                {/* The literal scope, so the reader can match this row against
                    what Google names on the consent screen. */}
                <code className="scope-string">{row.scope}</code>
              </td>
              <td>{row.feature}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
