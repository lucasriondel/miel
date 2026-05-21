import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  accounts,
  messageLabels,
  messages,
  suggestedLabels,
  triageLabelSuggestions,
  triages,
} from "../db/schema";
import { createGogAdapter, type GogAdapter } from "../adapters/gog";
import {
  createClaudeAdapter,
  type ClaudeAdapter,
} from "../adapters/claude";
import {
  GogMessageDecoded,
  type GogMessageT,
} from "../schemas/gmail";
import {
  TriageInput,
  type TriageInputItemT,
  type TriageOutputItemT,
} from "../schemas/triage";
import type { SyncServerEventT } from "../schemas/syncEvents";
import {
  extractBodies,
  extractHeaders,
  parseAddressList,
  parseFromHeader,
  parseInternalDate,
} from "../util/gmailPayload";
import { createDebug } from "../util/debug";
import { buildRangeQuery, parseSince, type DateRange } from "../util/time";
import { getAccountByEmail, syncAccountsFromGog } from "./accounts";
import {
  getLabelsByGmailIds,
  getLabelsForAccount,
  syncLabelsForAccount,
  type LabelRow,
} from "./labels";
import {
  suggestFiltersForBatch,
  syncFiltersForAccount,
} from "./filters";

const debug = createDebug("service:sync");

const TRIAGE_BATCH_SIZE = 15;
const BODY_TRUNCATION = 4000;
const DEFAULT_SEARCH_MAX = 200;

export interface SyncRunResult {
  account: string;
  fetched: number;
  triaged: number;
  suggestedNewLabels: number;
  filtersSynced: number;
  suggestedFilters: number;
  errors: string[];
}

