import { useEffect, useState, type ReactNode } from "react";
import type { Provider } from "@miel/core/providerModels";
import { PROVIDER_LABELS } from "@miel/core/providerModels";
import { ProviderMark } from "@/components/ui/provider-mark";
import { Spinner } from "@/components/ui/spinner";
import { AppButton } from "../../components/AppButton";
import { useCredential } from "../../api/useCredential";
import { cn } from "@/lib/utils";
import { CredentialEditor } from "./CredentialEditor";
import { CredentialStatus } from "./CredentialStatus";
import { CREDENTIAL_COPY } from "./credentialCopy";

interface Props {
  provider: Provider;
  /**
   * Where to get one, in place of the copy table's own line. Optional: the
   * row says where a credential comes from with `CREDENTIAL_COPY` unless a
   * caller has something more specific to say.
   */
  footnote?: ReactNode;
}

/**
 * One provider's credential, as a row of the Providers card (`miel.figcraft`,
 * Settings › AI): its mark and name, and then one of three shapes.
 *
 * - Stored: the masked hint under the name, a green Connected pill, Remove.
 * - Unset: Add key (or Add token) and nothing else — no dead field sitting in a
 *   row nobody has asked to fill.
 * - Adding: the row tints and opens the editor under its name.
 *
 * What is miel's stays the same as before the redesign: `useCredential` for the
 * lifecycle (#135) and `CREDENTIAL_COPY` for the words. A refused save keeps
 * the editor open with the draft in it and the reason under it — the failure is
 * `useCredential`'s one `error`, so there is no second line to keep in step.
 */
export const CredentialTile = ({ provider, footnote }: Props) => {
  const credential = useCredential(provider);
  const copy = CREDENTIAL_COPY[provider];
  const label = PROVIDER_LABELS[provider];
  const [adding, setAdding] = useState(false);
  // A stored credential closes the editor: that was the point of opening it.
  useEffect(() => {
    if (credential.configured) setAdding(false);
  }, [credential.configured]);
  const editing = adding && !credential.configured;

  return (
    <fieldset
      aria-label={label}
      className={cn("m-0 flex min-w-0 flex-col gap-3 px-4 py-3.5", editing && "bg-gousse-bg/60")}
    >
      <div className="flex items-center gap-3">
        <ProviderMark
          provider={provider}
          label={label}
          className="size-7 rounded-[7px] border border-gousse-line bg-gousse-panel dark:bg-gousse-panel [&_svg]:size-4"
        />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-gousse-ink">{label}</div>
          {credential.configured && credential.hint ? (
            <div className="truncate font-mono text-xs text-gousse-muted">{credential.hint}</div>
          ) : null}
          {credential.configured && !credential.hint ? (
            <div className="text-xs text-gousse-muted">Stored</div>
          ) : null}
        </div>
        {credential.loading ? (
          <Spinner size={14} />
        ) : credential.configured ? (
          <>
            <CredentialStatus />
            <AppButton
              disabled={credential.clearing}
              onClick={credential.clear}
              aria-label={credential.clearing ? "Removing…" : `Remove ${copy.noun}`}
              className="border-gousse-high-border text-gousse-high-ink hover:border-gousse-high-border hover:bg-gousse-high-bg"
            >
              {credential.clearing ? "Removing…" : "Remove"}
            </AppButton>
          </>
        ) : editing ? null : (
          <AppButton onClick={() => setAdding(true)}>Add {copy.noun}</AppButton>
        )}
      </div>

      {editing ? (
        <CredentialEditor credential={credential} copy={copy} onCancel={() => setAdding(false)} />
      ) : null}

      {!editing && !credential.configured && footnote ? (
        <div className="text-xs text-gousse-muted sm:pl-10">{footnote}</div>
      ) : null}

      {credential.error ? (
        <p role="alert" className="text-xs text-gousse-error sm:pl-10">
          {credential.error}
        </p>
      ) : null}
    </fieldset>
  );
};
