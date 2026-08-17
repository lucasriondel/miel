// The two triage prompts (#105). The CLI variant may tell the model to curl a
// message body from the local API — it runs with `--allowedTools Bash` and can.
// The hosted variant cannot: there is no tool, and the paragraph would be dead
// text sent to a third party with `API_SECRET` embedded in it.
//
// Both variants must still send only what `claudeUsage.ts` publishes — sender,
// subject, snippet, labels — because the landing page's disclosure is derived
// from that module. Inlining bodies for hosted providers would make it false.
import { beforeAll, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
process.env.API_SECRET = "top-secret-bearer-token";
process.env.API_PORT = "3001";

const { buildHostedTriagePrompt, buildTriagePrompt } = await import("./prompts");
import type { TriageInputT } from "../schemas/triage";

const INPUT: TriageInputT = {
  account: "user@example.com",
  accountId: "acc-1",
  existingLabels: ["Receipts"],
  messages: [
    {
      id: "m1",
      from: "sender@example.com",
      subject: "Invoice",
      snippet: "Your invoice is ready",
      currentLabels: ["INBOX"],
    },
  ],
};

let cli = "";
let hosted = "";

beforeAll(() => {
  cli = buildTriagePrompt(INPUT);
  hosted = buildHostedTriagePrompt(INPUT);
});

describe("buildTriagePrompt (Claude Code CLI)", () => {
  test("keeps the body-fetch escape hatch it has the tool for", () => {
    expect(cli).toContain("curl");
    expect(cli).toContain("/api/messages/acc-1/");
  });

  test("still carries the classification rules and the messages", () => {
    expect(cli).toContain("priority");
    expect(cli).toContain("Receipts");
    expect(cli).toContain("m1");
  });
});

describe("buildHostedTriagePrompt", () => {
  test("drops the body-fetch paragraph, which it has no tool to act on", () => {
    expect(hosted).not.toContain("curl");
    expect(hosted).not.toContain("localhost");
  });

  test("does not send API_SECRET to a third-party API", () => {
    expect(cli).toContain("top-secret-bearer-token");
    expect(hosted).not.toContain("top-secret-bearer-token");
  });

  test("keeps every rule the CLI variant states", () => {
    for (const rule of ["priority", "applyExistingLabels", "suggestNewLabels", "reasoning"]) {
      expect(hosted).toContain(rule);
    }
    expect(hosted).toContain("Receipts");
    expect(hosted).toContain("user@example.com");
  });

  test("says a body is never required, so an ambiguous message still gets a result", () => {
    expect(hosted).toContain("body is never required");
  });

  test("sends the same per-message fields as the CLI variant — no inlined bodies", () => {
    expect(hosted).toContain(JSON.stringify(INPUT.messages));
    expect(hosted).not.toContain("bodyText");
    expect(hosted).not.toContain("bodyHtml");
  });
});
