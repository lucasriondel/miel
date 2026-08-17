/**
 * Server-side state for an in-flight "Connect with Google" flow.
 *
 * The random `state` handed to Google is already the CSRF token; this store is
 * what it points at. Everything the callback needs to decide *where to send the
 * browser back to* lives here rather than in the callback URL, so a crafted
 * callback can't steer the redirect (see `@miel/core/connectReturn`).
 *
 * Single-instance app, so an in-memory map is sufficient — a restart mid-consent
 * just costs the user a retry. Entries are single-use and expire; `now` is a
 * parameter so the expiry rule is testable without waiting.
 */
import { randomBytes } from "node:crypto";
import type { ConnectReturnTarget } from "@miel/core";

export const CONNECT_STATE_TTL_MS = 10 * 60_000;

export interface ConnectFlow {
  /** Where to return the browser once Google is done. */
  target: ConnectReturnTarget;
}

export interface ConnectStateStore {
  /** Mint a state for a flow started at `now`. */
  issue(target: ConnectReturnTarget, now?: number): string;
  /** Resolve and burn a state; null when unknown, replayed or expired. */
  consume(state: string | undefined, now?: number): ConnectFlow | null;
}

export function createConnectStateStore(opts: { ttlMs?: number } = {}): ConnectStateStore {
  const ttlMs = opts.ttlMs ?? CONNECT_STATE_TTL_MS;
  const pending = new Map<string, { flow: ConnectFlow; expiresAt: number }>();

  return {
    issue(target, now = Date.now()) {
      const state = randomBytes(16).toString("hex");
      pending.set(state, { flow: { target }, expiresAt: now + ttlMs });
      return state;
    },
    consume(state, now = Date.now()) {
      if (!state) return null;
      const entry = pending.get(state);
      if (!entry) return null;
      // Burn it either way: an expired entry is dead, not retryable.
      pending.delete(state);
      return entry.expiresAt > now ? entry.flow : null;
    },
  };
}