interface NormalizedMessage {
  accountId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  subject: string | null;
  snippet: string | null;
  bodyText: string;
  bodyHtml: string;
  internalDate: Date;
  rawHeaders: Record<string, string>;
  labelIds: string[];
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function normalizeMessage(
  accountId: string,
  raw: GogMessageT,
): NormalizedMessage {
  const decodedAttempt = GogMessageDecoded.safeParse(raw);
  if (
    decodedAttempt.success &&
    (decodedAttempt.data.bodyText !== undefined ||
      decodedAttempt.data.bodyHtml !== undefined ||
      decodedAttempt.data.body !== undefined ||
      decodedAttempt.data.subject !== undefined ||
      decodedAttempt.data.from !== undefined)
  ) {
    const d = decodedAttempt.data;
    const fromParsed = parseFromHeader(d.from ?? undefined);
    const toEmails = Array.isArray(d.to)
      ? d.to
      : typeof d.to === "string"
        ? parseAddressList(d.to)
        : [];
    // gog returns decoded text body + headers at the top level, but HTML lives
    // only inside the raw multipart `payload`. Walk it for whichever piece is missing.
    const payloadBodies = extractBodies(
      raw as Extract<GogMessageT, { payload?: unknown }>,
    );
    return {
      accountId,
      gmailMessageId: d.id,
      gmailThreadId: d.threadId,
      fromEmail: fromParsed.email,
      fromName: fromParsed.name,
      toEmails,
      subject: d.subject ?? null,
      snippet: d.snippet ?? null,
      bodyText: d.bodyText ?? d.body ?? payloadBodies.bodyText,
      bodyHtml: d.bodyHtml ?? payloadBodies.bodyHtml,
      internalDate: parseInternalDate(d.internalDate),
      rawHeaders: d.headers ?? {},
      labelIds: d.labelIds ?? [],
    };
  }

  const rawShape = raw as Extract<GogMessageT, { payload?: unknown }>;
  const headers = extractHeaders(rawShape);
  const bodies = extractBodies(rawShape);
  const fromParsed = parseFromHeader(headers["from"]);
  return {
    accountId,
    gmailMessageId: rawShape.id,
    gmailThreadId: rawShape.threadId,
    fromEmail: fromParsed.email,
    fromName: fromParsed.name,
    toEmails: parseAddressList(headers["to"]),
    subject: headers["subject"] ?? null,
    snippet: rawShape.snippet ?? null,
    bodyText: bodies.bodyText,
    bodyHtml: bodies.bodyHtml,
    internalDate: parseInternalDate(rawShape.internalDate),
    rawHeaders: headers,
    labelIds: rawShape.labelIds ?? [],
  };
}

async function upsertMessages(rows: NormalizedMessage[]): Promise<void> {
  if (rows.length === 0) return;
  const { db } = getDb();
  await db
    .insert(messages)
    .values(
      rows.map((r) => ({
        accountId: r.accountId,
        gmailMessageId: r.gmailMessageId,
        gmailThreadId: r.gmailThreadId,
        fromEmail: r.fromEmail,
        fromName: r.fromName,
        toEmails: r.toEmails,
        subject: r.subject,
        snippet: r.snippet,
        bodyText: r.bodyText,
        bodyHtml: r.bodyHtml,
        internalDate: r.internalDate,
        rawHeaders: r.rawHeaders,
      })),
    )
    .onConflictDoUpdate({
      target: [messages.accountId, messages.gmailMessageId],
      set: {
        gmailThreadId: sql`excluded.gmail_thread_id`,
        fromEmail: sql`excluded.from_email`,
        fromName: sql`excluded.from_name`,
        toEmails: sql`excluded.to_emails`,
        subject: sql`excluded.subject`,
        snippet: sql`excluded.snippet`,
        bodyText: sql`excluded.body_text`,
        bodyHtml: sql`excluded.body_html`,
        internalDate: sql`excluded.internal_date`,
        rawHeaders: sql`excluded.raw_headers`,
      },
    });
}

async function upsertMessageLabels(args: {
  accountId: string;
  rows: { gmailMessageId: string; labelIds: string[] }[];
  labelMap: Map<string, string>;
}): Promise<void> {
  const inserts: {
    accountId: string;
    gmailMessageId: string;
    labelId: string;
  }[] = [];
  for (const row of args.rows) {
    for (const gmailLabelId of row.labelIds) {
      const labelId = args.labelMap.get(gmailLabelId);
      if (!labelId) continue;
      inserts.push({
        accountId: args.accountId,
        gmailMessageId: row.gmailMessageId,
        labelId,
      });
    }
  }
  if (inserts.length === 0) return;
  const { db } = getDb();
  await db.insert(messageLabels).values(inserts).onConflictDoNothing();
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

function buildTriageItems(
  rows: NormalizedMessage[],
  labelsByGmailId: Map<string, LabelRow>,
): TriageInputItemT[] {
  return rows.map((r) => ({
    id: r.gmailMessageId,
    from: r.fromEmail,
    to: r.toEmails,
    subject: r.subject,
    snippet: r.snippet,
    body: truncate(r.bodyText, BODY_TRUNCATION),
    internalDate: r.internalDate.toISOString(),
    currentLabels: r.labelIds
      .map((id) => labelsByGmailId.get(id)?.name)
      .filter((n): n is string => Boolean(n)),
  }));
}

async function persistTriageResults(args: {
  accountId: string;
  model: string;
  runId: string;
  byMessageId: Map<string, NormalizedMessage>;
  labelsByName: Map<string, LabelRow>;
  items: TriageOutputItemT[];
}): Promise<{ persisted: number; newLabelSuggestions: number }> {
  const { db } = getDb();
  let persisted = 0;
  let newLabelSuggestions = 0;

  for (const item of args.items) {
    const msg = args.byMessageId.get(item.id);
    if (!msg) continue;

    const inserted = await db
      .insert(triages)
      .values({
        accountId: args.accountId,
        gmailMessageId: msg.gmailMessageId,
        priority: item.priority,
        reasoning: item.reasoning,
        claudeRunId: args.runId,
        model: args.model,
      })
      .returning({ id: triages.id });
    const triageId = inserted[0].id;
    persisted += 1;

    const labelSuggestionRows: { triageId: string; labelId: string }[] = [];
    for (const name of item.applyExistingLabels) {
      const label = args.labelsByName.get(name);
      if (!label) continue;
      labelSuggestionRows.push({ triageId, labelId: label.id });
    }
    if (labelSuggestionRows.length > 0) {
      await db
        .insert(triageLabelSuggestions)
        .values(labelSuggestionRows)
        .onConflictDoNothing();
    }

    if (item.suggestNewLabels.length > 0) {
      await db.insert(suggestedLabels).values(
        item.suggestNewLabels.map((s) => ({
          triageId,
          name: s.name,
          reasoning: s.reasoning,
        })),
      );
      newLabelSuggestions += item.suggestNewLabels.length;
    }
  }
  return { persisted, newLabelSuggestions };
}

export interface FetchAndTriageOptions {
  accountEmail: string;
  since?: string;
  range?: DateRange;
  max?: number;
  gog?: GogAdapter;
  claude?: ClaudeAdapter;
  log?: (msg: string) => void;
  onEvent?: (event: SyncServerEventT) => void;
}

export async function fetchAndTriage(
  opts: FetchAndTriageOptions,
): Promise<SyncRunResult> {
  const gog = opts.gog ?? createGogAdapter();
  const claude = opts.claude ?? createClaudeAdapter();
  const log = opts.log ?? (() => {});
  const emit = opts.onEvent ?? (() => {});
  const max = opts.max ?? DEFAULT_SEARCH_MAX;
  const query = opts.range
    ? buildRangeQuery(opts.range)
    : parseSince(opts.since ?? "7d");
  const errors: string[] = [];

  debug("fetchAndTriage start", {
    accountEmail: opts.accountEmail,
    since: opts.since,
    range: opts.range,
    max,
    query,
  });

  const account = await getAccountByEmail(opts.accountEmail);
  if (!account) {
    debug("fetchAndTriage account not synced", { accountEmail: opts.accountEmail });
    throw new Error(
      `Account not synced: ${opts.accountEmail}. Run accounts sync first.`,
    );
  }

  log(`[${account.email}] syncing labels`);
  debug("syncing labels", { account: account.email });
  await syncLabelsForAccount({
    accountId: account.id,
    accountEmail: account.email,
    gog,
  });
  const allLabels = await getLabelsForAccount(account.id);
  const labelsByName = new Map(allLabels.map((l) => [l.name, l]));
  debug("labels loaded", { account: account.email, count: allLabels.length });

  log(`[${account.email}] syncing filters`);
  let filtersSyncedCount = 0;
  try {
    const syncedFilters = await syncFiltersForAccount({
      accountId: account.id,
      accountEmail: account.email,
      gog,
    });
    filtersSyncedCount = syncedFilters.length;
    log(`[${account.email}] ${filtersSyncedCount} filter(s)`);
  } catch (err) {
    const m = (err as Error).message;
    errors.push(`syncFilters: ${m}`);
    log(`[${account.email}] WARN syncFilters failed: ${m}`);
  }

  log(`[${account.email}] searching messages (${query}, max=${max})`);
  const hits = await gog.searchMessages({
    account: account.email,
    query,
    max,
  });
  log(`[${account.email}] ${hits.length} hits`);
  debug("search hits", { account: account.email, hits: hits.length });

  const normalized: NormalizedMessage[] = [];
  for (const hit of hits) {
    try {
      const msg = await gog.getMessage({
        account: account.email,
        messageId: hit.messageId,
      });
      normalized.push(normalizeMessage(account.id, msg));
    } catch (err) {
      const m = (err as Error).message;
      errors.push(`getMessage(${hit.messageId}): ${m}`);
      log(`[${account.email}] WARN getMessage failed for ${hit.messageId}: ${m}`);
      debug("getMessage failed", {
        account: account.email,
        messageId: hit.messageId,
        error: m,
      });
    }
  }

  debug("normalized messages", {
    account: account.email,
    count: normalized.length,
  });

  if (normalized.length === 0) {
    debug("nothing to triage", { account: account.email });
    const { db } = getDb();
    await db
      .update(accounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(accounts.id, account.id));
    return {
      account: account.email,
      fetched: 0,
      triaged: 0,
      suggestedNewLabels: 0,
      filtersSynced: filtersSyncedCount,
      suggestedFilters: 0,
      errors,
    };
  }

  await upsertMessages(normalized);
  debug("upserted messages", { account: account.email, rows: normalized.length });
  emit({ type: "mails.fetched", account: account.email, count: normalized.length });
  const allGmailLabelIds = Array.from(
    new Set(normalized.flatMap((m) => m.labelIds)),
  );
  const matchedLabels = await getLabelsByGmailIds({
    accountId: account.id,
    gmailLabelIds: allGmailLabelIds,
  });
  const labelsByGmailId = new Map(matchedLabels.map((l) => [l.gmailLabelId, l]));
  await upsertMessageLabels({
    accountId: account.id,
    rows: normalized.map((r) => ({
      gmailMessageId: r.gmailMessageId,
      labelIds: r.labelIds,
    })),
    labelMap: new Map(matchedLabels.map((l) => [l.gmailLabelId, l.id])),
  });
  debug("upserted message_labels", {
    account: account.email,
    distinctGmailLabels: allGmailLabelIds.length,
    matchedLabels: matchedLabels.length,
  });

  const existingLabelNames = allLabels
    .filter((l) => l.type === "user")
    .map((l) => l.name);

  const batches = chunk(normalized, TRIAGE_BATCH_SIZE);
  log(
    `[${account.email}] running ${batches.length} triage batch(es) over ${normalized.length} messages (in parallel with filter suggest)`,
  );
  emit({
    type: "triage.started",
    account: account.email,
    totalBatches: batches.length,
  });

  interface BatchOutcome {
    persisted: number;
    newLabelSuggestions: number;
    errors: string[];
  }

  const runTriageBatch = async (
    batch: NormalizedMessage[],
    i: number,
  ): Promise<BatchOutcome> => {
    const items = buildTriageItems(batch, labelsByGmailId);
    const input = TriageInput.parse({
      account: account.email,
      existingLabels: existingLabelNames,
      messages: items,
    });
    emit({
      type: "triage.batch.progress",
      account: account.email,
      batchIndex: i,
      totalBatches: batches.length,
      status: "started",
    });
    const localErrors: string[] = [];
    try {
      log(`[${account.email}] batch ${i + 1}/${batches.length} → claude`);
      debug("triage batch start", {
        account: account.email,
        batch: i + 1,
        of: batches.length,
        items: items.length,
      });
      const { output, runId, model } = await claude.runTriage(input);
      debug("triage batch returned", {
        account: account.email,
        batch: i + 1,
        results: output.results.length,
        runId,
        model,
      });
      const byId = new Map(batch.map((m) => [m.gmailMessageId, m]));
      const returnedIds = new Set(output.results.map((r) => r.id));
      const missing = items.filter((m) => !returnedIds.has(m.id));
      if (missing.length > 0) {
        const m = `triage batch ${i + 1} dropped ids: ${missing.map((x) => x.id).join(",")}`;
        localErrors.push(m);
        log(`[${account.email}] WARN ${m}`);
      }
      const extras = output.results.filter((r) => !byId.has(r.id));
      if (extras.length > 0) {
        const m = `triage batch ${i + 1} returned unknown ids: ${extras.map((x) => x.id).join(",")}`;
        localErrors.push(m);
        log(`[${account.email}] WARN ${m}`);
      }
      const persisted = await persistTriageResults({
        accountId: account.id,
        model,
        runId,
        byMessageId: byId,
        labelsByName,
        items: output.results.filter((r) => byId.has(r.id)),
      });
      debug("triage batch persisted", {
        account: account.email,
        batch: i + 1,
        persisted: persisted.persisted,
        newLabelSuggestions: persisted.newLabelSuggestions,
      });
      emit({
        type: "triage.batch.progress",
        account: account.email,
        batchIndex: i,
        totalBatches: batches.length,
        status: "done",
      });
      return {
        persisted: persisted.persisted,
        newLabelSuggestions: persisted.newLabelSuggestions,
        errors: localErrors,
      };
    } catch (err) {
      const m = (err as Error).message;
      localErrors.push(`triage batch ${i + 1}: ${m}`);
      log(`[${account.email}] ERROR triage batch ${i + 1}: ${m}`);
      debug("triage batch failed", {
        account: account.email,
        batch: i + 1,
        error: m,
      });
      emit({
        type: "triage.batch.progress",
        account: account.email,
        batchIndex: i,
        totalBatches: batches.length,
        status: "failed",
        error: m,
      });
      return { persisted: 0, newLabelSuggestions: 0, errors: localErrors };
    }
  };

  const runFilterSuggest = async (): Promise<{
    suggestedFilters: number;
    errors: string[];
  }> => {
    emit({ type: "filters.started", account: account.email });
    try {
      log(
        `[${account.email}] running filter suggestions over ${normalized.length} messages`,
      );
      const proposals = await suggestFiltersForBatch({
        accountId: account.id,
        accountEmail: account.email,
        messages: normalized.map((m) => ({
          id: m.gmailMessageId,
          from: m.fromEmail,
          subject: m.subject,
          snippet: m.snippet,
          currentLabels: m.labelIds
            .map((id) => labelsByGmailId.get(id)?.name)
            .filter((n): n is string => Boolean(n)),
        })),
        claude,
      });
      log(
        `[${account.email}] filter suggestions: ${proposals.created} new, ${proposals.skipped} skipped`,
      );
      return { suggestedFilters: proposals.created, errors: [] };
    } catch (err) {
      const m = (err as Error).message;
      log(`[${account.email}] WARN filterSuggest failed: ${m}`);
      return { suggestedFilters: 0, errors: [`filterSuggest: ${m}`] };
    }
  };

  const batchPromise = Promise.allSettled(
    batches.map((batch, i) => runTriageBatch(batch, i)),
  );
  const filterPromise = runFilterSuggest();
  const [batchResults, filterResult] = await Promise.all([
    batchPromise,
    filterPromise,
  ]);

  let triagedCount = 0;
  let suggestedNewLabelsCount = 0;
  for (let i = 0; i < batchResults.length; i += 1) {
    const r = batchResults[i];
    if (r.status === "fulfilled") {
      triagedCount += r.value.persisted;
      suggestedNewLabelsCount += r.value.newLabelSuggestions;
      errors.push(...r.value.errors);
    } else {
      const m = (r.reason as Error)?.message ?? String(r.reason);
      errors.push(`triage batch ${i + 1}: ${m}`);
      log(`[${account.email}] ERROR triage batch ${i + 1} rejected: ${m}`);
    }
  }

  emit({
    type: "triage.finished",
    account: account.email,
    triaged: triagedCount,
    suggestedNewLabels: suggestedNewLabelsCount,
  });

  const suggestedFiltersCount = filterResult.suggestedFilters;
  errors.push(...filterResult.errors);
  emit({
    type: "filters.finished",
    account: account.email,
    suggestedFilters: suggestedFiltersCount,
  });

  const { db } = getDb();
  await db
    .update(accounts)
    .set({ lastSyncedAt: new Date() })
    .where(eq(accounts.id, account.id));

  const result = {
    account: account.email,
    fetched: normalized.length,
    triaged: triagedCount,
    suggestedNewLabels: suggestedNewLabelsCount,
    filtersSynced: filtersSyncedCount,
    suggestedFilters: suggestedFiltersCount,
    errors,
  };
  debug("fetchAndTriage done", result);
  return result;
}

export interface SyncAllOptions {
  accountEmail?: string;
  since?: string;
  range?: DateRange;
  max?: number;
  gog?: GogAdapter;
  claude?: ClaudeAdapter;
  log?: (msg: string) => void;
  onEvent?: (event: SyncServerEventT) => void;
}

export async function syncAll(opts: SyncAllOptions = {}): Promise<SyncRunResult[]> {
  debug("syncAll start", {
    accountEmail: opts.accountEmail ?? "(all)",
    since: opts.since,
    range: opts.range,
    max: opts.max,
  });
  const gog = opts.gog ?? createGogAdapter();
  await syncAccountsFromGog(gog);

  const { db } = getDb();
  const targets = opts.accountEmail
    ? await db
        .select({ email: accounts.email })
        .from(accounts)
        .where(eq(accounts.email, opts.accountEmail))
    : await db.select({ email: accounts.email }).from(accounts);

  debug("syncAll targets", { count: targets.length });

  const results: SyncRunResult[] = [];
  for (const target of targets) {
    results.push(
      await fetchAndTriage({
        accountEmail: target.email,
        since: opts.since,
        range: opts.range,
        max: opts.max,
        gog,
        claude: opts.claude,
        log: opts.log,
        onEvent: opts.onEvent,
      }),
    );
  }
  debug("syncAll done", { runs: results.length });
  return results;
}
