import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb } from "../db/client";
import {
  accounts,
  messageLabels,
  messages,
  suggestedLabels,
  syncWindows,
  triageLabelSuggestions,
  triages,
} from "../db/schema";
import { createGogAdapter, type GogAdapter } from "../adapters/gog";
import {
  ClaudeNotLoggedInError,
  ReauthRequiredError,
  ShellError,
} from "../adapters/shell";
import {
  createClaudeAdapter,
  type ClaudeAdapter,
} from "../adapters/claude";
import { startClaudeLoginForEvent } from "../adapters/claudeAuth";
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
import { resolveSyncRange, type DateRange } from "../util/time";
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
  // Slim payload: sender + subject + snippet + current labels only. The model
  // fetches the full body on demand (see buildTriagePrompt) when it can't decide.
  return rows.map((r) => ({
    id: r.gmailMessageId,
    from: r.fromEmail,
    subject: r.subject,
    snippet: r.snippet,
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

interface RunTriageBatchesArgs {
  accountId: string;
  accountEmail: string;
  batches: NormalizedMessage[][];
  labelsByGmailId: Map<string, LabelRow>;
  labelsByName: Map<string, LabelRow>;
  existingLabelNames: string[];
  claude: ClaudeAdapter;
  log: (msg: string) => void;
  emit: (event: SyncServerEventT) => void;
}

interface RunTriageBatchesResult {
  triaged: number;
  suggestedNewLabels: number;
  errors: string[];
}

async function runTriageBatches(
  args: RunTriageBatchesArgs,
): Promise<RunTriageBatchesResult> {
  const {
    accountId,
    accountEmail,
    batches,
    labelsByGmailId,
    labelsByName,
    existingLabelNames,
    claude,
    log,
    emit,
  } = args;

  const triageStartMs = Date.now();
  emit({
    type: "triage.started",
    account: accountEmail,
    totalBatches: batches.length,
  });

  interface BatchOutcome {
    persisted: number;
    newLabelSuggestions: number;
    errors: string[];
  }

  const runOne = async (
    batch: NormalizedMessage[],
    i: number,
  ): Promise<BatchOutcome> => {
    const items = buildTriageItems(batch, labelsByGmailId);
    const input = TriageInput.parse({
      account: accountEmail,
      accountId,
      existingLabels: existingLabelNames,
      messages: items,
    });
    emit({
      type: "triage.batch.progress",
      account: accountEmail,
      batchIndex: i,
      totalBatches: batches.length,
      status: "started",
    });
    const localErrors: string[] = [];
    try {
      log(`[${accountEmail}] batch ${i + 1}/${batches.length} → claude`);
      debug("triage batch start", {
        account: accountEmail,
        batch: i + 1,
        of: batches.length,
        items: items.length,
      });
      const { output, runId, model } = await claude.runTriage(input);
      debug("triage batch returned", {
        account: accountEmail,
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
        log(`[${accountEmail}] WARN ${m}`);
      }
      const extras = output.results.filter((r) => !byId.has(r.id));
      if (extras.length > 0) {
        const m = `triage batch ${i + 1} returned unknown ids: ${extras.map((x) => x.id).join(",")}`;
        localErrors.push(m);
        log(`[${accountEmail}] WARN ${m}`);
      }
      const persisted = await persistTriageResults({
        accountId,
        model,
        runId,
        byMessageId: byId,
        labelsByName,
        items: output.results.filter((r) => byId.has(r.id)),
      });
      debug("triage batch persisted", {
        account: accountEmail,
        batch: i + 1,
        persisted: persisted.persisted,
        newLabelSuggestions: persisted.newLabelSuggestions,
      });
      emit({
        type: "triage.batch.progress",
        account: accountEmail,
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
      // Claude not being logged in is global, not a per-batch failure: let it
      // escape so syncAll can drive a single login flow (like ReauthRequiredError
      // for gog). Marking the batch "failed" would bury it as a generic error.
      if (err instanceof ClaudeNotLoggedInError) throw err;
      const m = (err as Error).message;
      localErrors.push(`triage batch ${i + 1}: ${m}`);
      log(`[${accountEmail}] ERROR triage batch ${i + 1}: ${m}`);
      debug("triage batch failed", {
        account: accountEmail,
        batch: i + 1,
        error: m,
      });
      emit({
        type: "triage.batch.progress",
        account: accountEmail,
        batchIndex: i,
        totalBatches: batches.length,
        status: "failed",
        error: m,
      });
      return { persisted: 0, newLabelSuggestions: 0, errors: localErrors };
    }
  };

  const results = await Promise.allSettled(
    batches.map((batch, i) => runOne(batch, i)),
  );

  let triaged = 0;
  let suggestedNewLabels = 0;
  const errors: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    if (r.status === "fulfilled") {
      triaged += r.value.persisted;
      suggestedNewLabels += r.value.newLabelSuggestions;
      errors.push(...r.value.errors);
    } else {
      // Propagate a not-logged-in rejection up to syncAll, which spawns the login
      // flow once for the whole run. Don't emit triage.finished in this case —
      // the web's claude-login handler dismisses the in-flight triage toast.
      if (r.reason instanceof ClaudeNotLoggedInError) throw r.reason;
      const m = (r.reason as Error)?.message ?? String(r.reason);
      errors.push(`triage batch ${i + 1}: ${m}`);
      log(`[${accountEmail}] ERROR triage batch ${i + 1} rejected: ${m}`);
    }
  }

  emit({
    type: "triage.finished",
    account: accountEmail,
    triaged,
    suggestedNewLabels,
    elapsedMs: Date.now() - triageStartMs,
  });

  return { triaged, suggestedNewLabels, errors };
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
  /**
   * When false, fetch + sync labels/filters + upsert messages only; skip all
   * Claude calls (triage batches and filter suggestions). The Sync button uses
   * this; triage is then triggered manually via `triageUntriagedForAccount`.
   * Defaults to true.
   */
  triage?: boolean;
}

export async function fetchAndTriage(
  opts: FetchAndTriageOptions,
): Promise<SyncRunResult> {
  const gog = opts.gog ?? createGogAdapter();
  const claude = opts.claude ?? createClaudeAdapter();
  const log = opts.log ?? (() => {});
  const emit = opts.onEvent ?? (() => {});
  const max = opts.max ?? DEFAULT_SEARCH_MAX;
  const resolved = resolveSyncRange({ since: opts.since, range: opts.range });
  const { query } = resolved;
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

  const { db } = getDb();
  const [{ id: syncWindowId }] = await db
    .insert(syncWindows)
    .values({
      accountId: account.id,
      rangeFrom: resolved.from,
      rangeTo: resolved.to,
      query,
    })
    .returning({ id: syncWindows.id });
  debug("sync window opened", {
    id: syncWindowId,
    from: resolved.from.toISOString(),
    to: resolved.to.toISOString(),
  });

  let messagesFetched = 0;
  let messagesNew = 0;
  try {

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

  const hitIds = hits.map((h) => h.messageId);
  const existingIds = hitIds.length
    ? new Set(
        (
          await db
            .select({ gmailMessageId: messages.gmailMessageId })
            .from(messages)
            .where(
              and(
                eq(messages.accountId, account.id),
                inArray(messages.gmailMessageId, hitIds),
              ),
            )
        ).map((r) => r.gmailMessageId),
      )
    : new Set<string>();
  const newHits = hits.filter((h) => !existingIds.has(h.messageId));
  log(
    `[${account.email}] ${newHits.length} new (skipping ${existingIds.size} already in db)`,
  );
  debug("new hits after dedupe", {
    account: account.email,
    newHits: newHits.length,
    skipped: existingIds.size,
  });

  const normalized: NormalizedMessage[] = [];
  for (const hit of newHits) {
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

  messagesFetched = hits.length;
  messagesNew = normalized.length;

  if (normalized.length === 0) {
    debug("nothing to triage", { account: account.email });
    emit({ type: "mails.fetched", account: account.email, count: 0 });
    await db
      .update(accounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(accounts.id, account.id));
    await db
      .update(syncWindows)
      .set({
        status: "completed",
        messagesFetched,
        messagesNew,
        finishedAt: new Date(),
      })
      .where(eq(syncWindows.id, syncWindowId));
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

  // Fetch-only mode (Sync button): messages + labels + filters are now in the
  // DB; stop before any Claude call. Finalize the account/window exactly like
  // the normal completion path so the next sync dedupes correctly. Triage is
  // run later, on demand, via `triageUntriagedForAccount`.
  if (opts.triage === false) {
    await db
      .update(accounts)
      .set({ lastSyncedAt: new Date() })
      .where(eq(accounts.id, account.id));
    await db
      .update(syncWindows)
      .set({
        status: "completed",
        messagesFetched,
        messagesNew,
        error: errors.length > 0 ? errors.join("\n") : null,
        finishedAt: new Date(),
      })
      .where(eq(syncWindows.id, syncWindowId));
    debug("fetchAndTriage done (fetch-only)", {
      account: account.email,
      fetched: normalized.length,
      filtersSynced: filtersSyncedCount,
    });
    return {
      account: account.email,
      fetched: normalized.length,
      triaged: 0,
      suggestedNewLabels: 0,
      filtersSynced: filtersSyncedCount,
      suggestedFilters: 0,
      errors,
    };
  }

  // NOTE: the triage batches AND filter suggestions below only run when
  // triage:true. No current caller sets that (the Sync button passes
  // triage:false; the Triage button uses triageUntriagedForAccount, which never
  // ran filter suggestions). Kept intact for the wire contract / future
  // re-enable rather than deleted.
  const batches = chunk(normalized, TRIAGE_BATCH_SIZE);
  log(
    `[${account.email}] running ${batches.length} triage batch(es) over ${normalized.length} messages (in parallel with filter suggest)`,
  );

  const batchPromise = runTriageBatches({
    accountId: account.id,
    accountEmail: account.email,
    batches,
    labelsByGmailId,
    labelsByName,
    existingLabelNames,
    claude,
    log,
    emit,
  });

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
      // Like the triage path: a not-logged-in error is global, not a filter
      // failure — let it escape so syncAll can drive the login flow.
      if (err instanceof ClaudeNotLoggedInError) throw err;
      const m = (err as Error).message;
      log(`[${account.email}] WARN filterSuggest failed: ${m}`);
      return { suggestedFilters: 0, errors: [`filterSuggest: ${m}`] };
    }
  };

  const filterPromise = runFilterSuggest();
  // allSettled (not Promise.all) so a triage rejection never leaves the filter
  // promise detached as an unhandled rejection — both can reject with
  // ClaudeNotLoggedInError. We re-throw the not-logged-in signal so syncAll can
  // drive the login flow; any other triage rejection re-throws too (the outer
  // catch marks the sync window failed, preserving prior behavior).
  const [triageSettled, filterSettled] = await Promise.allSettled([
    batchPromise,
    filterPromise,
  ]);

  if (triageSettled.status === "rejected") throw triageSettled.reason;
  if (
    filterSettled.status === "rejected" &&
    filterSettled.reason instanceof ClaudeNotLoggedInError
  ) {
    throw filterSettled.reason;
  }

  const triageResult = triageSettled.value;
  const filterResult =
    filterSettled.status === "fulfilled"
      ? filterSettled.value
      : {
          suggestedFilters: 0,
          errors: [`filterSuggest: ${(filterSettled.reason as Error).message}`],
        };

  const triagedCount = triageResult.triaged;
  const suggestedNewLabelsCount = triageResult.suggestedNewLabels;
  errors.push(...triageResult.errors);

  const suggestedFiltersCount = filterResult.suggestedFilters;
  errors.push(...filterResult.errors);
  emit({
    type: "filters.finished",
    account: account.email,
    suggestedFilters: suggestedFiltersCount,
  });

  await db
    .update(accounts)
    .set({ lastSyncedAt: new Date() })
    .where(eq(accounts.id, account.id));

  await db
    .update(syncWindows)
    .set({
      status: "completed",
      messagesFetched,
      messagesNew,
      error: errors.length > 0 ? errors.join("\n") : null,
      finishedAt: new Date(),
    })
    .where(eq(syncWindows.id, syncWindowId));

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
  } catch (err) {
    const message = (err as Error).message ?? String(err);
    debug("fetchAndTriage failed", {
      account: opts.accountEmail,
      error: message,
      ...(err instanceof ShellError
        ? {
            exitCode: err.exitCode,
            cmd: err.cmd.join(" "),
            stderr: err.stderr.trim() || "(empty)",
          }
        : {}),
    });
    await db
      .update(syncWindows)
      .set({
        status: "failed",
        messagesFetched,
        messagesNew,
        error: message,
        finishedAt: new Date(),
      })
      .where(eq(syncWindows.id, syncWindowId));
    throw err;
  }
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
  /** Forwarded to fetchAndTriage; false = fetch-only (no Claude). Default true. */
  triage?: boolean;
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

  const log = opts.log ?? (() => {});
  const emit = opts.onEvent;

  const results: SyncRunResult[] = [];
  for (const target of targets) {
    try {
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
          triage: opts.triage,
        }),
      );
    } catch (err) {
      if (err instanceof ClaudeNotLoggedInError) {
        // Claude login is global: every remaining account would fail the same
        // way, so prompt once and stop. The triage toast for this account is
        // dismissed by the web's claude-login handler.
        log(`[${target.email}] Claude CLI is not logged in`);
        if (emit) {
          // Eager spawn the login session ({} on failure → signal-only event).
          const session = await startClaudeLoginForEvent();
          emit({ type: "sync.claude_login_required", ...session });
        }
        results.push({
          account: target.email,
          fetched: 0,
          triaged: 0,
          suggestedNewLabels: 0,
          filtersSynced: 0,
          suggestedFilters: 0,
          errors: [`claude_not_logged_in: ${err.message}`],
        });
        break;
      }
      if (!(err instanceof ReauthRequiredError)) throw err;
      // One stale account shouldn't block the rest. Use error.account as the
      // source of truth (PRD decision 13) and dev-warn on mismatch.
      const account = err.account;
      if (account !== target.email) {
        debug("WARN reauth account mismatch", {
          errorAccount: account,
          target: target.email,
        });
      }
      log(`[${account}] needs re-authentication`);
      const reauthErrors = [`reauth_required: ${err.message}`];

      if (emit) {
        // Eager: spawn the manual reauth session, await its URL, ship it in the
        // event. On spawn/URL-timeout failure, emit signal-only (PRD decision 9).
        try {
          const session = await gog.startReauth({ account });
          // The proc lives until the user pastes back (or the TTL evicts it).
          session.done.catch(() => {
            /* surfaced via the paste-back result or a re-sync */
          });
          emit({
            type: "sync.reauth_required",
            account,
            sessionId: session.sessionId,
            url: session.url,
          });
        } catch (spawnErr) {
          debug("startReauth failed; signal-only", {
            account,
            error: (spawnErr as Error).message,
          });
          emit({ type: "sync.reauth_required", account });
        }
      }

      results.push({
        account,
        fetched: 0,
        triaged: 0,
        suggestedNewLabels: 0,
        filtersSynced: 0,
        suggestedFilters: 0,
        errors: reauthErrors,
      });
      continue;
    }
  }
  debug("syncAll done", { runs: results.length });
  return results;
}

export interface TriageUntriagedOptions {
  accountEmail: string;
  claude?: ClaudeAdapter;
  log?: (msg: string) => void;
  onEvent?: (event: SyncServerEventT) => void;
}

export interface TriageUntriagedResult {
  account: string;
  candidates: number;
  triaged: number;
  suggestedNewLabels: number;
  errors: string[];
}

export async function triageUntriagedForAccount(
  opts: TriageUntriagedOptions,
): Promise<TriageUntriagedResult> {
  const claude = opts.claude ?? createClaudeAdapter();
  const log = opts.log ?? (() => {});
  const emit = opts.onEvent ?? (() => {});

  const account = await getAccountByEmail(opts.accountEmail);
  if (!account) {
    throw new Error(
      `Account not synced: ${opts.accountEmail}. Run accounts sync first.`,
    );
  }

  const { db } = getDb();

  const allLabels = await getLabelsForAccount(account.id);
  const labelsByName = new Map(allLabels.map((l) => [l.name, l]));
  const existingLabelNames = allLabels
    .filter((l) => l.type === "user")
    .map((l) => l.name);

  // Untriaged = no row in `triages` for that (account, gmailMessageId).
  // We exclude archived/trashed to avoid wasting Claude calls on dead mail.
  const rows = await db
    .select({
      gmailMessageId: messages.gmailMessageId,
      gmailThreadId: messages.gmailThreadId,
      fromEmail: messages.fromEmail,
      fromName: messages.fromName,
      toEmails: messages.toEmails,
      subject: messages.subject,
      snippet: messages.snippet,
      bodyText: messages.bodyText,
      bodyHtml: messages.bodyHtml,
      internalDate: messages.internalDate,
      rawHeaders: messages.rawHeaders,
    })
    .from(messages)
    .leftJoin(
      triages,
      and(
        eq(triages.accountId, messages.accountId),
        eq(triages.gmailMessageId, messages.gmailMessageId),
      ),
    )
    .where(
      and(
        eq(messages.accountId, account.id),
        eq(messages.isArchived, false),
        eq(messages.isTrashed, false),
        isNull(triages.id),
      ),
    );

  log(`[${account.email}] ${rows.length} untriaged message(s) to triage`);
  debug("triageUntriagedForAccount candidates", {
    account: account.email,
    count: rows.length,
  });

  if (rows.length === 0) {
    emit({ type: "triage.started", account: account.email, totalBatches: 0 });
    emit({
      type: "triage.finished",
      account: account.email,
      triaged: 0,
      suggestedNewLabels: 0,
      elapsedMs: 0,
    });
    return {
      account: account.email,
      candidates: 0,
      triaged: 0,
      suggestedNewLabels: 0,
      errors: [],
    };
  }

  const gmailMessageIds = rows.map((r) => r.gmailMessageId);
  const labelLinks = await db
    .select({
      gmailMessageId: messageLabels.gmailMessageId,
      labelId: messageLabels.labelId,
    })
    .from(messageLabels)
    .where(
      and(
        eq(messageLabels.accountId, account.id),
        inArray(messageLabels.gmailMessageId, gmailMessageIds),
      ),
    );
  const labelById = new Map(allLabels.map((l) => [l.id, l]));
  const labelsByMsg = new Map<string, string[]>();
  for (const link of labelLinks) {
    const label = labelById.get(link.labelId);
    if (!label) continue;
    const list = labelsByMsg.get(link.gmailMessageId) ?? [];
    list.push(label.gmailLabelId);
    labelsByMsg.set(link.gmailMessageId, list);
  }
  const labelsByGmailId = new Map(allLabels.map((l) => [l.gmailLabelId, l]));

  const normalized: NormalizedMessage[] = rows.map((r) => ({
    accountId: account.id,
    gmailMessageId: r.gmailMessageId,
    gmailThreadId: r.gmailThreadId,
    fromEmail: r.fromEmail,
    fromName: r.fromName,
    toEmails: r.toEmails,
    subject: r.subject,
    snippet: r.snippet,
    bodyText: r.bodyText ?? "",
    bodyHtml: r.bodyHtml ?? "",
    internalDate: r.internalDate,
    rawHeaders: r.rawHeaders ?? {},
    labelIds: labelsByMsg.get(r.gmailMessageId) ?? [],
  }));

  const batches = chunk(normalized, TRIAGE_BATCH_SIZE);
  const result = await runTriageBatches({
    accountId: account.id,
    accountEmail: account.email,
    batches,
    labelsByGmailId,
    labelsByName,
    existingLabelNames,
    claude,
    log,
    emit,
  });

  return {
    account: account.email,
    candidates: normalized.length,
    triaged: result.triaged,
    suggestedNewLabels: result.suggestedNewLabels,
    errors: result.errors,
  };
}
