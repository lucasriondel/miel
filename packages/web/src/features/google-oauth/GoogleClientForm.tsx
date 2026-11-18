import type { FormEvent } from "react";
import { Notice } from "@/components/ui/notice";
import type { GoogleOAuthConfigStatus } from "../../api/types";
import { GoogleClientFields } from "./GoogleClientFields";
import { GoogleClientFormActions } from "./GoogleClientFormActions";
import { disconnectWarning } from "./googleClientDraft";
import { useGoogleClientForm } from "./useGoogleClientForm";

interface Props {
  status: GoogleOAuthConfigStatus;
  /** The onboarding gate's one full-width action, or a settings card's Save and Cancel. */
  variant: "gate" | "settings";
  onSaved?: () => void;
  /** Settings only: shut the form without saving. */
  onCancel?: () => void;
}

/**
 * The Google OAuth client, entered in the app (A15): the onboarding gate's
 * Google step and the Settings card mount this one form, so the rules — what
 * may be saved, which field a refusal belongs to, the confirm a change of
 * client needs — exist once.
 *
 * A saved client takes effect on the next sign-in; nothing restarts.
 */
export const GoogleClientForm = ({ status, variant, onSaved, onCancel }: Props) => {
  const form = useGoogleClientForm(status, onSaved);
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    form.submit();
  };
  return (
    <form noValidate onSubmit={onSubmit} aria-label="Google OAuth client" className="w-full">
      <GoogleClientFields status={status} form={form} />
      {form.warning > 0 ? (
        <Notice variant="warning" className="mt-4 text-[13px]">
          {disconnectWarning(form.warning)}
        </Notice>
      ) : null}
      {form.formError ? (
        <p role="alert" className="mt-3 text-left text-xs text-gousse-high">
          {form.formError}
        </p>
      ) : null}
      <GoogleClientFormActions variant={variant} form={form} onCancel={onCancel} />
    </form>
  );
};
