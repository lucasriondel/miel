import type { GoogleOAuthConfigStatus } from "../../api/types";
import { GoogleClientForgetAction } from "./GoogleClientForgetAction";
import { SettingsRow } from "./SettingsRow";

const SOURCE_LABELS = {
  database: "Saved in miel",
  environment: "From the server environment",
} as const;

const Mono = ({ children }: { children: string }) => (
  <span className="block truncate font-mono text-xs text-gousse-ink" title={children}>
    {children}
  </span>
);

/**
 * The client in effect, as rows: nothing here is a secret but the secret, which
 * is a masked hint for a client saved in miel and never crosses the wire for
 * one in the server's environment.
 */
export const GoogleClientSummary = ({ status }: { status: GoogleOAuthConfigStatus }) => {
  if (status.source === null) {
    return (
      <div className="px-4 py-5">
        <p className="text-[13px] font-medium text-gousse-ink">No client yet</p>
        <p className="mt-0.5 text-xs text-gousse-muted">
          Add one to let mailboxes sign in with Google.
        </p>
      </div>
    );
  }
  return (
    <>
      <SettingsRow
        title="Client ID"
        description={<Mono>{status.clientId ?? "—"}</Mono>}
        control={<span className="text-xs text-gousse-muted">{SOURCE_LABELS[status.source]}</span>}
      />
      <SettingsRow
        title="Client secret"
        description={
          status.secretHint ? (
            <Mono>{status.secretHint}</Mono>
          ) : (
            "Kept on the server, never shown here."
          )
        }
      />
      <SettingsRow title="Redirect URI" description={<Mono>{status.redirectUri ?? "—"}</Mono>} />
      {status.source === "database" ? <GoogleClientForgetAction status={status} /> : null}
    </>
  );
};
