import type { ReactNode } from "react";
import { SavedFlash } from "@/components/ui/saved-flash";
import { Select } from "@/components/ui/select";
import { SettingRow } from "@/components/ui/setting-row";

/**
 * "Which provider, and which of its models, runs this task" — one row of a
 * settings card, two selects and a save tick.
 *
 * Two selects rather than one flat list of every provider's models: the pair is
 * the shape of the decision (whose engine, then which of theirs), and a single
 * list grows past a scannable length the moment a second provider is added.
 *
 * Native `<select>` on purpose. A model list is plain text with no icons, no
 * grouping and no multi-select, so the OS picker is the better control — it
 * gets the phone's native wheel and the desktop's type-ahead for free, and no
 * popover of ours can match either.
 *
 * Fully controlled and autosaving: there is no submit button, so `onProviderChange`
 * and `onModelChange` are expected to persist immediately and report back
 * through `saving`/`saved`/`error`. Changing the *provider* usually means the
 * current model id no longer exists — let the server pick that provider's
 * default and echo it back rather than guessing here.
 *
 * `children` unfolds under the description: use it for the "this provider has
 * no key yet" field, and set `alignTop` so the selects stay level with the
 * title instead of drifting to the middle of the grown row.
 */

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderOption {
  id: string;
  label: string;
}

export function ModelRow({
  title,
  description,
  provider,
  providers,
  model,
  models,
  onProviderChange,
  onModelChange,
  disabled = false,
  saving = false,
  saved = false,
  error,
  alignTop = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  /** Selected provider id. */
  provider: string;
  /** Providers offered — normally only those with a stored credential. */
  providers: readonly ProviderOption[];
  /** Selected model id. */
  model: string;
  /** Models the selected provider offers. */
  models: readonly ModelOption[];
  onProviderChange?: (provider: string) => void;
  onModelChange?: (model: string) => void;
  disabled?: boolean;
  saving?: boolean;
  saved?: boolean;
  error?: string | null;
  alignTop?: boolean;
  children?: ReactNode;
}) {
  return (
    <SettingRow
      title={title}
      description={description}
      alignTop={alignTop || Boolean(children)}
      control={
        <>
          <div className="flex gap-2">
            <Select
              aria-label={`${title} provider`}
              disabled={disabled || saving}
              value={provider}
              onChange={(e) => {
                if (e.target.value !== provider) onProviderChange?.(e.target.value);
              }}
              className="w-40 disabled:opacity-60"
            >
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </Select>
            <Select
              aria-label={`${title} model`}
              disabled={disabled || saving}
              value={model}
              onChange={(e) => onModelChange?.(e.target.value)}
              className="w-52 disabled:opacity-60"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </div>
          <SavedFlash saving={saving} saved={saved && !error} error={error} />
        </>
      }
    >
      {children}
    </SettingRow>
  );
}
