import { Hono } from "hono";
import {
  getLabelsForAccount,
  getAccountById,
  listAccountsFromDb,
  syncLabelsForAccount,
  GmailProfile,
  refreshAccountProfile,
  removeAccount,
  runWithApp,
} from "@miel/core";

export const accountsRoutes = new Hono();

accountsRoutes.get("/", async (c) => {
  const accounts = await listAccountsFromDb();
  return c.json({ accounts });
});

// Refresh display name + avatar for a connected account from its Google
// profile (the connect callback already sets these; this re-pulls on demand).
accountsRoutes.post("/:accountId/refresh-profile", async (c) => {
  const accountId = c.req.param("accountId");
  const account = await getAccountById(accountId);
  if (!account) {
    return c.json({ error: "account_not_found" }, 404);
  }
  const profile = await runWithApp(GmailProfile.profile({ accountId: account.id }));
  await refreshAccountProfile({
    id: account.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  });
  return c.json({ ok: true, profile });
});

// Disconnect an account and drop everything synced for it. The service returns
// null when the id isn't a known account, which is a 404 rather than a delete.
accountsRoutes.delete("/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const removed = await removeAccount(accountId);
  if (!removed) {
    return c.json({ error: "account_not_found", message: "No such account." }, 404);
  }
  return c.json({ account: removed });
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
