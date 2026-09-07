import { Hono } from "hono";
import {
  acceptSuggestedFilter,
  apiSchemas,
  deleteFilterForAccount,
  dismissSuggestedFilter,
  listAllFilters,
  listFiltersForAccount,
  listSuggestedFilters,
  mergeFiltersForAccount,
} from "@miel/core";

export const filtersRoutes = new Hono();

filtersRoutes.get("/", async (c) => {
  const accountId = c.req.query("accountId");
  const filters = accountId ? await listFiltersForAccount(accountId) : await listAllFilters();
  const suggestions = await listSuggestedFilters({
    accountId: accountId ?? undefined,
    status: "pending",
  });
  return c.json({ filters, suggestions });
});

// Merge N of an account's filters into one. The service owns the OR-query and
// union-action algebra, the ordering (create, then delete the sources) and the
// rejections; a rejection arrives as a FilterMergeError and the shared error
// handler turns its reason into a status. `failedDeletions` rides along with a
// 200: the merged filter exists, some original just outlived it.
filtersRoutes.post("/merge", async (c) => {
  const body = await c.req.json().catch(() => null);
  const input = apiSchemas.MergeFiltersRequest.parse(body);
  const result = await mergeFiltersForAccount(input);
  return c.json(result);
});

// The service returns null when the id isn't this account's filter, which keeps
// one account from deleting another's — that's a 404, not a delete.
filtersRoutes.delete("/:gmailFilterId", async (c) => {
  const input = apiSchemas.DeleteFilterRequest.parse({
    accountId: c.req.query("accountId"),
    gmailFilterId: c.req.param("gmailFilterId"),
  });
  const filter = await deleteFilterForAccount(input);
  if (!filter) {
    return c.json(
      {
        error: "filter_not_found",
        message: "No such filter on this account.",
      },
      404,
    );
  }
  return c.json({ filter });
});

filtersRoutes.post("/suggestions/:id/accept", async (c) => {
  const id = c.req.param("id");
  const result = await acceptSuggestedFilter({ suggestionId: id });
  return c.json(result);
});

filtersRoutes.post("/suggestions/:id/dismiss", async (c) => {
  const id = c.req.param("id");
  const suggestion = await dismissSuggestedFilter(id);
  return c.json({ suggestion });
});
