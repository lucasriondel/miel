import { CF_ACCESS_HEADERS, isReservedHeaderName, isValidHeaderName } from "@miel/core/worpConfig";
import type { MaskedHeader } from "../../api/types";

/**
 * The worp header editor's rules, as plain functions (#119).
 *
 * They are here rather than in the component because each of them was got
 * wrong once while it was inlined: which rows can be saved, what a removal
 * means when the values are invisible, and which names are legal. This package
 * has no DOM harness, so a rule that lives in a component is a rule no test
 * reaches.
 *
 * Two facts shape all of it. The server sends header *names* with masked
 * values and never the values themselves, so the editor can add, rename and
 * remove but can only send a value the user just typed. And the PUT is a patch,
 * not a replacement: an unnamed header is left alone, which is what lets a
 * removal go out without the other headers' secrets and stops a save from
 * deleting what someone added while the page was open.
 */

/** One row of the editor. */
export interface HeaderDraftRow {
  id: number;
  name: string;
  /** What the user typed. Empty means "whatever is stored", if anything is. */
  value: string;
  /**
   * The name this row arrived from the server under, or null when the row is
   * new here. Renaming a stored row therefore reads as a removal plus an
   * addition, which is what it is — the old name has to go.
   */
  storedName: string | null;
  valueHint: string | null;
}

let nextId = 0;
const rowId = () => (nextId += 1);

export const emptyRow = (name = ""): HeaderDraftRow => ({
  id: rowId(),
  name,
  value: "",
  storedName: null,
  valueHint: null,
});

export const rowsFromStored = (stored: MaskedHeader[]): HeaderDraftRow[] =>
  stored.map((h) => ({
    id: rowId(),
    name: h.name,
    value: "",
    storedName: h.name,
    valueHint: h.valueHint,
  }));

/**
 * True when the row still stands for the stored header it came from, with the
 * value left as it is. Those are the rows the patch stays silent about.
 */
export const keepsStoredValue = (row: HeaderDraftRow): boolean =>
  row.storedName !== null && row.name.trim() === row.storedName && row.value.trim().length === 0;

/**
 * Add the Cloudflare Access pair, ready for two pastes. A convenience only:
 * these are stored and sent exactly like any other header, because CF Access is
 * one proxy among several rather than a special case (#107).
 */
export function withCloudflareAccess(rows: HeaderDraftRow[]): HeaderDraftRow[] {
  const present = new Set(rows.map((r) => r.name.trim().toLowerCase()));
  const missing = CF_ACCESS_HEADERS.filter((h) => !present.has(h.toLowerCase()));
  return [...rows, ...missing.map((h) => emptyRow(h))];
}

/**
 * The editor's state: the rows, plus a fingerprint of the server list they
 * were seeded from. The fingerprint is what makes "has the server changed
 * underneath us" answerable without comparing objects the query client
 * replaces on every refetch.
 */
export interface DraftState {
  signature: string;
  rows: HeaderDraftRow[];
}

const signatureOf = (stored: MaskedHeader[]): string =>
  JSON.stringify(stored.map((h) => [h.name, h.valueHint]));

export const seedDraft = (stored: MaskedHeader[]): DraftState => ({
  signature: signatureOf(stored),
  rows: rowsFromStored(stored),
});

/**
 * The state to render, given what the server now reports.
 *
 * Returns the state unchanged — by identity, so a caller can use it as the
 * "nothing to do" signal — while the stored set is the one it was seeded from.
 * A poll must not swallow what is being typed; a set that actually changed
 * must not be left on screen describing a map that is gone.
 */
export function syncedDraft(state: DraftState, stored: MaskedHeader[]): DraftState {
  return signatureOf(stored) === state.signature ? state : seedDraft(stored);
}

/** A header patch: a string sets that header, null removes it. */
export type HeaderPatch = Record<string, string | null>;

/**
 * Why Save is off. `problem` is something to fix, `note` is simply that there
 * is nothing to send yet — different words, and different colours.
 */
export interface DraftHint {
  text: string;
  tone: "problem" | "note";
}

export interface DraftReview {
  /** In-field messages by row id: an unusable name, or one listed twice. */
  rowProblems: Record<number, string>;
  /** Non-null exactly when {@link DraftReview.patch} is null. */
  hint: DraftHint | null;
  /** The patch to PUT, or null when the draft cannot be sent as it stands. */
  patch: HeaderPatch | null;
}

const problem = (text: string): DraftHint => ({ text, tone: "problem" });
const note = (text: string): DraftHint => ({ text, tone: "note" });

/**
 * Judge the draft against the headers the server currently reports: what to
 * say in each field, whether Save can be on, and what it would send.
 *
 * The patch and the hint are computed together and returned together so they
 * cannot contradict each other — the shipped bug was a dead Save button whose
 * only explanation advised doing what the user had just done.
 */
export function reviewDraft(rows: HeaderDraftRow[], stored: MaskedHeader[]): DraftReview {
  const rowProblems: Record<number, string> = {};
  // A row with neither a name nor a value is an "Add header" not filled in yet.
  const filled = rows.filter((r) => r.name.trim().length > 0 || r.value.trim().length > 0);
  const named = filled.filter((r) => r.name.trim().length > 0);

  const seen = new Set<string>();
  for (const row of named) {
    const name = row.name.trim();
    if (!isValidHeaderName(name)) {
      rowProblems[row.id] = "Not a valid header name";
    } else if (isReservedHeaderName(name)) {
      rowProblems[row.id] = "miel sets this header itself";
    } else if (seen.has(name.toLowerCase())) {
      // Field names are case-insensitive, so these two rows are one header:
      // building the map would keep one value and drop the other in silence.
      rowProblems[row.id] = "Already listed above";
    } else {
      seen.add(name.toLowerCase());
    }
  }

  if (Object.keys(rowProblems).length > 0) {
    return {
      rowProblems,
      hint: problem("Fix the flagged header names before saving."),
      patch: null,
    };
  }
  if (filled.length > named.length) {
    return { rowProblems, hint: problem("Every header needs a name."), patch: null };
  }
  if (named.some((r) => r.value.trim().length === 0 && !keepsStoredValue(r))) {
    return {
      rowProblems,
      hint: problem("Every header added or renamed here needs a value."),
      patch: null,
    };
  }

  const patch: HeaderPatch = {};
  // A stored name no longer on screen — removed, or renamed into another row.
  for (const header of stored) {
    if (!seen.has(header.name.toLowerCase())) patch[header.name] = null;
  }
  for (const row of named) {
    if (keepsStoredValue(row)) continue;
    patch[row.name.trim()] = row.value.trim();
  }

  if (Object.keys(patch).length === 0) {
    return { rowProblems, hint: note("No changes to save yet."), patch: null };
  }
  return { rowProblems, hint: null, patch };
}
