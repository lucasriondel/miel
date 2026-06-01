// Smoke test: exercise the Hono app via in-process fetch.
// Seeds rows directly, then hits every route through bearer auth.
// Run with `bun scripts/smoke-api.ts`.
import { sql as dsql } from "drizzle-orm";
import {
  closeDb,
  getDb,
  getEnv,
  schema,
  syncAccountsFromGog,
  fetchAndTriage,
  type ClaudeAdapter,
  type GogAdapter,
} from "@miel/core";
import { createApp } from "../src/app";

const TEST_ACCOUNT = "lucasriondelpro@gmail.com";

const fakeGog: GogAdapter = {
  async listAccounts() {
    return [{ email: TEST_ACCOUNT, services: [], scopes: [] } as any];
  },
  async searchMessages() {
    return [
      { messageId: "smoke-api-msg-1", threadId: "smoke-api-thr-1" },
      { messageId: "smoke-api-msg-2", threadId: "smoke-api-thr-2" },
    ];
  },
  async getMessage({ messageId }) {
    return {
      id: messageId,
      threadId: messageId.replace("msg", "thr"),
      labelIds: ["INBOX", "Label_user1"],
      snippet: `snippet for ${messageId}`,
      internalDate: String(Date.now()),
      payload: {
        headers: [
          { name: "From", value: "Alice <alice@example.com>" },
          { name: "To", value: TEST_ACCOUNT },
          { name: "Subject", value: `Subj ${messageId}` },
        ],
        mimeType: "text/plain",
        body: { data: Buffer.from(`body of ${messageId}`).toString("base64url") },
      },
    } as any;
  },
  async listLabels() {
    return [
      { id: "INBOX", name: "INBOX", type: "system" } as any,
      { id: "Label_user1", name: "Newsletters", type: "user" } as any,
    ];
  },
  async createLabel({ name }) {
    return { id: `Label_created_${name}`, name, type: "user" } as any;
  },
  async batchModifyLabels(o) {
    console.log("  [gog.batchModifyLabels]", o);
  },
  async trashThread(o) {
    console.log("  [gog.trashThread]", o);
  },
  async archiveThread(o) {
    console.log("  [gog.archiveThread]", o);
  },
  async sendReply(o) {
    console.log("  [gog.sendReply]", { to: o.to, subject: o.subject });
    return { messageId: "smoke-api-sent-1" };
  },
  async addAccount(o) {
    console.log("  [gog.addAccount]", o);
    return { sessionId: "smoke-add", url: "https://accounts.google.com/o/oauth2/auth?state=x", done: Promise.resolve({ ok: true } as const) };
  },
};

const fakeClaude: ClaudeAdapter = {
  async runTriage(input) {
    return {
      output: {
        results: input.messages.map((m, i) => ({
          id: m.id,
          priority: i === 0 ? "high" : "low",
          reasoning: `Stub reasoning for ${m.id}`,
          applyExistingLabels: i === 0 ? ["Newsletters"] : [],
          suggestNewLabels:
            i === 0
              ? [{ name: "SmokeApiNew", reasoning: "stub new label" }]
              : [],
        })),
      },
      runId: "smoke-api-run-1",
      model: "claude-fake",
    };
  },
  async generateReply() {
    return {
      output: { subject: "Re: Smoke API", body: "Stubbed reply via API." },
      runId: "smoke-api-reply-1",
      model: "claude-fake",
    };
  },
};

async function clean() {
  const { db } = getDb();
  await db.execute(
    dsql`DELETE FROM suggested_labels WHERE name LIKE 'SmokeApi%' OR name LIKE 'smoke-api-%'`,
  );
  await db.execute(
    dsql`DELETE FROM triage_label_suggestions WHERE triage_id IN (SELECT id FROM triages WHERE gmail_message_id LIKE 'smoke-api-%')`,
  );
  await db.execute(
    dsql`DELETE FROM triages WHERE gmail_message_id LIKE 'smoke-api-%'`,
  );
  await db.execute(
    dsql`DELETE FROM message_labels WHERE gmail_message_id LIKE 'smoke-api-%'`,
  );
  await db.execute(
    dsql`DELETE FROM messages WHERE gmail_message_id LIKE 'smoke-api-%'`,
  );
  await db.execute(dsql`DELETE FROM labels WHERE name='SmokeApiNew'`);
}

