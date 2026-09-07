import { useState } from "react";
import { Check, X } from "lucide-react";
import type { SavedPromo } from "../../api/types";
import { useUpdateSavedPromo } from "../../api/mutations";
import { promoDraft, promoDraftIsSavable, promoPatch, type PromoDraft } from "./savedPromoDraft";

interface Props {
  promo: SavedPromo;
  /** Called when the row is done being edited, saved or not. */
  onDone: () => void;
}

const FIELD_CLASS =
  "w-full min-w-24 rounded-lg border border-gousse-line bg-gousse-bg px-2 py-1 text-sm text-gousse-ink outline-none focus:border-gousse-ink/40";

/**
 * The five guesses, in the row they are shown in (#164).
 *
 * Inline rather than in a dialog because the correction is almost always read
 * off the row next to it — the merchant is wrong because the sender was
 * `email.marketing-cloud.zara.com`, the terms ran into the discount — so the
 * boxes sit in the cells whose values they hold, and the columns stay aligned
 * with the rows above and below.
 *
 * **All five are editable, and that is the point rather than a convenience.**
 * They are the model's answers on deliberately slippery marketing prose, so
 * locking any subset guarantees the locked one is the field it got wrong. What
 * is not here is the copy of the mail: those columns are a record of what a
 * shop actually said, there is no box for them, and the server refuses a
 * request that names one.
 *
 * The account is not a field either — it is where the mail arrived, not a
 * guess — so it stays plain text through the edit.
 */
export const SavedPromoEditRow = ({ promo, onDone }: Props) => {
  const [draft, setDraft] = useState<PromoDraft>(() => promoDraft(promo));
  const update = useUpdateSavedPromo();

  const set = (field: keyof PromoDraft, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = () => {
    if (!promoDraftIsSavable(draft)) return;
    const patch = promoPatch(promo, draft);
    // A save that changed nothing costs no request: the answer would be the row
    // as it already is.
    if (patch) update.mutate({ promoId: promo.id, fields: patch });
    onDone();
  };

  // Enter saves and Escape abandons, because a row of five boxes with the
  // caret in one of them is a form even though a `<form>` cannot be a `<tr>`.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") save();
    if (event.key === "Escape") onDone();
  };

  const box = (field: keyof PromoDraft, label: string, type = "text") => (
    <input
      type={type}
      aria-label={label}
      value={draft[field]}
      onChange={(event) => set(field, event.target.value)}
      onKeyDown={onKeyDown}
      className={FIELD_CLASS}
    />
  );

  return (
    <tr className="border-t border-gousse-line bg-gousse-bg/40 align-top">
      <td className="px-3 py-2">{box("merchant", "Merchant")}</td>
      <td className="px-3 py-2">{box("discount", "Offer")}</td>
      <td className="px-3 py-2">{box("code", "Code")}</td>
      <td className="px-3 py-2">{box("terms", "Terms")}</td>
      <td className="px-3 py-2">{box("expiresAt", "Expires", "date")}</td>
      {/* Where the mail arrived, not a guess — so there is nothing to correct. */}
      <td className="px-3 py-2 text-gousse-muted">{promo.accountEmail}</td>
      <td className="px-3 py-2">
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            aria-label="Save changes"
            title="Save changes"
            onClick={save}
            disabled={!promoDraftIsSavable(draft)}
            className="inline-flex items-center gap-1.5 rounded-full border border-gousse-line bg-gousse-panel px-3 py-1 text-xs font-bold text-gousse-ink transition-[background-color,transform] hover:bg-gousse-ink/10 active:scale-[0.97] disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden />
            Save
          </button>
          <button
            type="button"
            aria-label="Cancel editing"
            title="Cancel editing"
            onClick={onDone}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gousse-muted transition-[background-color,color,transform] hover:bg-gousse-ink/10 hover:text-gousse-ink active:scale-95"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  );
};
