import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { useGoogleOAuthConfig } from "../../api/googleOAuthConfig.hooks";
import { AppButton } from "../../components/AppButton";
import { GoogleClientForm } from "../google-oauth/GoogleClientForm";
import { GoogleClientSummary } from "./GoogleClientSummary";
import { SettingsPanel } from "./SettingsPanel";

/**
 * The Google OAuth client every mailbox signs in through (A15), on the
 * Mailboxes tab beside the mailboxes it serves: what is in effect — the ID, a
 * masked secret, the redirect URI and where it comes from — then Edit, which
 * unfolds the same form the onboarding gate's Google step draws.
 *
 * Changing the client disconnects every mailbox, since a Google grant belongs
 * to the client that issued it; the form says so before the save, and the save
 * says how many it took.
 */
export const GoogleClientCard = () => {
  const config = useGoogleOAuthConfig();
  const [editing, setEditing] = useState(false);
  const status = config.data;

  return (
    <SettingsPanel
      title="Google OAuth client"
      label="Google OAuth client"
      action={
        status && !editing ? (
          <AppButton onClick={() => setEditing(true)}>
            {status.source === null ? "Add client" : "Edit"}
          </AppButton>
        ) : null
      }
    >
      {config.isLoading ? (
        <div className="flex items-center gap-2 px-4 py-4 text-[13px] text-gousse-muted">
          <Spinner /> Loading the Google client…
        </div>
      ) : config.error || !status ? (
        <div role="alert" className="px-4 py-4 text-[13px] text-gousse-error">
          Failed to load the Google client: {apiErrorMessage(config.error)}
        </div>
      ) : editing ? (
        <div className="px-4 py-4">
          <GoogleClientForm
            status={status}
            variant="settings"
            onSaved={() => setEditing(false)}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : (
        <GoogleClientSummary status={status} />
      )}
    </SettingsPanel>
  );
};
