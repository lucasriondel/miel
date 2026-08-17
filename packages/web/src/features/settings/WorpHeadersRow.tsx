import { Button } from "@/components/ui/button";
import { useUpdateWorpSettings } from "../../api/worpSettings.hooks";
import { apiErrorMessage } from "../../api/apiErrorMessage";
import { SavedFlash } from "@/components/ui/saved-flash";
import { SettingRow } from "@/components/ui/setting-row";
import { WorpHeaderRow } from "./WorpHeaderRow";
import { useWorpHeaderDraft } from "./useWorpHeaderDraft";
import type { DraftHint } from "./worpHeaderDraft";
import type { MaskedHeader } from "../../api/types";

interface Props {
  extraHeaders: MaskedHeader[];
}

/**
 * Extra headers sent when reaching worp through a proxy.
 *
 * Generic rather than a pair of Cloudflare fields, because CF Access is not
 * worp config: CF validates its header pair and strips it at the edge, so worp
 * only ever sees its own bearer. Authelia, oauth2-proxy or a plain shared
 * secret work the same way with no new code (#107). The CF pair gets a
 * shortcut button so the common case is two pastes and no spelling from memory.
 *
 * What goes out is a patch over what is stored, so a save says only what the
 * user changed — removing a header does not mean retyping the ones being kept,
 * and it cannot delete a header this page never saw (#119).
 */
export const WorpHeadersRow = ({ extraHeaders }: Props) => {
  const save = useUpdateWorpSettings();
  const draft = useWorpHeaderDraft(extraHeaders);

  const patch = draft.patch;
  const submit = () => {
    if (patch === null || save.isPending) return;
    save.mutate({ extraHeaders: patch }, { onSuccess: (data) => draft.reset(data.extraHeaders) });
  };

  return (
    <SettingRow
      title="Extra headers"
      description="Sent with every relay, after worp's own Authorization. Only needed when worp sits behind a proxy such as Cloudflare Access."
      alignTop
      control={
        <SavedFlash
          saving={save.isPending}
          saved={save.isSuccess}
          error={save.isError ? apiErrorMessage(save.error) : null}
        />
      }
    >
      {draft.rows.map((row) => (
        <WorpHeaderRow
          key={row.id}
          row={row}
          problem={draft.rowProblems[row.id] ?? null}
          disabled={save.isPending}
          onChange={(p) => draft.update(row.id, p)}
          onRemove={() => draft.remove(row.id)}
        />
      ))}

      <WorpHeaderHints hint={draft.hint} hasStored={extraHeaders.length > 0} />

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="ghost" disabled={save.isPending} onClick={() => draft.add()}>
          Add header
        </Button>
        <Button variant="ghost" disabled={save.isPending} onClick={draft.addCloudflareAccess}>
          Behind Cloudflare Access
        </Button>
        {/* Disabled exactly when there is no patch — which is exactly when the
            hint above says why, because `reviewDraft` decides both at once. */}
        <Button variant="primary" disabled={save.isPending || patch === null} onClick={submit}>
          Save headers
        </Button>
      </div>
    </SettingRow>
  );
};

/**
 * Why the save button is off, when it is, plus the one standing fact that
 * explains the empty value fields. Stated rather than left to be inferred: a
 * dead button with no explanation reads as a bug, and the explanation this row
 * used to give — retype every value or remove a header — was advice the editor
 * itself refused to take.
 */
const WorpHeaderHints = ({ hint, hasStored }: { hint: DraftHint | null; hasStored: boolean }) => (
  <>
    {hasStored ? (
      <p className="mt-2 text-xs text-gousse-muted">
        Stored values are never sent back to the browser. Leave one blank to keep it as it is, or
        remove the row to delete that header.
      </p>
    ) : null}
    {hint ? (
      <p
        className={`mt-2 text-xs ${hint.tone === "problem" ? "text-gousse-high" : "text-gousse-muted"}`}
      >
        {hint.text}
      </p>
    ) : null}
  </>
);
