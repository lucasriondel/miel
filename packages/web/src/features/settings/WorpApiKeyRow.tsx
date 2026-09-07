import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateWorpSettings } from "../../api/worpSettings.hooks";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { SavedFlash } from "@/components/ui/saved-flash";
import { SettingRow } from "@/components/ui/setting-row";
import type { SecretStatus } from "../../api/types";

interface Props {
  apiKey: SecretStatus;
}

/**
 * worp's bearer token: paste it, see that it is there, clear it.
 *
 * Write-only, like a provider key (#104) and for the same reason — it is stored
 * encrypted server-side and the browser is only ever told that it exists, plus
 * enough of it to tell two apart when rotating.
 */
export const WorpApiKeyRow = ({ apiKey }: Props) => {
  const save = useUpdateWorpSettings();
  const [draft, setDraft] = useState("");

  const submit = () => {
    const trimmed = draft.trim();
    if (trimmed.length === 0 || save.isPending) return;
    save.mutate({ apiKey: trimmed }, { onSuccess: () => setDraft("") });
  };

  const description = apiKey.configured
    ? `Key ${apiKey.hint ?? "stored"} — sent to worp as a bearer token. Stored encrypted on the server.`
    : "No key stored. Paste worp's API key. It is stored encrypted on the server and never shown again.";

  return (
    <SettingRow
      title="API key"
      description={description}
      alignTop
      control={
        <>
          <SavedFlash
            saving={save.isPending}
            saved={false}
            error={save.isError ? apiErrorMessage(save.error) : null}
          />
          {apiKey.configured ? (
            <Button
              variant="danger"
              disabled={save.isPending}
              onClick={() => save.mutate({ apiKey: null })}
            >
              Clear key
            </Button>
          ) : null}
        </>
      }
    >
      <div className="mt-2 flex max-w-md gap-2">
        <Input
          type="password"
          value={draft}
          placeholder={apiKey.configured ? "Paste a new key to replace it" : "worp API key"}
          aria-label="worp API key"
          autoComplete="off"
          spellCheck={false}
          disabled={save.isPending}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
          }}
          className="flex-1 font-mono"
        />
        <Button
          variant="primary"
          disabled={save.isPending || draft.trim().length === 0}
          onClick={submit}
        >
          Save
        </Button>
      </div>
    </SettingRow>
  );
};
