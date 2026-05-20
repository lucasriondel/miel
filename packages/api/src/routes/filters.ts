import { Hono } from "hono";
import {
  acceptSuggestedFilter,
  dismissSuggestedFilter,
  listAllFilters,
  listFiltersForAccount,
  listSuggestedFilters,
} from "@miel/core";

export const filtersRoutes = new Hono();

filtersRoutes.get("/", async (c) => {
  const accountId = c.req.query("accountId");
  const filters = accountId
    ? await listFiltersForAccount(accountId)
    : await listAllFilters();
  const suggestions = await listSuggestedFilters({
    accountId: accountId ?? undefined,
    status: "pending",
  });
  return c.json({ filters, suggestions });
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
