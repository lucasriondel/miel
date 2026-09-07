// Seeds a fully-populated demo inbox directly into Postgres — no Gmail/OAuth
// involved. Use this to get clean, reproducible screenshots without a real
// connected account. Run: `bun run packages/cli/scripts/seed-demo.ts [clean]`
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { getDb, closeDb, schema, deleteClaudeCodeToken, setClaudeCodeToken } from "@miel/core";

const DEMO_EMAIL = "nora.beaumont@gmail.com";
const DEMO_DISPLAY_NAME = "Nora Beaumont";

// The demo account's profile picture, inlined as a data URI rather than fetched.
// A real account's avatar is a `lh3.googleusercontent.com` URL, but the demo
// stack is booted offline for screenshots, so any remote source renders as a
// broken image. An SVG data URI is self-contained: no network, no binary asset
// to keep beside this script, and it survives `avatar.tsx`'s `<img>` unchanged.
const DEMO_AVATAR_URL =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">` +
      `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0%" stop-color="#f2a33c"/><stop offset="100%" stop-color="#c2410c"/>` +
      `</linearGradient></defs>` +
      `<rect width="96" height="96" fill="url(#g)"/>` +
      `<circle cx="48" cy="38" r="16" fill="#fff" fill-opacity="0.92"/>` +
      `<path d="M16 96c0-17.7 14.3-32 32-32s32 14.3 32 32z" fill="#fff" fill-opacity="0.92"/>` +
      `</svg>`,
  );

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

/**
 * The Gmail system labels, seeded because two surfaces are drawn from them and
 * would otherwise be empty in the shot: the sidebar's mailbox nav block
 * (`LabelList` keeps `type === "system"` rows whose name `SYSTEM_LABELS` knows)
 * and the inbox's category subgroups (`pages/categoryGroups.ts`, which files a
 * message by its `CATEGORY_*` label and falls back to Primary).
 *
 * The name *is* the identifier here — both surfaces key off `name`, not off the
 * row id — so `gmailLabelId` is the same string, which is also what Gmail
 * itself returns for a system label.
 *
 * `UNREAD` is deliberately in the list: the row draws it as its weight rather
 * than as a badge, and an inbox where nothing is unread reads as a dead one.
 */
