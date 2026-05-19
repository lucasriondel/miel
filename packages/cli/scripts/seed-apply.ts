// Seed a pending suggestion + triage for use with `miel apply` smoke testing.
import { sql as dsql } from "drizzle-orm";
import {
  closeDb,
  fetchAndTriage,
  getDb,
  syncAccountsFromGog,
  type ClaudeAdapter,
  type GogAdapter,
} from "@miel/core";

const TEST_ACCOUNT = "lucasriondelpro@gmail.com";
const MSG = "smoke-apply-msg-2";

const fakeGog: GogAdapter = {
  async listAccounts() {
    return [{ email: TEST_ACCOUNT, services: [], scopes: [] } as any];
  },
  async searchMessages() {
    return [{ messageId: MSG, threadId: "smoke-apply-thr-2" }];
  },
  async getMessage({ messageId }) {
    return {
      id: messageId,
      threadId: "smoke-apply-thr-2",
      labelIds: ["INBOX"],
      snippet: "snippet",
      internalDate: String(Date.now()),
      payload: {
        headers: [
          { name: "From", value: "alice@example.com" },
          { name: "To", value: TEST_ACCOUNT },
          { name: "Subject", value: "Subject" },
        ],
        mimeType: "text/plain",
        body: { data: Buffer.from("body").toString("base64url") },
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
  async batchModifyLabels() {},
  async trashThread() {},
  async archiveThread() {},
  async sendReply() {
    return { messageId: "x" };
  },
};

const fakeClaude: ClaudeAdapter = {
  async runTriage(input) {
    return {
      output: {
        results: input.messages.map((m) => ({
          id: m.id,
          priority: "high" as const,
          reasoning: "stub",
          applyExistingLabels: ["Newsletters"],
          suggestNewLabels: [],
        })),
      },
      runId: "r",
      model: "m",
    };
  },
  async generateReply() {
    return { output: { subject: "Re", body: "B" }, runId: "r", model: "m" };
  },
};

async function clean() {
  const { db } = getDb();
  await db.execute(
    dsql`DELETE FROM triage_label_suggestions WHERE triage_id IN (SELECT id FROM triages WHERE gmail_message_id LIKE 'smoke-apply-%')`,
  );
  await db.execute(
    dsql`DELETE FROM triages WHERE gmail_message_id LIKE 'smoke-apply-%'`,
  );
  await db.execute(
    dsql`DELETE FROM message_labels WHERE gmail_message_id LIKE 'smoke-apply-%'`,
  );
  await db.execute(
    dsql`DELETE FROM messages WHERE gmail_message_id LIKE 'smoke-apply-%'`,
  );
}

const mode = process.argv[2];
async function main() {
  try {
    if (mode === "clean") {
      await clean();
      console.log("cleaned");
      return;
    }
    await clean();
    await syncAccountsFromGog();
    await fetchAndTriage({
      accountEmail: TEST_ACCOUNT,
      gog: fakeGog,
      claude: fakeClaude,
      log: () => {},
    });
    console.log("seeded message:", MSG);
    console.log("account:", TEST_ACCOUNT);
  } finally {
    await closeDb();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
