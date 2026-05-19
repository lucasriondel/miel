import { Hono } from "hono";
import {
  getLabelsForAccount,
  getAccountById,
  listAccountsFromDb,
  syncAccountsFromGog,
  syncLabelsForAccount,
} from "@miel/core";

export const accountsRoutes = new Hono();

accountsRoutes.get("/", async (c) => {
  const accounts = await listAccountsFromDb();
  return c.json({ accounts });
});

accountsRoutes.post("/sync", async (c) => {
  const synced = await syncAccountsFromGog();
  return c.json({ accounts: synced });
});

accountsRoutes.get("/:accountId/labels", async (c) => {
  const accountId = c.req.param("accountId");
  const account = await getAccountById(accountId);
  if (!account) {
    return c.json({ error: "account_not_found" }, 404);
  }
  const labels = await getLabelsForAccount(account.id);
  return c.json({ labels });
});

accountsRoutes.post("/:accountId/labels/sync", async (c) => {
  const accountId = c.req.param("accountId");
  const account = await getAccountById(accountId);
  if (!account) {
    return c.json({ error: "account_not_found" }, 404);
  }
  const labels = await syncLabelsForAccount({
    accountId: account.id,
    accountEmail: account.email,
  });
  return c.json({ labels });
});
