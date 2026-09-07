import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUpdateWorpSettings } from "../../api/worpSettings.hooks";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { SavedFlash } from "@/components/ui/saved-flash";
import { SettingRow } from "@/components/ui/setting-row";

interface Props {
  baseUrl: string;
}

/**
 * Where worp lives. Not a secret, so unlike the key it is shown in full and
 * edited in place.
 *
 * Saved explicitly rather than on blur: the field is one half of the gate that
 * turns the relay on, and a half-typed hostname autosaving would flip worp on
 * against a host that does not exist. Clearing it is how worp is turned off.
 */
export const WorpBaseUrlRow = ({ baseUrl }: Props) => {
  const save = useUpdateWorpSettings();
  const [draft, setDraft] = useState(baseUrl);

  const dirty = draft.trim() !== baseUrl;
  const submit = () => {
    if (!dirty || save.isPending) return;
    save.mutate({ baseUrl: draft.trim() });
  };

  return (
    <SettingRow
      title="Base URL"
      description="Your worp instance, e.g. https://worp.example.com. Clear it to turn the relay off."
      alignTop
      control={
        <SavedFlash
          saving={save.isPending}
          saved={save.isSuccess && !dirty}
          error={save.isError ? apiErrorMessage(save.error) : null}
        />
      }
    >
      <div className="mt-2 flex max-w-md gap-2">
        <Input
          type="url"
          value={draft}
          placeholder="https://worp.example.com"
          aria-label="worp base URL"
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
        <Button variant="primary" disabled={save.isPending || !dirty} onClick={submit}>
          Save
        </Button>
      </div>
    </SettingRow>
  );
};
