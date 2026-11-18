import { useState } from "react";
import { apiBase } from "../../config";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { useSaveGoogleOAuthClient } from "../../api/googleOAuthConfig.hooks";
import type { GoogleOAuthConfigStatus } from "../../api/types";
import {
  canKeepSecret,
  defaultRedirectUri,
  draftIsSavable,
  fieldRefusal,
  initialDraft,
  mailboxesDisconnected,
  toSaveInput,
  type FieldRefusal,
  type GoogleClientDraft,
  type GoogleClientField,
} from "./googleClientDraft";

/**
 * One Google client form's state: the draft, the save, which field the server
 * refused, and the two-press confirm a change of client needs — the first
 * press shows how many mailboxes it disconnects, the second ("Save anyway")
 * saves. Editing the client ID takes the confirm back, since the count was
 * about the ID the user had typed then.
 */
export function useGoogleClientForm(status: GoogleOAuthConfigStatus, onSaved?: () => void) {
  const [draft, setDraft] = useState<GoogleClientDraft>(() =>
    initialDraft(status, defaultRedirectUri(status, apiBase, window.location.origin)),
  );
  const [armed, setArmed] = useState(false);
  const [refusal, setRefusal] = useState<FieldRefusal | null>(null);
  const save = useSaveGoogleOAuthClient();

  const disconnects = mailboxesDisconnected(status, draft);

  const setField = (field: GoogleClientField, value: string) => {
    setDraft((d) => ({ ...d, [field]: value }));
    if (field === "clientId") setArmed(false);
    if (refusal?.field === field) setRefusal(null);
  };

  const submit = () => {
    if (!draftIsSavable(status, draft) || save.isPending) return;
    if (disconnects > 0 && !armed) {
      setArmed(true);
      return;
    }
    setRefusal(null);
    save.mutate(toSaveInput(draft), {
      onSuccess: () => {
        setArmed(false);
        setDraft((d) => ({ ...d, clientSecret: "" }));
        onSaved?.();
      },
      onError: (err) => setRefusal(fieldRefusal(err)),
    });
  };

  const fieldError = (field: GoogleClientField) =>
    refusal?.field === field ? refusal.message : null;
  // A failure no field owns — the server unreachable, a 500 — goes under the button.
  const formError = save.error && !refusal ? apiErrorMessage(save.error) : null;

  return {
    draft,
    setField,
    submit,
    savable: draftIsSavable(status, draft),
    pending: save.isPending,
    keepsSecret: canKeepSecret(status, draft),
    /** Mailboxes the save would disconnect, shown once the first press asked. */
    warning: armed ? disconnects : 0,
    confirming: armed && disconnects > 0,
    fieldError,
    formError,
  };
}

export type GoogleClientForm = ReturnType<typeof useGoogleClientForm>;
