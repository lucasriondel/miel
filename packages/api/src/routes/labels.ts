import { Hono } from "hono";
import { apiSchemas, ensureLabel, getAccountById } from "@miel/core";

export const labelsRoutes = new Hono();

labelsRoutes.post("/", async (c) => {
  const body = apiSchemas.CreateLabelRequest.parse(await c.req.json());
  const account = await getAccountById(body.accountId);
  if (!account) {
    return c.json({ error: "account_not_found" }, 404);
  }
  const label = await ensureLabel({
    accountId: account.id,
    accountEmail: account.email,
    name: body.name,
  });
  return c.json({ label }, 201);
});
