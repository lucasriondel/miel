// Seeds a fully-populated demo inbox directly into Postgres — no Gmail/OAuth
// involved. Use this to get clean, reproducible screenshots without a real
// connected account. Run: `bun run packages/cli/scripts/seed-demo.ts [clean]`
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { getDb, closeDb, schema, deleteClaudeCodeToken, setClaudeCodeToken } from "@miel/core";

const DEMO_EMAIL = "demo@mielapp.dev";

// A placeholder, not a credential — long enough to be storable, and never used:
// nothing in the demo talks to Anthropic. It is seeded because the Claude Code
// token is read from `encrypted_secrets` and from nowhere else, so without a row
// the demo's Settings page shows an unconfigured install and the onboarding gate
// covers the screenshots. It must be written by this script with the same
// TOKEN_ENCRYPTION_KEY the API container uses, or the API cannot decrypt it.
const DEMO_CLAUDE_CODE_TOKEN = "sk-ant-oat01-demo-not-a-real-token";

const LABELS = [
  { name: "Work", colorBg: "#fce8e6", colorFg: "#c5221f" },
  { name: "Finance", colorBg: "#e6f4ea", colorFg: "#137333" },
  { name: "Newsletters", colorBg: "#e8f0fe", colorFg: "#1967d2" },
  { name: "Travel", colorBg: "#fef7e0", colorFg: "#b06000" },
];

