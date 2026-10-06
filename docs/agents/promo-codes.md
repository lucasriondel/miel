# Promo codes

## Extracting promo codes

`services/promoCodes.ts` owns the prefilter call and the extraction, and `sync/fetchPhase.ts` calls it right after `stepUpsertAndLink`, because a promo row is keyed to its message.

- **New messages only, once.** The phase hands over what the fetch just upserted. No backfill and deliberately **no extraction-attempted marker** — nothing asks twice, so "found nothing" and "never asked" need no recording. The feature fills forward; adding backfill later means re-extracting a range wholesale.
- **One mail per model call.** A batch invites the model to attribute one shop's code to another. Cost is the prefilter's job; `EXTRACT_CONCURRENCY` bounds concurrency and is deliberately not a setting.
- **One text, two readers.** The prefilter and the model read the same string — the HTML part stripped by `util/htmlText.ts` when there is one, the plain part otherwise. HTML is preferred because a marketing mail's text/plain part is routinely a "view in browser" stub.
- **Two classes of failure.** A malformed answer on one mail is logged and skipped. A provider that cannot run propagates through `sync/providerFailure.ts`, like triage and filter-suggest. Cost: an extraction whose provider cannot run loses the sync even when triage's provider is fine.
- **A promo row is a code** (#166). An offer needing none produces no row. The prompt says so, and `toRows`, the seam both write paths build rows through, drops any that comes back, so sync and the on-demand run answer the same. `code` stays nullable in the output contract and the column on purpose: a non-nullable field would make a code-less entry a schema violation that fails the whole mail — it is a **skipped entry, never a failed extraction**. Older rows with a null code still exist (see *Rows written before the code rule*).
- **No new sync socket event.** It is a step inside fetch; its failures ride in the sync window's error list.

What is stored is a *suggestion* — `savedAt` null until the user acts — with the expiry (`YYYY-MM-DD`) written at end-of-day UTC through `promoExpiry.ts`, and `merchant` falling back to the sender's display name. The extraction stays absent from `index.ts`, like `promoPrefilter.ts`.

## Asking one message for its promo codes

The message page's Promo Codes panel asks one mail on demand (#165): `POST /messages/:accountId/:gmailMessageId/extract-promos` → `extractPromosForMessageEffect` → `features/message-detail/PromoCodePanel.tsx`. Same task and prompt as the sync's, with three deliberate differences:

- **No prefilter.** A user pressing the button is the decision to spend a call, and the mail the prefilter skipped is precisely when they would press it.
- **Asking again replaces.** It clears the message's unsaved rows before writing (`PromoStore.removeUnsavedForMessage`, rule: `isNull(savedAt)`). A guess never overwrites a decision — the saved row carries the only surviving copy of a mail the save trashed. A run that finds nothing clears too.
- **Both classes of failure reach the caller.** A provider that cannot run surfaces as the usual `ProviderUnavailableError` → 503.

The route is a sibling of `filter-suggest`: it acts on a *message*, and before it runs there may be no promo to name. It takes no body. The panel sits under `TriagePanel` and is always drawn — being askable is the feature. The mutation is not optimistic (its content is unpredictable); it invalidates `["promo-suggestions"]` and reads its own result rather than that cache.

## Promo suggestions above the inbox

A horizontally scrolling row of cards above the message list, under the filter suggestions and the verification-code strip, gone when there is nothing to suggest (#160).

`listPromoSuggestionsEffect` in `services/promoCodes.ts` owns the rules, split with `PromoStore`. Storage's rules are the read model: unsaved only, one account, and the mailbox rule — an unsaved detection whose mail was archived, trashed or removed follows it out (hence `unsaved` joins `messages`). The section's rules: an expired promo is not a suggestion (an unstated expiry is not expired, and the stored instant is end-of-day, so a promo lapsing today shows all day); a repeated code is one card, deduped *before* the cap; `MAX_PROMO_SUGGESTIONS` caps it. A row with no code passes through the dedupe unfolded (legacy rows only). `now` is a parameter so "expired" is assertable. The Promise facade is in `stores/seam.test.ts`'s `SEAMED_SERVICES`. The codes past the cap are reachable on the Promo Codes page (`listSuggestedPromosEffect`, below).

`GET /promo-codes` is its own endpoint and `["promo-suggestions", params]` its own query key, not an array widened onto the listed-message payload: different lifetimes and invalidation, and that payload is sent for every row. Scoping is done by passing the period to the server — the list payload has no bodies and therefore no promos.

Because the key is separate, list invalidation does not reach it: archive, trash and the bulk action name it in `alsoInvalidate` (`api/mutations.ts`), which is what makes the mailbox rule true on screen. The page's suggestions sit under the **same** root — `["promo-suggestions", "all"]` — so the optimistic removal (a `setQueriesData` over the root) and the one `alsoInvalidate` entry cover both lists.

Nothing is shared with the verification-code strip (browser-side regex over subject and snippet). A promo code is deep inside the HTML, so this reads a server-side extraction; cards, not pills; a promo's own expiry is its age rule. The strip stays above the cards — a verification code is worth minutes. Both are hidden in select mode.

`features/promos/promoExpiryLabel.ts` is pinned to UTC — read in a local zone, the stored `…T23:59:59.999Z` would show as the next day east of Greenwich — and answers "No end date" rather than inventing one.

Bun module mocks are process-global, so a suite whose seam is `fetch` inherits whichever `api/client` stub ran last. `promoSuggestionsWiring.test.tsx` restores the real client by importing `"../../api/client.ts?real"` (declared in `vite-env.d.ts`) and re-registering it *spread*, since a module namespace object registers as no replacement at all.

## Saving a promo, and trashing its mail

One button does both (#161), and the **order between the two writes is the feature**: `savePromoEffect` writes the saved state with its denormalised copy of the mail *first*, then calls the same `trashMessageEffect` every other caller uses. A refused trash leaves the promo saved (recoverable); the reverse order could delete the mail and lose the code. This deliberately departs from the apply service's Gmail-first guarantee, and is why it is a core service (`POST /promo-codes/:id/save` validates and delegates). Trash, not permanent delete: deleting needs the full-mailbox scope re-consented by every account, and the local copy is permanent anyway. The copy is taken from the `messages` row.

`trashedThreadId: null` says the trash did not happen. An already-saved row keeps the record it was saved with and only retries the trash.

On screen the card and the row leave on the click and come back together if refused, through `api/messageMutation.ts`'s `optimisticSide` — one more list-shaped cache cancelled, snapshotted, written and rolled back with the message lists. The plan drops every suggestion of that mail. A save whose trash was refused re-reads the lists and says so. `mutations.savePromo.test.ts` covers that branch; the click, removal and refusal are rendered in `promoSuggestionsWiring.test.tsx`.

## The Promo Codes page

`pages/PromoCodesPage.tsx` at **`/promo-codes`**, a top-level route with a sidebar footer entry (#162). Global, not account-scoped — the mailbox is a **column**, never a filter. Being outside `/account` keeps it clear of `App`'s `isAccountScope` redirect.

`listSavedPromosEffect` owns the rules, `now` a parameter. Active is soonest-expiring first, no-expiry last among them; expired sits below, greyed, most recently lapsed first, and is **never** deleted — deletion is always the user's act. Both sorts are stable over the store's order. Nothing is deduped: two saves are two decisions.

Above those sits **Suggested** — every detection nobody acted on, the overflow of the inbox section's cap. `listSuggestedPromosEffect` is the *suggestions* read with no account and no cap; everything else (unsaved, mailbox rule, unexpired, one row per code, newest first) is the same server-side answer. It renders nothing when empty, and the page's empty state waits for all three sections to be empty.

A suggested row has one control, the save, plus copying. No original-mail view (no copy exists until a save writes one), no edit (guesses become corrigible once kept), no remove (that would be a *dismissal*, an act this feature does not have).

`PromoStore.unsaved()` and `.saved()` both answer `PromoCodeWithAccount` — the row plus `accountEmail`, joined in both adapters, because the row shape is what the seam promises. `PromoWorld.account()` hands back `{ id, email }` for the same reason. On `PromoSuggestionFilter` every field is optional: account + window is the inbox, neither is the page.

The list payload omits the copy of the mail (it would send every saved mail's HTML to draw five short fields).

`GET /promo-codes/saved` and `GET /promo-codes/suggested` take no parameters; `["saved-promos"]` is its own key. The page makes **two** requests because a mail leaving the inbox moves the suggestions, an edit moves the saved rows, and only the save moves both — which is why it alone names `["saved-promos"]` in `alsoInvalidate` beside the suggestions root. The save's effect on the saved sections is a re-read, since the section is decided by the server's clock.

`promoCodesPageWiring.test.tsx` renders the page with `fetch` stubbed and unseeded requests refused, and mounts `App` at the route to show the default-account redirect leaves it alone.

## Taking the code, and reading the mail it came from

Neither changes the promo (#163).

**Copy** is `features/promos/CopyPromoCodeButton.tsx`: the code chip *is* the button. No request, no flag, no timestamp — nothing knows whether a code was redeemed, so a "used" mark would lie. Confirmation is local and transient ("Copied"). A browser that refuses the clipboard raises a toast.

**View the original** reads the *copy the save took*, never the `messages` row: `readSavedPromoMailEffect` behind `GET /promo-codes/:id/original`. The save trashed the original and Gmail purges trash after a month, so this is often the only version left. An unsaved promo has no copy and answers the same 404 an unknown id does — a viewer must never draw an empty mail.

`usePromoOriginalMail(id)` is disabled until `ViewOriginalMailButton` opens a dialog; `["promo-original", id]` has `staleTime: Infinity` and nothing invalidates it. `SavedPromoMailBody` renders the stored HTML, falling back to stored text, with **no HTML/Text toggle**. The remote-images preference still applies — the images are still hosted by the sender. The dialog is read-only; the endpoint has no writer.

## Correcting a promo, and removing one

The guesses are editable, the record is not (#164).

`PATCH /promo-codes/:id` edits **all five** extracted fields — locking any subset guarantees the locked one is the field the model got wrong. `UpdatePromoRequest` states the rules: `discount` and `code` cannot be cleared, and the schema is `.strict()`, so a patch naming `subject` or `bodyHtml` is **refused** 400 rather than silently stripped.

`updateSavedPromoEffect` is a patch: an unnamed field is untouched, `null` clears a nullable one. It reads the row back. The expiry crosses as `YYYY-MM-DD` and is written through `promoExpiryInstant` in `promoExpiry.ts`, the same function the extraction uses.

`DELETE /promo-codes/:id` is the only thing that removes a promo row. Both endpoints act on **saved** rows only and answer the same 404 for an unknown id and for an unsaved detection.

`SavedPromoRow` is `SavedPromoReadRow` or `SavedPromoEditRow`, the flag per row so two corrections are independent. The editor replaces the row in place; the account cell stays plain text. `savedPromoDraft.ts` is the pure module between the boxes and the request — the starting draft (the stored instant read as its UTC day), the patch naming only what changed, `null` for an emptied box, and the pre-request save rules.

Neither mutation is optimistic: which section a promo lands in is `listSavedPromos`' rule against the server's clock. Both re-read `["saved-promos"]`; a refusal needs no rollback, a toast explains it. The delete asks first, in place — the row's copy is very often the only one left.

## Rows written before the code rule

A stored `code` of null is only a legacy row (#166 stopped writing them; #168 is the read side). No surface explains it:

- the ledger row draws `—` in its value chip and offers **no copy act**, the way `CodeLedgerRow` leaves the icon off a magic link;
- `PromoCodeRow` on the message page draws its context and no chip;
- `SavedPromoReadRow` puts the table's `UNSTATED` dash in the code cell.

**Nothing hides, drops or breaks such a row** — it is often the only surviving copy of the mail. It still renders, opens its original-mail dialog, and is editable and deletable.

`code` may be corrected but not **cleared** — in `UpdatePromoRequest`, in `PromoFieldsPatch` on both sides of the wire (`code?: string`), and in `promoDraftIsSavable`, which takes the stored promo as well as the draft so a legacy row with no code stays correctable in its other four fields.
