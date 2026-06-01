// Smoke test for CLI services: seeds messages + triage via stubs, then exercises apply + reply paths.
// Run with `bun scripts/smoke-cli.ts`.
import { sql as dsql } from "drizzle-orm";
import {
  applySuggestions,
  archiveMessage,
  closeDb,
  fetchAndTriage,
  generateReply,
  getDb,
  getLatestTriageForMessage,
  schema,
  sendReply,
  syncAccountsFromGog,
  trashMessage,
  type ClaudeAdapter,
  type GogAdapter,
} from "@miel/core";

const TEST_ACCOUNT = "lucasriondelpro@gmail.com";

const fakeGog: GogAdapter = {
  async listAccounts() {
    return [{ email: TEST_ACCOUNT, services: [], scopes: [] } as any];
  },
  async searchMessages() {
    return [
      { messageId: "smoke-msg-1", threadId: "smoke-thr-1" },
      { messageId: "smoke-msg-2", threadId: "smoke-thr-2" },
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
          { name: "To", value: "lucasriondelpro@gmail.com" },
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
    console.log(`  [gog.batchModifyLabels]`, o);
  },
  async trashThread(o) {
    console.log(`  [gog.trashThread]`, o);
  },
  async archiveThread(o) {
    console.log(`  [gog.archiveThread]`, o);
  },
  async sendReply(o) {
    console.log(`  [gog.sendReply]`, { to: o.to, subject: o.subject });
    return { messageId: "smoke-sent-1" };
  },
  async addAccount(o) {
    console.log(`  [gog.addAccount]`, o);
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
              ? [{ name: "SmokeNew", reasoning: "stub new label" }]
              : [],
        })),
      },
      runId: "smoke-run-1",
      model: "claude-fake",
    };
  },
  async generateReply() {
    return {
      output: { subject: "Re: Smoke", body: "Stubbed reply body." },
      runId: "smoke-reply-1",
      model: "claude-fake",
    };
  },
};

async function clean() {
  const { db } = getDb();
  await db.execute(dsql`DELETE FROM suggested_labels WHERE name='SmokeNew' OR name LIKE 'smoke-%'`);
  await db.execute(dsql`DELETE FROM triage_label_suggestions WHERE triage_id IN (SELECT id FROM triages WHERE gmail_message_id LIKE 'smoke-%')`);
  await db.execute(dsql`DELETE FROM triages WHERE gmail_message_id LIKE 'smoke-%'`);
  await db.execute(dsql`DELETE FROM message_labels WHERE gmail_message_id LIKE 'smoke-%'`);
  await db.execute(dsql`DELETE FROM messages WHERE gmail_message_id LIKE 'smoke-%'`);
  await db.execute(dsql`DELETE FROM labels WHERE name='SmokeNew'`);
}

async function main() {
  try {
    console.log("> reset smoke rows");
    await clean();

    console.log("> syncAccountsFromGog (live gog, picks up real accounts)");
    await syncAccountsFromGog();

    console.log("> fetchAndTriage with stubs");
    const result = await fetchAndTriage({
      accountEmail: TEST_ACCOUNT,
      since: "7d",
      gog: fakeGog,
      claude: fakeClaude,
      log: (m) => console.log("  " + m),
    });
    console.log("  fetchAndTriage result:", result);

    const { db } = getDb();
    const acc = await db
      .select({ id: schema.accounts.id })
      .from(schema.accounts)
      .where(dsql`${schema.accounts.email} = ${TEST_ACCOUNT}`)
      .limit(1);
    const accountId = acc[0].id;

    console.log("> getLatestTriageForMessage(smoke-msg-1)");
    const latest = await getLatestTriageForMessage({
      accountId,
      gmailMessageId: "smoke-msg-1",
    });
    console.log("  latest:", latest);
    if (!latest) throw new Error("expected latest triage");

    console.log("> applySuggestions accept ALL");
    const applied = await applySuggestions({
      triageId: latest.triageId,
      accountEmail: TEST_ACCOUNT,
      gmailMessageId: "smoke-msg-1",
      acceptExistingLabelIds: latest.existingLabelSuggestions.map(
        (s) => s.labelId,
      ),
      acceptNewSuggestionIds: latest.newLabelSuggestions.map(
        (s) => s.suggestionId,
      ),
      gog: fakeGog,
    });
    console.log("  applySuggestions result:", applied);

    console.log("> generateReply (stub claude)");
    const draft = await generateReply({
      accountEmail: TEST_ACCOUNT,
      gmailMessageId: "smoke-msg-1",
      prompt: "Politely decline.",
      claude: fakeClaude,
    });
    console.log("  draft:", draft);

    console.log("> sendReply (stub gog)");
    const sent = await sendReply({
      accountEmail: TEST_ACCOUNT,
      gmailMessageId: "smoke-msg-1",
      subject: draft.subject,
      body: draft.body,
      gog: fakeGog,
    });
    console.log("  sent:", sent);

    console.log("> archiveMessage (stub gog)");
    const arch = await archiveMessage({
      accountEmail: TEST_ACCOUNT,
      gmailMessageId: "smoke-msg-2",
      gog: fakeGog,
    });
    console.log("  archive:", arch);

    console.log("> trashMessage (stub gog)");
    const tr = await trashMessage({
      accountEmail: TEST_ACCOUNT,
      gmailMessageId: "smoke-msg-2",
      gog: fakeGog,
    });
    console.log("  trash:", tr);

    console.log("> verify post-state counts");
    const tCnt = await db.execute(
      dsql`SELECT count(*)::int AS c FROM triages WHERE gmail_message_id LIKE 'smoke-%'`,
    );
    const slCnt = await db.execute(
      dsql`SELECT status, count(*)::int AS c FROM suggested_labels WHERE name='SmokeNew' GROUP BY status`,
    );
    const tlsCnt = await db.execute(
      dsql`SELECT status, count(*)::int AS c FROM triage_label_suggestions tls JOIN triages t ON tls.triage_id=t.id WHERE t.gmail_message_id LIKE 'smoke-%' GROUP BY status`,
    );
    const lblCnt = await db.execute(
      dsql`SELECT count(*)::int AS c FROM labels WHERE name='SmokeNew'`,
    );
    console.log("  triages =", tCnt);
    console.log("  suggested_labels by status =", slCnt);
    console.log("  triage_label_suggestions by status =", tlsCnt);
    console.log("  labels(SmokeNew) =", lblCnt);

    console.log("> cleanup");
    await clean();
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