const SYSTEM_LABEL_NAMES = [
  "INBOX",
  "UNREAD",
  "STARRED",
  "IMPORTANT",
  "SENT",
  "DRAFT",
  "SPAM",
  "TRASH",
  "CATEGORY_PERSONAL",
  "CATEGORY_PROMOTIONS",
  "CATEGORY_UPDATES",
  "CATEGORY_FORUMS",
  "CATEGORY_SOCIAL",
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
    system: ["CATEGORY_UPDATES", "UNREAD", "IMPORTANT"],
    labels: [],
    daysAgo: 0,
    hoursAgo: 0,
  },
  {
    from: ["Notion", "team@makenotion.com"],
    subject: "Sign in to Notion",
    snippet:
      "Click the secure link to finish signing in: https://notion.so/auth/verify?token=8f3ca91b2d",
    priority: "high" as const,
    reasoning: "Magic sign-in link.",
    system: ["CATEGORY_UPDATES", "UNREAD"],
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
    system: ["CATEGORY_UPDATES"],
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
    system: ["CATEGORY_PERSONAL", "UNREAD", "IMPORTANT", "STARRED"],
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
    system: ["CATEGORY_UPDATES"],
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
    system: ["CATEGORY_PERSONAL", "IMPORTANT"],
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
    system: ["CATEGORY_UPDATES"],
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
    system: ["CATEGORY_PROMOTIONS"],
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
    system: ["CATEGORY_PERSONAL"],
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
    system: ["CATEGORY_UPDATES", "IMPORTANT"],
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
    system: ["CATEGORY_UPDATES"],
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
    system: ["CATEGORY_UPDATES"],
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
    system: ["CATEGORY_PROMOTIONS"],
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
    system: ["CATEGORY_PERSONAL", "UNREAD"],
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
    system: ["CATEGORY_UPDATES"],
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
    system: ["CATEGORY_PERSONAL", "UNREAD", "IMPORTANT"],
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
    system: ["CATEGORY_UPDATES"],
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
    system: ["CATEGORY_UPDATES"],
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
    system: ["CATEGORY_UPDATES", "STARRED"],
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
    system: ["CATEGORY_PERSONAL", "IMPORTANT"],
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
    system: ["CATEGORY_PROMOTIONS"],
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
    system: ["CATEGORY_UPDATES", "UNREAD", "IMPORTANT"],
    labels: [],
    daysAgo: 0,
    hoursAgo: 0,
  },
  // --- Social and forum mail, so the inbox's category subgroups and the
  // sidebar's mailbox nav have something in every band rather than three.
  {
    from: ["LinkedIn", "messages-noreply@linkedin.com"],
    subject: "Priya Shah and 4 others viewed your profile",
    snippet: "You appeared in 27 searches this week. See who's been looking at your profile...",
    priority: "low" as const,
    reasoning: "Social network digest, no action needed.",
    labels: [],
    system: ["CATEGORY_SOCIAL"],
    daysAgo: 1,
    hoursAgo: 5,
  },
  {
    from: ["Slack", "feedback@slack.com"],
    subject: "New messages in #design-system",
    snippet: "3 unread messages in your workspace, including a mention from Elena Novak...",
    priority: "low" as const,
    reasoning: "Workspace notification digest.",
    labels: [],
    system: ["CATEGORY_SOCIAL", "UNREAD"],
    daysAgo: 2,
    hoursAgo: 1,
  },
  {
    from: ["Hacker News", "digest@hackernewsletter.com"],
    subject: "Weekly digest: 20 links you missed",
    snippet: "The best of Hacker News this week, hand-picked: infrastructure, type systems and...",
    priority: "low" as const,
    reasoning: "Community digest, informational only.",
    labels: ["Newsletters"],
    system: ["CATEGORY_FORUMS"],
    daysAgo: 3,
    hoursAgo: 4,
  },
  {
    from: ["Discourse", "noreply@meta.discourse.org"],
    subject: "[Effect-TS] 6 replies to a topic you're watching",
    snippet:
      'New activity in "Layer composition across service boundaries" since your last visit...',
    priority: "low" as const,
    reasoning: "Forum thread notification, no direct action.",
    labels: [],
    system: ["CATEGORY_FORUMS"],
    daysAgo: 4,
    hoursAgo: 9,
  },

  // --- Marketing mail. Exactly one, carrying one `promo`, so the ledger's
  // promo section is one row: promos sort last in `buildLedger`, below the
  // filter proposal and every fresh verification code, so each extra one pushes
  // the whole ledger further down a 920px screenshot frame. One row is enough to
  // show the feature and cheap enough to stay in shot. The promo is grounded in
  // a message actually sitting in the list below it. The body is HTML because
  // that is what a marketing mail is, and because the saved copy the Promo Codes
  // page reads back (`bodyHtml` on the promo row) is rendered as HTML.
  //
  // Adding another means re-checking the screenshots still frame the ledger —
  // see `.claude/skills/demo-screenshots/capture.ts`, which refuses to shoot a
  // frame with no promo row visible.
  {
    from: ["Uniqlo", "news@mail.uniqlo.com"],
    subject: "Mid-season sale: 30% off everything, this weekend only",
    // No "code AUTUMN30" in the snippet, and that is the only thing keeping it
    // out: verification codes are browser-side regex over subject and snippet on
    // mail under 24h old, and this mail is same-day, so a snippet worded like an
    // OTP ("Code: XYZ") would put a discount code in a row labelled Code rather
    // than Promo. Keep discount codes out of promo snippets — the code still
    // reaches the promo row, which reads the extracted `promo` below.
    snippet: "Three days only — our biggest reductions of the season, online and in store...",
    priority: "low" as const,
    reasoning: "Marketing mail with a time-limited discount.",
    labels: [],
    system: ["CATEGORY_PROMOTIONS", "UNREAD"],
    daysAgo: 0,
    hoursAgo: 2,
    bodyHtml: `<h1>Mid-season sale</h1><p>Three days only — <strong>30% off everything</strong>, online and in store.</p><p>Use code <strong>AUTUMN30</strong> at checkout.</p><p><small>Valid on full-price items only. Cannot be combined with other offers. Ends Sunday.</small></p>`,
    promo: {
      code: "AUTUMN30",
      discount: "30% off everything",
      terms: "Full-price items only, cannot be combined with other offers",
      expiresInDays: 5,
      merchant: "Uniqlo",
      saved: false,
    },
  },

  // --- Mail whose promo the user already saved. These are trashed, which is
  // exactly what the save does (#161): the promo outlives its mail, so the
  // Promo Codes page lists them while the inbox and the suggestion strip do not.
  {
    from: ["Decathlon", "offres@decathlon.fr"],
    subject: "Vos 25€ de réduction expirent bientôt",
    snippet: "Profitez de 25€ de réduction dès 100€ d'achat avec le code SPORT25...",
    priority: "low" as const,
    reasoning: "Discount saved by the user.",
    labels: [],
    system: ["CATEGORY_PROMOTIONS"],
    daysAgo: 6,
    hoursAgo: 2,
    isTrashed: true,
    bodyHtml: `<p><strong>25€ de réduction</strong> dès 100€ d'achat.</p><p>Code : <strong>SPORT25</strong></p><p><small>Valable une fois, hors produits déjà remisés.</small></p>`,
    promo: {
      code: "SPORT25",
      discount: "25€ off orders over 100€",
      terms: "One use, excludes items already discounted",
      expiresInDays: 18,
      merchant: "Decathlon",
      saved: true,
    },
  },
  {
    from: ["Booking.com", "deals@booking.com"],
    subject: "Genius: 15% off your next stay",
    snippet: "Your Genius level unlocks 15% off thousands of properties. Code GENIUS15...",
    priority: "low" as const,
    reasoning: "Travel discount saved by the user.",
    labels: ["Travel"],
    system: ["CATEGORY_PROMOTIONS"],
    daysAgo: 8,
    hoursAgo: 7,
    isTrashed: true,
    bodyHtml: `<p>Genius level 2 unlocked.</p><p><strong>15% off your next stay</strong> with <strong>GENIUS15</strong>.</p><p><small>Selected properties. Book before the end of the month, stay any time.</small></p>`,
    promo: {
      code: "GENIUS15",
      discount: "15% off your next stay",
      terms: "Selected properties, book before month end",
      expiresInDays: 40,
      merchant: "Booking.com",
      saved: true,
    },
  },
  {
    from: ["Nespresso", "club@nespresso.com"],
    subject: "Votre offre de bienvenue : 40 capsules offertes",
    snippet: "40 capsules offertes pour toute commande de 200 capsules avec le code CAPSULE40...",
    priority: "low" as const,
    reasoning: "Loyalty offer saved by the user.",
    labels: [],
    system: ["CATEGORY_PROMOTIONS"],
    daysAgo: 40,
    hoursAgo: 3,
    isTrashed: true,
    bodyHtml: `<p><strong>40 capsules offertes</strong> dès 200 capsules achetées.</p><p>Code : <strong>CAPSULE40</strong></p>`,
    // Already lapsed, so the page has something in its expired section — which
    // is greyed and kept, never deleted.
    promo: {
      code: "CAPSULE40",
      discount: "40 free capsules with 200 bought",
      terms: "One use per Club member",
      expiresInDays: -6,
      merchant: "Nespresso",
      saved: true,
    },
  },
];

