import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ProviderMark } from "@/components/ui/provider-mark";
import { SecretField } from "@/components/ui/secret-field";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/gousse/utils";

/**
 * The credentials grid: one {@link CredentialTile} per AI provider, each
 * showing whether a key is stored and offering the field to store one.
 *
 * Fully controlled. The tile owns no draft state, fires no requests and knows
 * no provider catalogue — the app passes `configured`, `hint`, `draft` and the
 * handlers, and gets back a rendered tile. That is what lets the same tile
 * serve a settings page and an onboarding gate without a second implementation.
 */

/**
 * Whether a credential is stored, as a pill. The two states differ in **shape**
 * as well as hue — a filled dot for stored, a hollow ring for unset — so the
 * status survives being read in one colour.
 */
export function CredentialStatusPill({
  configured,
  className,
  configuredLabel = "Stored",
  unsetLabel = "Not set",
}: {
  configured: boolean;
  className?: string;
  configuredLabel?: string;
  unsetLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 rounded-full py-0.5 pl-1.5 pr-2 text-[11.5px] font-semibold",
        configured
          ? "bg-gousse-low/12 text-gousse-low"
          : "bg-gousse-muted/12 text-gousse-muted",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          configured ? "bg-current" : "ring-[1.5px] ring-inset ring-current",
        )}
      />
      {configured ? configuredLabel : unsetLabel}
    </span>
  );
}

interface CredentialTileProps extends Omit<ComponentProps<"fieldset">, "onChange"> {
  /** Provider id — drives the mark. Any string; unknown ids fall back. */
  provider: string;
  /** Human name of the provider, shown as the tile's heading. */
  label: string;
  /** What the credential *is* — "API key", "OAuth token". Sits under the name. */
  kind?: ReactNode;
  /** Mark for a provider gousse doesn't draw. See `ProviderMark`. */
  icon?: ReactNode;

  /** Whether a credential is already stored server-side. */
  configured?: boolean;
  /** Masked echo of the stored credential (`sk-…abc`). Never the secret itself. */
  hint?: string | null;
  /** Status is still being fetched — swaps the pill and the value slot for a spinner. */
  loading?: boolean;

  /** The draft being typed. Only meaningful while `configured` is false. */
  draft?: string;
  onDraftChange?: (value: string) => void;
  onSave?: () => void;
  onClear?: () => void;
  saving?: boolean;
  clearing?: boolean;
  error?: string | null;

  /** Where to get a key, shown only while unset. Swapped for a reassurance once stored. */
  footnote?: ReactNode;
  /** Reassurance shown in the footnote's place once a credential is stored. */
  storedNote?: ReactNode;

  fieldLabel?: string;
  placeholder?: string;
  submitLabel?: string;
  clearLabel?: string;
}

export function CredentialTile({
  provider,
  label,
  kind,
  icon,
  configured = false,
  hint,
  loading = false,
  draft = "",
  onDraftChange,
  onSave,
  onClear,
  saving = false,
  clearing = false,
  error,
  footnote,
  storedNote = "Stored encrypted on the server",
  fieldLabel,
  placeholder,
  submitLabel,
  clearLabel = "Clear",
  className,
  ...props
}: CredentialTileProps) {
  return (
    // A `<fieldset>`, not a `<div>`: the tile groups a labelled input with the
    // buttons that act on it, which is the element's whole job. Its `aria-label`
    // names the group so a screen reader reaching the field knows whose key it is.
    <fieldset
      aria-label={label}
      className={cn(
        "flex h-full min-w-0 flex-col gap-2.5 rounded-2xl border bg-gousse-panel p-3.5 shadow-gousse-sm transition-[border-color,box-shadow] hover:shadow-gousse-md",
        // The border is the tile's state, read before any text is: red for a
        // failure, green once stored, quiet-until-hovered while it waits.
        error
          ? "border-gousse-high/45"
          : configured
            ? "border-gousse-low/40 hover:border-gousse-low/60"
            : "border-gousse-line hover:border-gousse-accent/45",
        className,
      )}
      {...props}
    >
      <div className="flex items-start justify-between gap-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProviderMark provider={provider} label={label} icon={icon} />
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gousse-ink">{label}</div>
            {kind ? <div className="text-[11px] text-gousse-muted">{kind}</div> : null}
          </div>
        </div>
        {loading ? <Spinner size={14} /> : <CredentialStatusPill configured={configured} />}
      </div>

      {/* A fixed floor so a stored tile and an unset one stand the same height,
          and a grid row doesn't jump as each status resolves. */}
      <div className="flex min-h-[34px] items-center">
        {loading ? null : configured ? (
          <span className="truncate font-mono text-xs text-gousse-ink">{hint ?? "stored"}</span>
        ) : (
          <SecretField
            layout="stacked"
            value={draft}
            onChange={onDraftChange ?? (() => {})}
            onSubmit={onSave ?? (() => {})}
            label={fieldLabel ?? `${label} credential`}
            placeholder={placeholder}
            submitLabel={submitLabel ?? "Save"}
            pending={saving}
          />
        )}
      </div>

      {error ? (
        <p role="alert" className="text-xs text-gousse-high">
          {error}
        </p>
      ) : null}

      {/* `mt-auto` pins this to the bottom so every tile in a row shares a baseline. */}
      <div className="mt-auto flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[11px] text-gousse-muted">
          {configured ? storedNote : footnote}
        </span>
        {configured && onClear ? (
          <Button variant="danger" disabled={clearing} onClick={onClear} className="flex-none">
            {clearing ? "Clearing…" : clearLabel}
          </Button>
        ) : null}
      </div>
    </fieldset>
  );
}

/**
 * The grid the tiles sit in. Two columns from `sm` up, fixed rather than
 * auto-fit: four providers land 2×2, where an auto-fit track would wrap 3+1 at
 * some widths and orphan the last one.
 */
export function CredentialGrid({ className, ...props }: ComponentProps<"div">) {
  return (
    <div className={cn("grid grid-cols-1 gap-3 sm:grid-cols-2", className)} {...props} />
  );
}
