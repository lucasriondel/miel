# Promo codes — design

Detect promotional codes in incoming mail, surface them above the inbox list as
suggestions, and let one click save the promo plus a copy of its mail while
trashing the Gmail original. Saved promos live on a new global page.

Settled through a grilling session; every decision below was made explicitly.
Where a decision closes a door, the door is named.

## What this is not

The feature reads as "like the OTP detection", but structurally it is the
opposite of it, and that is deliberate.

OTP detection is **browser-side regex with no persistence**:
`packages/web/src/utils/detectConfirmation.ts:104` runs on every render, and the
inbox strip calls it with `bodyHtml: null`
(`features/codes/collectVerificationCodes.ts:39`) because `ListedMessage`
carries no body. That works because an OTP is in the subject or snippet.

**A promo code is not.** It is in the HTML, three screens down, next to two other
offers, with an expiry stated as "ends Sunday". So promo detection is a
server-side AI task whose output is persisted — nothing about the OTP
implementation is reused.

## The extraction task

A fourth `ModelTask`, `promo-extract`, added as a row in `claude/tasks.ts`
alongside triage / reply / filter-suggest. The table exists precisely so the
fourth task is a row and not a fourth copy of the hosted-vs-CLI transport
branch.

**Runs on new messages only.** After fetch, in the account loop, on the messages
that fetch just upserted. Never on anything else. There is no re-extraction, no
backfill, and no extraction-attempted marker — a message that has been fetched
has been through the task exactly once, and "found nothing" is indistinguishable
from "never asked" because nothing ever asks twice.

> Consequence, accepted: the feature is blind to the existing mailbox. At ship
> time the suggestions section is empty and fills forward as new mail arrives.
> Adding backfill later means re-extracting a range wholesale, since there is no
> marker to skip what was already done.

**One message per model call.** Not batched. A batch of stripped marketing mails
invites the model to attribute a code from one message to another — a silent
wrong answer that lands in a row the user trusts at a checkout. Cost is
controlled by the prefilter, not by batching.

### The prefilter

A pure module, `services/promoPrefilter.ts`, deciding which new messages are
worth a model call. **Content only** — no sender directory. A retailer list is
the vocabulary-file problem `confirmationKeywords.ts` already has, and it never
covers the shop you actually buy from.

Signals, in order of weight:

- language-neutral: `%`, currency symbols near an off/reduction word,
  code-shaped uppercase runs;
- a small multilingual word set beside them, reusing
  `confirmationKeywords.ts`'s `foldAccents`.

Cheap, dumb, generous. A false positive costs one model call; a false negative
costs the feature.

### What the model sees

The mail's **stripped visible text** — HTML noise removed, `<style>`/`<script>`
contents dropped, entities decoded, whitespace collapsed. Not raw HTML.
Truncated at **8000 chars**, reusing the reply-drafting limit already published
in `claudeUsage.ts`.

Both prompts — CLI and hosted — inline that text. The CLI prompt does *not* get
the "curl the body from the local API" paragraph; the two transports behave
identically and neither depends on a tool.

The prompt states the message's received date explicitly, so the model can
resolve a relative expiry ("ends Sunday") into an absolute one. Resolving those
in code would mean reimplementing date parsing across five languages.

> **Disclosure change.** `claudeUsage.ts` currently publishes that triage sends
> only sender/subject/snippet, and the landing page and privacy page derive
> their copy from those constants — `contributorDocs.test.ts` and the landing
> page's `guide.test.ts` assert it. A body-bearing task changes that promise and
> the published copy must say so. Stated the way the existing copy is: what the
> task sends, not who receives it. The vendor is named by the user's own
> provider pick, so the copy cannot and should not name one.

### Output schema

Zero or more promos per message — a retailer's mail routinely carries three, and
first-code-wins would silently drop data the model already found.

| field | nullable | notes |
| --- | --- | --- |
| `code` | yes | null for "no code needed, applied at checkout" |
| `discount` | no | the badge headline — `20% off` |
| `terms` | yes | the qualifying rest — `orders over £50, excl. sale` |
| `expiresAt` | yes | absolute ISO date, or null. **Never guessed.** |
| `merchant` | yes | falls back to the message's `fromName` |

