import { useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { useForgetGoogleOAuthClient } from "../../api/googleOAuthConfig.hooks";
import type { GoogleOAuthConfigStatus } from "../../api/types";
import { AppButton } from "../../components/AppButton";
import { disconnectWarning } from "../google-oauth/googleClientDraft";
import { SettingsRow } from "./SettingsRow";

/**
 * Forgetting the client saved in miel, confirmed in place: the server's
 * environment client, if it has one, is in effect again — a different client,
 * so the confirm carries the same disconnect warning a save does.
 */
export const GoogleClientForgetAction = ({ status }: { status: GoogleOAuthConfigStatus }) => {
  const [confirming, setConfirming] = useState(false);
  const forget = useForgetGoogleOAuthClient();
  const count = status.accountsToReconnect;

  return (
    <SettingsRow
      title="Forget this client"
      description={
        <>
          {confirming
            ? count > 0
              ? disconnectWarning(count)
              : "The server's environment client, if it has one, takes over."
            : "Falls back to the server's environment client, if it has one."}
          {forget.error ? (
            <span role="alert" className="mt-0.5 block text-gousse-error">
              Failed to forget: {apiErrorMessage(forget.error)}
            </span>
          ) : null}
        </>
      }
      control={
        confirming ? (
          <>
            <AppButton
              tone="danger"
              disabled={forget.isPending}
              onClick={() => forget.mutate(undefined, { onSuccess: () => setConfirming(false) })}
            >
              {forget.isPending ? <Spinner size={12} /> : null}
              Forget
            </AppButton>
            <AppButton
              tone="ghost"
              disabled={forget.isPending}
              onClick={() => setConfirming(false)}
            >
              Cancel
            </AppButton>
          </>
        ) : (
          <AppButton onClick={() => setConfirming(true)}>Forget</AppButton>
        )
      }
    />
  );
};