async function main() {
  const app = createApp();
  const { API_SECRET } = getEnv();
  const baseHeaders = {
    Authorization: `Bearer ${API_SECRET}`,
    "Content-Type": "application/json",
  };

  async function req(
    method: string,
    path: string,
    body?: unknown,
    headers: Record<string, string> = baseHeaders,
  ) {
    const init: RequestInit = { method, headers };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await app.fetch(
      new Request(`http://localhost${path}`, init),
    );
    let parsed: unknown = null;
    const text = await res.text();
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }
    return { status: res.status, body: parsed as any };
  }

  try {
    console.log("> reset smoke rows");
    await clean();

    console.log("> seed accounts via syncAccountsFromGog (live gog)");
    await syncAccountsFromGog();

    console.log("> seed messages + triage via fetchAndTriage (stub gog/claude)");
    const seed = await fetchAndTriage({
      accountEmail: TEST_ACCOUNT,
      since: "7d",
      gog: fakeGog,
      claude: fakeClaude,
      log: () => {},
    });
    console.log("  seeded:", seed);

    console.log("> 401 without auth");
    const unauth = await req("GET", "/accounts", undefined, {});
    console.log("  status =", unauth.status, "body =", unauth.body);
    if (unauth.status !== 401) throw new Error("expected 401");

    console.log("> GET /health (no auth)");
    const h = await req("GET", "/health", undefined, {});
    console.log("  health =", h.status, h.body);

    console.log("> GET /accounts");
    const accs = await req("GET", "/accounts");
    console.log(
      "  count =",
      accs.body?.accounts?.length,
      "first =",
      accs.body?.accounts?.[0]?.email,
    );
    const accountRow = accs.body.accounts.find(
      (a: any) => a.email === TEST_ACCOUNT,
    );
    if (!accountRow) throw new Error("missing test account");
    const accountId = accountRow.id;

    console.log("> GET /accounts/:id/labels");
    const lbls = await req("GET", `/accounts/${accountId}/labels`);
    console.log("  labels =", lbls.body?.labels?.length);

    console.log("> GET /messages?priority=high");
    const msgs = await req(
      "GET",
      `/messages?account=${accountId}&priority=high&limit=10`,
    );
    console.log(
      "  items =",
      msgs.body?.items?.length,
      "first =",
      msgs.body?.items?.[0]?.gmailMessageId,
    );
    const msg = msgs.body.items[0];
    if (!msg) throw new Error("no message");
    if (msg.priority !== "high") throw new Error("priority filter broken");

    console.log("> GET /messages/:accountId/:gmailMessageId");
    const detail = await req(
      "GET",
      `/messages/${accountId}/${msg.gmailMessageId}`,
    );
    console.log(
      "  detail subject =",
      detail.body?.subject,
      "triageHistory =",
      detail.body?.triageHistory?.length,
    );
    const triageId = detail.body.latestTriageId;
    const existingIds: string[] =
      detail.body.triageHistory[0].existingLabelSuggestions.map(
        (s: any) => s.labelId,
      );
    const newIds: string[] =
      detail.body.triageHistory[0].newLabelSuggestions.map(
        (s: any) => s.suggestionId,
      );

    console.log("> POST /messages/.../apply-suggestions");
    const applied = await req(
      "POST",
      `/messages/${accountId}/${msg.gmailMessageId}/apply-suggestions`,
      {
        triageId,
        acceptExistingLabelIds: existingIds,
        acceptNewSuggestionIds: newIds,
      },
    );
    console.log("  applied =", applied.body);

    console.log("> GET /settings");
    const settings = await req("GET", "/settings");
    console.log("  settings =", settings.body);

    console.log("> PUT /settings");
    const upd = await req("PUT", "/settings", {
      triageModel: "claude-sonnet-4-6",
    });
    console.log("  updated =", upd.body);
    await req("PUT", "/settings", { triageModel: "claude-haiku-4-5" });

    // Skipping live POST /generate-reply + /send-reply — they bypass our stub
    // adapters (the HTTP layer instantiates real claude/gog). Covered separately
    // by packages/cli/scripts/smoke-cli.ts using injected adapters.
    console.log("> SKIP generate-reply / send-reply (require stubs HTTP can't inject)");

    console.log("> POST /messages/:id2/archive");
    const msg2 = msgs.body.items.find((m: any) =>
      m.gmailMessageId.endsWith("-2"),
    );
    if (msg2) {
      const arch = await req(
        "POST",
        `/messages/${accountId}/${msg2.gmailMessageId}/archive`,
      );
      console.log("  archive =", arch.body);

      console.log("> DELETE /messages/:id2 (trash)");
      const tr = await req(
        "DELETE",
        `/messages/${accountId}/${msg2.gmailMessageId}`,
      );
      console.log("  trash =", tr.body);
    }

    console.log("> validation error: invalid priority");
    const bad = await req("GET", "/messages?priority=URGENT");
    console.log("  status =", bad.status, "error =", bad.body?.error);
    if (bad.status !== 400) throw new Error("expected 400");

    console.log("> 404 unknown account labels");
    const nf = await req(
      "GET",
      "/accounts/00000000-0000-0000-0000-000000000000/labels",
    );
    console.log("  status =", nf.status, "error =", nf.body?.error);
    if (nf.status !== 404) throw new Error("expected 404");
  } finally {
    console.log("> cleanup");
    await clean().catch((e) => console.error(e));
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