const MESSAGES = [
  // Verification mails in each supported language, plus a decoy whose digits
  // must NOT be picked up as a code (order number next to "confirm").
  {
    from: ["GitHub", "noreply@github.com"],
    subject: "Your verification code is 482913",
    snippet:
      "Use the verification code below to confirm your sign-in. This code expires in 10 minutes.",
    priority: "high" as const,
    reasoning: "Time-sensitive sign-in code.",
    labels: [],
    daysAgo: 0,
    hoursAgo: 0,
  },
  {
    from: ["Qonto", "no-reply@qonto.com"],
    subject: "Votre code de confirmation : 771204",
    snippet: "Vérifiez votre connexion avec le code ci-dessus. Il expire dans 10 minutes.",
    priority: "high" as const,
    reasoning: "Code de connexion urgent.",
    labels: [],
    daysAgo: 0,
    hoursAgo: 1,
  },
  {
    from: ["Deutsche Bahn", "service@bahn.de"],
    subject: "Ihr Bestätigungscode lautet 305178",
    snippet: "Bitte bestätigen Sie Ihre Anmeldung mit dem obigen Code.",
    priority: "high" as const,
    reasoning: "Anmeldebestätigung.",
    labels: [],
    daysAgo: 0,
    hoursAgo: 1,
  },
  {
    from: ["Notion", "team@makenotion.com"],
    subject: "Sign in to Notion",
    snippet:
      "Click the secure link to finish signing in: https://notion.so/auth/verify?token=8f3ca91b2d",
    priority: "high" as const,
    reasoning: "Magic sign-in link.",
    labels: [],
    daysAgo: 0,
    hoursAgo: 2,
  },
  {
    from: ["Amazon", "no-reply@amazon.fr"],
    subject: "Votre commande 482913 a été expédiée",
    snippet:
      "Confirmez la réception de votre colis. Votre facture est disponible dans votre compte.",
    priority: "low" as const,
    reasoning: "Shipping notice — decoy, must not surface as a code.",
    labels: [],
    daysAgo: 0,
    hoursAgo: 3,
  },
  {
    from: ["Priya Shah", "priya@northwind-labs.com"],
    subject: "Q3 roadmap review — need your input by Friday",
    snippet:
      "Hey — could you take a look at the attached roadmap doc before our sync? Specifically the section on...",
    priority: "high" as const,
    reasoning: "Direct request from a colleague with a concrete deadline this week.",
    labels: ["Work"],
    daysAgo: 0,
    hoursAgo: 2,
  },
  {
    from: ["Stripe", "receipts@stripe.com"],
    subject: "Your invoice for August is ready",
    snippet: "Your monthly invoice of $128.00 has been generated and will be charged on Sep 1...",
    priority: "medium" as const,
    reasoning: "Routine billing notification, no action required soon.",
    labels: ["Finance"],
    daysAgo: 0,
    hoursAgo: 5,
  },
  {
    from: ["Marcus Lee", "marcus.lee@acme-corp.io"],
    subject: "Re: Contract renewal terms",
    snippet: "Thanks for sending this over. One clarification on section 4.2 before we sign...",
    priority: "high" as const,
    reasoning: "Active negotiation on a contract awaiting your reply.",
    labels: ["Work"],
    daysAgo: 1,
    hoursAgo: 1,
  },
  {
    from: ["Delta", "no-reply@delta.com"],
    subject: "Your trip to San Francisco is confirmed",
    snippet: "Confirmation number ABC123. Flight DL482 departs 10:15 AM on Sep 12...",
    priority: "medium" as const,
    reasoning: "Travel confirmation worth keeping but not urgent.",
    labels: ["Travel"],
    daysAgo: 1,
    hoursAgo: 8,
  },
  {
    from: ["The Pragmatic Engineer", "newsletter@pragmaticengineer.com"],
    subject: "Issue #247: How top teams ship faster",
    snippet: "This week: a deep dive into deployment pipelines at three unicorns, plus...",
    priority: "low" as const,
    reasoning: "Recurring newsletter, informational only.",
    labels: ["Newsletters"],
    daysAgo: 2,
    hoursAgo: 3,
  },
  {
    from: ["Sofia Martinez", "sofia@brightpath-design.com"],
    subject: "Final logo files attached",
    snippet: "Here are the final SVG and PNG exports we discussed on the call yesterday...",
    priority: "medium" as const,
    reasoning: "Deliverable received, worth a quick review but not blocking.",
    labels: ["Work"],
    daysAgo: 2,
    hoursAgo: 10,
  },
  {
    from: ["American Express", "alerts@aexp.com"],
    subject: "Large purchase alert on card ending 4471",
    snippet: "A charge of $842.19 was made at AIRLINE DIRECT on Sep 3. If this wasn't you...",
    priority: "high" as const,
    reasoning: "Unusual charge alert — worth confirming quickly.",
    labels: ["Finance"],
    daysAgo: 3,
    hoursAgo: 0,
  },
  {
    from: ["Linear", "notifications@linear.app"],
    subject: "3 issues assigned to you were updated",
    snippet: "MIEL-142 moved to In Review, MIEL-138 moved to Done, MIEL-151 comment added...",
    priority: "low" as const,
    reasoning: "Automated product notification, no direct action needed.",
    labels: [],
    daysAgo: 3,
    hoursAgo: 6,
  },
  {
    from: ["Airbnb", "automated@airbnb.com"],
    subject: "Your upcoming stay in Lisbon",
    snippet: "Check-in is in 5 days. Here's everything you need for your trip, including...",
    priority: "medium" as const,
    reasoning: "Upcoming trip reminder, informational.",
    labels: ["Travel"],
    daysAgo: 4,
    hoursAgo: 2,
  },
  {
    from: ["Morning Brew", "crew@morningbrew.com"],
    subject: "☕️ Fed signals rate pause, tech earnings loom",
    snippet: "Good morning. Markets shrugged off yesterday's jobs report as investors...",
    priority: "low" as const,
    reasoning: "Daily newsletter digest, no action needed.",
    labels: ["Newsletters"],
    daysAgo: 4,
    hoursAgo: 12,
  },
  {
    from: ["James Okafor", "james.okafor@northwind-labs.com"],
    subject: "Can we push tomorrow's 1:1 to Thursday?",
    snippet: "Something came up on my end — would Thursday at the same time work instead?",
    priority: "high" as const,
    reasoning: "Direct scheduling request needing a timely reply.",
    labels: ["Work"],
    daysAgo: 5,
    hoursAgo: 1,
  },
  {
    from: ["Chase", "no-reply@chase.com"],
    subject: "Your September statement is available",
    snippet: "Your statement for account ending 8821 is now available to view online...",
    priority: "low" as const,
    reasoning: "Routine statement notification.",
    labels: ["Finance"],
    daysAgo: 6,
    hoursAgo: 4,
  },
  {
    from: ["Elena Novak", "elena.novak@northwind-labs.com"],
    subject: "Design review moved to 3pm — new deck attached",
    snippet: "Quick heads up, I moved our design review to 3pm today and updated the deck with...",
    priority: "high" as const,
    reasoning: "Same-day schedule change from a colleague.",
    labels: ["Work"],
    daysAgo: 0,
    hoursAgo: 1,
  },
  {
    from: ["Notion", "team@makenotion.com"],
    subject: "Your workspace usage summary for August",
    snippet: "Here's a look at how your team used Notion last month, including page...",
    priority: "low" as const,
    reasoning: "Automated usage digest, informational only.",
    labels: ["Newsletters"],
    daysAgo: 1,
    hoursAgo: 3,
  },
  {
    from: ["Wise", "noreply@wise.com"],
    subject: "Your transfer of €2,400.00 has completed",
    snippet: "Your transfer to Northwind Labs GmbH has been completed. Reference: WISE-88213...",
    priority: "medium" as const,
    reasoning: "Payment confirmation worth keeping on record.",
    labels: ["Finance"],
    daysAgo: 2,
    hoursAgo: 6,
  },
  {
    from: ["United", "receipts@united.com"],
    subject: "Check in now for flight UA 903",
    snippet: "Your flight to Chicago departs tomorrow at 7:45 AM. Check in online to save time...",
    priority: "medium" as const,
    reasoning: "Time-sensitive travel reminder for tomorrow's flight.",
    labels: ["Travel"],
    daysAgo: 3,
    hoursAgo: 2,
  },
  {
    from: ["Daniel Kim", "daniel.kim@acme-corp.io"],
    subject: "Feedback on the proposal — a few blockers",
    snippet: "Went through the proposal with legal. There are a couple of blockers we need to...",
    priority: "high" as const,
    reasoning: "Blocking feedback from a partner requiring a response.",
    labels: ["Work"],
    daysAgo: 4,
    hoursAgo: 7,
  },
  {
    from: ["Product Hunt", "hello@producthunt.com"],
    subject: "Today's top products: Aug 5",
    snippet: "🚀 #1: A new way to ship AI agents to production. #2: Design systems, reimagined...",
    priority: "low" as const,
    reasoning: "Daily digest newsletter, no action needed.",
    labels: ["Newsletters"],
    daysAgo: 5,
    hoursAgo: 9,
  },
  {
    from: ["GitHub", "noreply@github.com"],
    subject: "Your verification code is 482913",
    snippet:
      "Use the verification code below to confirm your sign-in. Code: 482913. This code expires in 10 minutes...",
    priority: "high" as const,
    reasoning: "Time-sensitive sign-in verification code, expires shortly.",
    labels: [],
    daysAgo: 0,
    hoursAgo: 0,
  },
];