/**
 * A promo's expiry, `days` from now, stored the way the extraction stores one.
 *
 * `promoExpiry.ts` is core's rule and the only rule: a promo expires on a
 * *date*, so the column holds the last representable instant of that UTC day,
 * and one lapsing today is still valid for the whole of it. That module is not
 * on core's `exports` map, so the two lines are restated here rather than
 * widening core's public surface for a seed script — and they must stay in step
 * with it, or a promo seeded to expire tomorrow renders as expiring today in
 * `features/promos/promoExpiryLabel.ts`, which reads the instant back in UTC.
 *
 * A negative `days` is a promo that has already lapsed, which is how the Promo
 * Codes page's expired section gets a row: nothing ever deletes one.
 */
function promoExpiry(days: number): Date {
  const at = new Date(Date.now() + days * 86_400_000);
  at.setUTCHours(23, 59, 59, 999);
  return at;
}

/**
 * The one AI-proposed filter, and it is deliberately the most obvious rule in
 * the mailbox: Stripe's receipts address to Finance. A screenshot is read in a
 * second, so the pair has to be gradable at a glance by someone who has never
 * seen this inbox — a known sender, an address whose local part already says
 * what the mail is, and a label whose name is the same word. A made-up domain
 * mapped to a generic label needs the reasoning line read before it means
 * anything, which is exactly the wrong shape for a hero shot.
 *
 * It is grounded in the seed: the Stripe invoice above carries `Finance`, so
 * the rule is one the mailbox visibly already follows by hand.
 */
