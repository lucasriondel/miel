import { useState } from "react";
import { Check } from "lucide-react";
import type { PromoListing } from "../../api/types";
import { useUpdateSavedPromo } from "../../api/mutations";
import { AppButton } from "../../components/AppButton";
import { promoDraft, promoDraftIsSavable, promoPatch, type PromoDraft } from "./savedPromoDraft";
import { PromoTicketField } from "./PromoTicketField";

interface Props {
  promo: PromoListing;
  /** Called when the correction is done, saved or not. */
  onDone: () => void;
}

/**
 * The five guesses, corrected in place of the ticket that shows them (#164).
 *
 * **All five are editable, and that is the point rather than a convenience.**
 * They are the model's answers on deliberately slippery marketing prose, so
 * locking any subset guarantees the locked one is the field it got wrong. What
 * is not here is the copy of the mail below: that is a record of what a shop
 * actually said, there is no box for it, and the server refuses a request that
 * names one.
 *
 * Editable is not the same as clearable: the offer and — since #168 — the code
 * of a promo that has one may be corrected but not emptied, which is
 * `promoDraftIsSavable`'s rule and the wire schema's. So Save is what refuses,
 * in place, rather than a request going out to be turned down. The mailbox is
 * not a field either — it is where the mail arrived, not a guess.
 */
export const PromoTicketEditor = ({ promo, onDone }: Props) => {
  const [draft, setDraft] = useState<PromoDraft>(() => promoDraft(promo));
  const update = useUpdateSavedPromo();
  const savable = promoDraftIsSavable(promo, draft);

  const set = (field: keyof PromoDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = () => {
    if (!savable) return;
    const patch = promoPatch(promo, draft);
    // A save that changed nothing costs no request: the answer would be the
    // promo as it already is.
    if (patch) update.mutate({ promoId: promo.id, fields: patch });
    onDone();
  };

  // Enter saves and Escape abandons, the way a one-line form does.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") save();
    if (event.key === "Escape") onDone();
  };

  const field = (key: keyof PromoDraft, label: string, type?: "date") => (
    <PromoTicketField
      label={label}
      value={draft[key]}
      onChange={set(key)}
      onKeyDown={onKeyDown}
      type={type}
    />
  );

  return (
    <section
      aria-label="Correct the promo"
      className="flex flex-col gap-3 rounded-[14px] border border-gousse-line bg-gousse-bg p-5"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {field("merchant", "Merchant")}
        {field("discount", "Offer")}
        {field("code", "Code")}
        {field("expiresAt", "Expires", "date")}
      </div>
      {field("terms", "Terms")}
      <p className="text-xs text-gousse-muted">
        Arrived in {promo.accountEmail}. The email below is a record and is not edited.
      </p>
      <div className="flex items-center justify-end gap-2">
        <AppButton tone="ghost" size="sm" aria-label="Cancel editing" onClick={onDone}>
          Cancel
        </AppButton>
        <AppButton
          tone="primary"
          size="sm"
          aria-label="Save changes"
          onClick={save}
          disabled={!savable}
        >
          <Check aria-hidden />
          Save changes
        </AppButton>
      </div>
    </section>
  );
};
