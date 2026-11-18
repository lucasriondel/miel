import { useId } from "react";
import { Input } from "@/components/ui/input";
import type { GoogleOAuthConfigStatus } from "../../api/types";
import { GoogleClientField } from "./GoogleClientField";
import { GOOGLE_CLIENT_INPUT } from "./googleClientFieldClass";
import { RedirectUriInput } from "./RedirectUriInput";
import type { GoogleClientForm } from "./useGoogleClientForm";

interface Props {
  status: GoogleOAuthConfigStatus;
  form: GoogleClientForm;
}

/**
 * The three boxes, stacked: the client ID, the secret — write-only, a stored
 * one described by its masked hint and kept when the box is left empty — and
 * the redirect URI to register.
 */
export const GoogleClientFields = ({ status, form }: Props) => {
  const id = useId();
  const secretPlaceholder =
    form.keepsSecret && status.secretHint
      ? `${status.secretHint} — leave empty to keep it`
      : "Paste the client secret";
  return (
    <div className="flex w-full flex-col gap-4">
      <GoogleClientField
        inputId={`${id}-client-id`}
        label="Client ID"
        error={form.fieldError("clientId")}
      >
        <Input
          id={`${id}-client-id`}
          value={form.draft.clientId}
          placeholder="1234-abc.apps.googleusercontent.com"
          autoComplete="off"
          spellCheck={false}
          disabled={form.pending}
          aria-invalid={form.fieldError("clientId") ? true : undefined}
          onChange={(e) => form.setField("clientId", e.target.value)}
          className={GOOGLE_CLIENT_INPUT}
        />
      </GoogleClientField>
      <GoogleClientField
        inputId={`${id}-client-secret`}
        label="Client secret"
        error={form.fieldError("clientSecret")}
      >
        <Input
          id={`${id}-client-secret`}
          type="password"
          value={form.draft.clientSecret}
          placeholder={secretPlaceholder}
          autoComplete="off"
          spellCheck={false}
          disabled={form.pending}
          aria-invalid={form.fieldError("clientSecret") ? true : undefined}
          onChange={(e) => form.setField("clientSecret", e.target.value)}
          className={GOOGLE_CLIENT_INPUT}
        />
      </GoogleClientField>
      <GoogleClientField
        inputId={`${id}-redirect-uri`}
        label="Redirect URI"
        helper="Filled in from your server URL — register it on the client as-is."
        error={form.fieldError("redirectUri")}
      >
        <RedirectUriInput
          id={`${id}-redirect-uri`}
          value={form.draft.redirectUri}
          disabled={form.pending}
          invalid={Boolean(form.fieldError("redirectUri"))}
          onChange={(value) => form.setField("redirectUri", value)}
        />
      </GoogleClientField>
    </div>
  );
};