The `discount` / `terms` split is a stated rule in the prompt, not a judgement
call left to the model — without one it splits inconsistently.

`merchant` is worth asking for despite the message carrying `fromName`: the
sender is `newsletter@email.marketing-cloud.zara.com` and a saved promo outlives
its context, so the page needs a name recognisable at a checkout.

**No confidence score.** A score invites a threshold nobody can tune, and there
is no feedback loop to tune it against. An empty array is the negative answer.

`expiresAt` is stored as `timestamptz` at **end-of-day UTC** and treated as a
date, never an instant — the UI shows a date, never a time. A promo reading
expired while the shop still honours it is the annoying failure; the reverse
costs one failed checkout attempt.

### Failure handling

One message's extraction failure is logged and skipped; the phase continues. A
malformed model response on one marketing mail must never cost a sync that
triaged fine.

Only provider-unavailable propagates, through the existing shared combinator
`sync/providerFailure.ts` — a third task inventing its own catch is the exact
drift #126 fixed.

No new sync WebSocket event. It is a step inside fetch, and a new wire event
would mean the `SyncServerEvent` / `ReceivedSyncServerEvent` compatibility dance
CLAUDE.md describes. Log it; surface it later if it is missed.

## Data model

One table, `promo_codes`. One row per code. FK `(account_id, gmail_message_id)`
→ `messages`.

Two states on one row: **suggested** (extraction wrote it) and **saved**
(`saved_at` non-null, the user acted). Persisting at extraction time rather than
deriving on read is the point — the extraction cost a model call, and throwing
it away means re-paying on every render.

The extracted five fields, plus, **copied at save time**:

- `subject`, `from_name`, `from_email`, `internal_date`
- `body_html` — for a faithful "view original email"
- `body_text` — the stripped text, as fallback

The mail is being deleted from Gmail, so this copy is the only one a user will
ever see. The denormalisation is what makes the saved promo independent of the
`messages` row.

## Sync integration

```
fetch → (new messages) → prefilter → promo-extract → write promo_codes rows
                                                   ↓
                                                 triage
```

The prefilter and extraction live in `services/promoCodes.ts`, called by the
sync step — not inline in `sync/steps.ts`, which already has enough concerns.
The pure prefilter is unit-testable with no model and no database, which is
where the regression risk actually is.

## The inbox suggestions section

