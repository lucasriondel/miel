import { useState } from "react";
import {
  emptyRow,
  reviewDraft,
  seedDraft,
  syncedDraft,
  withCloudflareAccess,
} from "./worpHeaderDraft";
import type { DraftState, HeaderDraftRow } from "./worpHeaderDraft";
import type { MaskedHeader } from "../../api/types";

/**
 * The header editor's state. The rules are in `worpHeaderDraft.ts`; what is
 * left here is holding the rows and keeping them honest about the server.
 *
 * `stored` is re-read on every render rather than only at mount (#119). The
 * server owns which headers exist — a refetch, or someone else's save, can
 * change the set — and a draft that kept describing the set it was born with
 * used to send it back as gospel. Reseeding only when the set actually changes
 * is what keeps that from eating what the user is typing.
 */
export function useWorpHeaderDraft(stored: MaskedHeader[]) {
  const [state, setState] = useState<DraftState>(() => seedDraft(stored));

  // React's "adjust state when a prop changes": render with the synced value
  // now, and store it for the next render. `syncedDraft` returns the same
  // object when nothing moved, so this settles immediately.
  const synced = syncedDraft(state, stored);
  if (synced !== state) setState(synced);
  const rows = synced.rows;

  const setRows = (next: (rows: HeaderDraftRow[]) => HeaderDraftRow[]) =>
    setState((s) => ({ ...s, rows: next(s.rows) }));

  const update = (id: number, patch: Partial<HeaderDraftRow>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const add = (name = "") => setRows((rs) => [...rs, emptyRow(name)]);

  const remove = (id: number) => setRows((rs) => rs.filter((r) => r.id !== id));

  const addCloudflareAccess = () => setRows(withCloudflareAccess);

  /**
   * Re-seed from what a save just returned. Not the same as the sync above: a
   * value replaced by one that masks identically leaves the set unchanged, and
   * the typed secret should still leave the field once the server has it.
   */
  const reset = (next: MaskedHeader[]) => setState(seedDraft(next));

  return { rows, update, add, remove, reset, addCloudflareAccess, ...reviewDraft(rows, stored) };
}
