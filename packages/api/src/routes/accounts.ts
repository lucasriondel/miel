import { Hono } from "hono";
import {
  apiSchemas,
  listSendAs,
  setAccountNickname,
  suggestContacts,
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
  const profile = await runWithApp(
    GmailProfile.use((svc) => svc.profile({ accountId: account.id })),
  );
  await refreshAccountProfile({
    id: account.id,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl,
  });
  return c.json({ ok: true, profile });
});

// Rename a mailbox for this install ("Lucas — Pro"); null or "" clears it.
accountsRoutes.patch("/:accountId", async (c) => {
  const accountId = c.req.param("accountId");
  const body = apiSchemas.UpdateAccountRequest.parse(await c.req.json());
  const account = await setAccountNickname({ accountId, nickname: body.nickname });
  if (!account) {
    return c.json({ error: "account_not_found", message: "No such account." }, 404);
  }
  return c.json({ account });
});

// The addresses this account may send as — the compose window's From menu.
accountsRoutes.get("/:accountId/send-as", async (c) => {
  const accountId = c.req.param("accountId");
  const aliases = await listSendAs({ accountId });
  return c.json({ aliases });
});

// Address suggestions: people this account has written to.
accountsRoutes.get("/:accountId/contacts", async (c) => {
  const accountId = c.req.param("accountId");
  const q = apiSchemas.ContactsQuery.parse({ q: c.req.query("q"), limit: c.req.query("limit") });
  const items = await suggestContacts({ accountId, query: q.q, limit: q.limit });
  return c.json({ items });
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