const FILTER_SUGGESTION = {
  criteriaFrom: "@northwind-labs.com",
  addLabelName: "Work",
  reasoning:
    "12 messages from northwind-labs.com were manually labeled Work this month — auto-labeling the whole domain would save the repeat step.",
};

async function main() {
  const { db } = getDb();
  const mode = process.argv[2];

  // Cascading delete of any prior demo account (labels/messages/triages/
  // suggestions all reference accountId with onDelete: "cascade").
  await db.execute(sql`DELETE FROM accounts WHERE email = ${DEMO_EMAIL}`);

  if (mode === "clean") {
    await deleteClaudeCodeToken();
    console.log("cleaned demo account:", DEMO_EMAIL);
    await closeDb();
    return;
  }

  const accountId = randomUUID();
  await db.insert(schema.accounts).values({
    id: accountId,
    email: DEMO_EMAIL,
    displayName: "Demo Account",
    connectedAt: new Date(),
    scopes: [
      "https://www.googleapis.com/auth/gmail.modify",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.settings.basic",
    ],
  });

  const labelIdByName = new Map<string, string>();
  for (const l of LABELS) {
    const id = randomUUID();
    labelIdByName.set(l.name, id);
    await db.insert(schema.labels).values({
      id,
      accountId,
      gmailLabelId: `Label_${l.name}`,
      name: l.name,
      type: "user",
      colorBg: l.colorBg,
      colorFg: l.colorFg,
    });
  }

  const now = Date.now();
  let i = 0;
  for (const m of MESSAGES) {
    i += 1;
    const gmailMessageId = `demo-msg-${i}`;
    const gmailThreadId = `demo-thr-${i}`;
    const internalDate = new Date(now - m.daysAgo * 86_400_000 - m.hoursAgo * 3_600_000);

    await db.insert(schema.messages).values({
      accountId,
      gmailMessageId,
      gmailThreadId,
      fromName: m.from[0],
      fromEmail: m.from[1],
      toEmails: [DEMO_EMAIL],
      subject: m.subject,
      snippet: m.snippet,
      bodyText: m.snippet,
      internalDate,
    });

    for (const labelName of m.labels) {
      const labelId = labelIdByName.get(labelName);
      if (!labelId) continue;
      await db.insert(schema.messageLabels).values({
        accountId,
        gmailMessageId,
        labelId,
      });
    }

    await db.insert(schema.triages).values({
      accountId,
      gmailMessageId,
      priority: m.priority,
      reasoning: m.reasoning,
      model: "demo-seed",
      createdAt: internalDate,
    });
  }

  await db.insert(schema.suggestedFilters).values({
    accountId,
    criteriaFrom: FILTER_SUGGESTION.criteriaFrom,
    addLabelId: labelIdByName.get(FILTER_SUGGESTION.addLabelName) ?? null,
    addLabelName: FILTER_SUGGESTION.addLabelName,
    reasoning: FILTER_SUGGESTION.reasoning,
    status: "pending",
  });

  await setClaudeCodeToken(DEMO_CLAUDE_CODE_TOKEN);

  console.log("seeded demo account:", DEMO_EMAIL);
  console.log("account id:", accountId);
  console.log(`messages: ${MESSAGES.length}, labels: ${LABELS.length}, filter suggestions: 1`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
