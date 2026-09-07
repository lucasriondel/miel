import { Hono } from "hono";
import {
  apiSchemas,
  deleteSavedPromo,
  listPromoSuggestions,
  listSavedPromos,
  readSavedPromoMail,
  savePromo,
  updateSavedPromo,
} from "@miel/core";

export const promoCodesRoutes = new Hono();

/**
 * The Promo Codes page's read (#162) — every account's saved promos, in the two
 * sections the page shows them in.
 *
 * It takes no parameters, and that is the feature rather than an omission: a
 * promo code is used at a checkout, so which mailbox it arrived in is a column
 * on the row and never a gate the caller must satisfy first. Declared before
 * `/` matters not at all to Hono but reads in the order the paths nest.
 *
 * Which section a promo is in, the order inside each, and that nothing is
 * deduped or deleted, are all the core service's answers.
 */
promoCodesRoutes.get("/saved", async (c) => {
  return c.json(await listSavedPromos());
});

/**
 * The suggestions the inbox section shows (#160) — its own endpoint and, on the
 * other side, its own query key. The alternative was a `promos` array widened
 * onto the listed-message payload, which is sent for every row: a
 * variable-length array hung off it would cost every message to serve a feature
 * that hits few, and the two have different lifetimes and invalidation.
 *
 * Thin, like every route here: shape-validate, delegate. Which rows are
 * suggestions — unsaved, unexpired, one per code, capped, and only while their
 * mail is still in the inbox — is the core service's answer, so the CLI and any
 * later caller get the same one.
 */
promoCodesRoutes.get("/", async (c) => {
  const q = apiSchemas.PromoSuggestionsQuery.parse({
    account: c.req.query("account"),
    internalDateFrom: c.req.query("internalDateFrom"),
    internalDateTo: c.req.query("internalDateTo"),
  });
  const items = await listPromoSuggestions({
    accountId: q.account,
    internalDateFrom: q.internalDateFrom,
    internalDateTo: q.internalDateTo,
  });
  return c.json({ items });
});

/**
 * Saving a promo and trashing the mail it came from (#161) — one request,
 * because the ordering between the two writes is a rule and not a click
 * handler's business: the promo is saved with its copy of the mail *first*, and
 * only then is the original trashed.
 *
 * So the route is as thin as its neighbour: validate that the id is one of
 * ours, delegate, and answer what the service did — including the case where
 * Gmail refused the trash, which leaves the promo saved and a mail to delete by
 * hand.
 */
promoCodesRoutes.post("/:id/save", async (c) => {
  const { id } = apiSchemas.PromoIdParams.parse({ id: c.req.param("id") });
  const result = await savePromo({ id });
  return c.json(result);
});

/**
 * The mail one saved promo came from (#163) — the copy the save took, which is
 * the only version left once Gmail has purged the original it trashed.
 *
 * A read and nothing more: the copy is a record, the extracted fields beside it
 * are the guesses, and only those are corrigible — so there is no writer here
 * and no id of a Gmail message in the path.
 *
 * The 404 covers both ways to have no copy, because they are one answer to a
 * caller: no such promo, and a detection nobody saved (the columns are written
 * at save time and at no other moment). Answering a null body instead would let
 * a viewer draw an empty mail as though that were what the shop sent.
 */
promoCodesRoutes.get("/:id/original", async (c) => {
  const { id } = apiSchemas.PromoIdParams.parse({ id: c.req.param("id") });
  const mail = await readSavedPromoMail({ id });
  if (!mail) return c.json({ error: "promo_not_found" }, 404);
  return c.json(mail);
});

/**
 * Correcting what the extraction guessed (#164).
 *
 * The five extracted fields and nothing else, which is where this route earns
 * its schema rather than only validating types: `UpdatePromoRequest` is
 * `.strict()`, so a patch naming `subject` or `bodyHtml` is **refused** with a
 * 400 instead of being accepted with the field quietly dropped. The copy of the
 * mail is a record of what a shop actually said, and a caller whose edit was
 * silently ignored would believe it landed.
 *
 * A patch, not a replacement: a field the body does not name is the field
 * nobody edited, and `null` clears a nullable one. Which rows may be edited —
 * saved ones — and what the edit answers with is the core service's, so the
 * 404 covers an unknown id and a detection nobody saved as one answer.
 */
promoCodesRoutes.patch("/:id", async (c) => {
  const { id } = apiSchemas.PromoIdParams.parse({ id: c.req.param("id") });
  const fields = apiSchemas.UpdatePromoRequest.parse(await c.req.json());
  const promo = await updateSavedPromo({ id, fields });
  if (!promo) return c.json({ error: "promo_not_found" }, 404);
  return c.json(promo);
});

/**
 * Taking a saved promo off the page (#164).
 *
 * The only thing anywhere that removes a promo row: nothing expires itself away
 * and an expired promo in particular is kept, because the record of what a shop
 * offered is worth having and a page that tidied itself would be deciding on
 * the user's behalf. So deletion is reached by asking for it, and this is the
 * asking.
 *
 * Saved rows only, like the patch beside it — removing an unsaved detection
 * would be a dismissal, a different act this feature does not have — and the
 * same 404 answers both ways to have nothing to delete.
 */
promoCodesRoutes.delete("/:id", async (c) => {
  const { id } = apiSchemas.PromoIdParams.parse({ id: c.req.param("id") });
  const deleted = await deleteSavedPromo({ id });
  if (!deleted) return c.json({ error: "promo_not_found" }, 404);
  return c.json({ ok: true, id });
});