Above the message list, where `VerificationCodeStrip` sits
(`InboxPage.tsx`'s `InboxBody`, first child of the sections column).

**Suggestions only.** A saved promo never appears here — one button, the row
leaves on click, and the Promo Codes page is where saved promos live. No saved
badge, no second control.

- **Horizontal scrolling row of cards.** A pill cannot hold four fields; the OTP
  pill's shape does not transfer.
- **No age limit.** The OTP strip drops anything over 24h
  (`collectVerificationCodes.ts:16`); a promo's own `expires_at` is the real age
  rule, and a 3-week-old code valid till Christmas is exactly what should
  surface. Already-expired promos are hidden.
- **Capped at ~6**, the rest reachable on the Promo Codes page.
- **De-duped by code within the window** — the same `SUMMER25` arriving in three
  reminder mails shows once.
- **Renders nothing when empty.** No empty state. An always-present section that
  is usually empty is permanent chrome tax on the inbox.

**Scoped to the current list** — same `accountId` / `from` / `to` the message
list is using. Scoping happens by passing the period filter to the server query,
not by filtering client-side over `items`, because the list payload has no
bodies and therefore no promos.

A promo whose message has been removed or trashed is not shown. Unsaved
detections follow their message; saving is the act that makes a promo outlive
it. One rule, not two.

### The save button

**One button: save the promo and the mail copy, then trash the Gmail original.**

Ordering is load-bearing and is the reason this lives in a core service rather
than a click handler:

1. **Save first** — write the promo row with its denormalised message copy.
2. **Then trash** — reuse the existing `trashMessage` (`apply.ts:389`), which
   trashes the *thread* via `users.threads.modify` (add `TRASH`, remove
   `INBOX`).

A failed trash leaves the promo saved: recoverable, mildly confusing. The
reverse order would allow trash-succeeds-then-save-fails, which deletes the mail
and loses the promo — **not recoverable from the UI**. That is why the ordering
is a rule in a testable service and not something each future caller
reimplements.

> This departs from `apply.ts`'s usual guarantee, where Gmail is told before
> anything is written locally so the mailbox and DB cannot disagree. Two writes
> with no such guarantee is the accepted cost of the single-button design.

**Trash, not permanent delete.** Permanent delete needs `users.messages.delete`
and the `https://mail.google.com/` scope — full mailbox access, re-consented by
every existing account, irreversible. That is a large escalation to make one
button 30 days more final. The local row keeps its bodies forever
(`reconcile.ts` is soft-only: *"triages and labels stay attached so history is
preserved"*), so "view original email" survives Gmail's own trash purge
regardless.

The card leaves the section optimistically on click, alongside the mail leaving
the list. `api/messageMutation.ts` already owns optimistic-plus-rollback for the
`["messages"]` lists; the promo query needs the same, or the section shows a
promo whose mail is visibly gone. This is the one place the two query keys must
be invalidated together.

## The Promo Codes page

Route `/promo-codes` — **global**, not account-scoped. Beside `/logs` and
`/settings` in `router.tsx`, one entry in `SidebarFooterNav.tsx`. A top-level
route is automatically excluded from the default-account redirect at
`App.tsx:45`.

A promo code is a thing you use at a checkout; which mailbox it arrived in is
trivia. The account is a column, not a filter you must satisfy before seeing
anything.

Two sections:

- **Active** — sorted by expiry **soonest-first, nulls last**. The page answers
  "what can I still use, and what is about to lapse", so a code expiring
  tomorrow is the most urgent row regardless of when it was saved.
- **Expired** — below, greyed, **never auto-deleted**. An expired code with a
  saved copy of its mail is still evidence of what a shop offered. Deletion is
  always manual.

Per row:

- **Copy code** — clipboard write plus a transient "Copied". **No state change.**
  Copying is not using; you copy to check whether it works, and a "used" flag
  would need un-marking with no signal that the code was ever redeemed.
- **Edit** — inline, **all five extracted fields**. They are all model guesses on
  deliberately slippery marketing prose, and locking any subset means the one
  locked field is the wrong one. This is the escape hatch that makes an
  imperfect extractor acceptable. The message copy stays immutable — that is a
  record, not a guess.
- **View original email** — renders the denormalised `body_html`.
- **Delete entry.**

Duplicates are not deduped on the saved page — a duplicate there is the user
having saved it twice, which is their business.

## API surface

| method | path | purpose |
| --- | --- | --- |
| `GET` | `/promo-codes` | suggestions; account + range scoped, unsaved only |
| `GET` | `/saved-promo-codes` | the page |
| `POST` | `/promo-codes/:id/save` | save + trash, in that order, server-side |
| `PATCH` | `/saved-promo-codes/:id` | edit the five fields |
| `DELETE` | `/saved-promo-codes/:id` | delete the entry |

Suggestions get their **own endpoint and own query key**, not a `promos` array
widened onto `ListedMessage`. The two have different lifetimes and invalidation
(saving should not refetch the mail list; trashing should touch both), and
`ListedMessage` is the payload sent for every row — hanging a variable-length
array off it costs every message to serve a feature that hits few.

Routes stay thin: shape-validate with Zod, delegate to core services.

## Assumptions worth guarding

- **Nothing hard-deletes a `messages` row.** Save-time denormalisation makes the
  saved promo independent of this, so a future prune job would not orphan
  anything — but "view original email" reads the denormalised copy precisely
  because the FK's target is not guaranteed forever.
- **No backfill, no marker.** Deliberate (see above). If backfill is ever added,
  it must re-extract a range wholesale.