const FILTER_SUGGESTION = {
  criteriaFrom: "receipts@stripe.com",
  addLabelName: "Finance",
  reasoning:
    "Every Stripe receipt this month was manually labeled Finance — a filter would save doing it again next month.",
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
    displayName: DEMO_DISPLAY_NAME,
    avatarUrl: DEMO_AVATAR_URL,
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

  // System labels carry no colour of their own — the UI draws each one from its
  // own table (`components/systemLabels.ts`) and Gmail's id for them is the name.
  for (const name of SYSTEM_LABEL_NAMES) {
    const id = randomUUID();
    labelIdByName.set(name, id);
    await db.insert(schema.labels).values({
      id,
      accountId,
      gmailLabelId: name,
      name,
      type: "system",
    });
  }

  const now = Date.now();
  let promoRows = 0;
  let savedPromoRows = 0;
  let i = 0;
  for (const m of MESSAGES) {
    i += 1;
    const gmailMessageId = `demo-msg-${i}`;
    const gmailThreadId = `demo-thr-${i}`;
    const internalDate = new Date(now - m.daysAgo * 86_400_000 - m.hoursAgo * 3_600_000);
    const bodyHtml = "bodyHtml" in m ? m.bodyHtml : null;
    // The mail a saved promo came from is in the trash, because that is what
    // saving one does (#161). It keeps such a message out of the inbox list and
    // out of the suggestion strip while its promo stays on the Promo Codes page.
    const isTrashed = "isTrashed" in m ? m.isTrashed === true : false;

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
      bodyHtml,
      internalDate,
      isTrashed,
    });

    // `INBOX` is on every message that is not in the trash, because that is the
    // label the mailbox rule is written against.
    const labelNames = [...m.labels, ...m.system, ...(isTrashed ? ["TRASH"] : ["INBOX"])];
    for (const labelName of labelNames) {
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

    if ("promo" in m && m.promo) {
      const promo = m.promo;
      const saved = promo.saved === true;
      await db.insert(schema.promoCodes).values({
        accountId,
        gmailMessageId,
        code: promo.code,
        discount: promo.discount,
        terms: promo.terms,
        expiresAt: promoExpiry(promo.expiresInDays),
        merchant: promo.merchant,
        savedAt: saved ? new Date(now - 86_400_000) : null,
        createdAt: internalDate,
        // The six denormalised columns are written by the save and at no other
        // moment, so an unsaved detection leaves every one of them null — which
        // is what makes `GET /promo-codes/:id/original` answer 404 for it.
        subject: saved ? m.subject : null,
        fromName: saved ? m.from[0] : null,
        fromEmail: saved ? m.from[1] : null,
        internalDate: saved ? internalDate : null,
        bodyHtml: saved ? bodyHtml : null,
        bodyText: saved ? m.snippet : null,
      });
      promoRows += 1;
      if (saved) savedPromoRows += 1;
    }
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
  console.log(
    `messages: ${MESSAGES.length}, labels: ${LABELS.length} + ${SYSTEM_LABEL_NAMES.length} system, filter suggestions: 1`,
  );
  console.log(`promo codes: ${promoRows} (${savedPromoRows} saved)`);
  await closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
