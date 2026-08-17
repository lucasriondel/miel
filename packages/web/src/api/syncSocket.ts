import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, type NavigateFunction } from "react-router-dom";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as syncEventSchemas from "@miel/core/schemas/syncEvents";
import { apiBase, apiSecret } from "../config";
import { queryKeys } from "./queries";
import { startGoogleOAuth } from "./googleOAuth";

// What the client parses, which is what the server emits plus the deprecated
// `sync.claude_unavailable` spelling of the provider-unavailable event (#127) —
// a page loaded from this release can be talking to the previous release's API
// until it reloads.
type ReceivedSyncServerEventT = ReturnType<typeof syncEventSchemas.ReceivedSyncServerEvent.parse>;

export interface SyncStreamInput {
  account?: string;
  since?: string;
  range?: { from: string; to: string };
  max?: number;
}

function buildSyncWsUrl(): string {
  const httpBase = new URL(
    apiBase.startsWith("http") ? apiBase : `${window.location.origin}${apiBase}`,
  );
  const wsProtocol = httpBase.protocol === "https:" ? "wss:" : "ws:";
  const pathname = `${httpBase.pathname.replace(/\/$/, "")}/sync/ws`;
  const search = `?token=${encodeURIComponent(apiSecret)}`;
  return `${wsProtocol}//${httpBase.host}${pathname}${search}`;
}

interface BatchCounters {
  done: number;
  failed: number;
}

function triageToastId(account: string): string {
  return `sync:triage:${account}`;
}

// Human-friendly elapsed time for the triage-finished toast.
// <1s → "0.4s", <60s → "12s", else "1m 05s".
function formatElapsed(ms: number): string {
  if (ms < 1000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

function filtersToastId(account: string): string {
  return `sync:filters:${account}`;
}

function dispatchEvent(
  event: ReceivedSyncServerEventT,
  qc: QueryClient,
  batchCounts: Map<string, BatchCounters>,
  retriage: (accounts: string[]) => void,
  navigate: NavigateFunction,
) {
  switch (event.type) {
    case "sync.started":
      return;
    case "search.dedupe.finished": {
      // Dedup complete, fetch will start next
      return;
    }
    case "fetch.batch.progress": {
      if (event.status === "done" && event.messages && event.messages.length > 0) {
        // Invalidate to refetch and show fetched messages in untriaged
        qc.invalidateQueries({ queryKey: ["messages"] });
      }
      return;
    }
    case "mails.fetched": {
      if (event.count > 0) {
        toast.info(
          `Found ${event.count} new mail${event.count === 1 ? "" : "s"} for ${event.account}`,
        );
      } else {
        toast.info(`No new mails for ${event.account}`);
      }
      qc.invalidateQueries({ queryKey: ["messages"] });
      return;
    }
    case "triage.started": {
      batchCounts.set(event.account, { done: 0, failed: 0 });
      if (event.totalBatches > 0) {
        toast.loading("AI is triaging your mails…", {
          id: triageToastId(event.account),
          description: `0/${event.totalBatches} batches`,
        });
      }
      return;
    }
    case "triage.batch.progress": {
      const counters = batchCounts.get(event.account) ?? { done: 0, failed: 0 };
      if (event.status === "done") {
        counters.done += 1;
        if (event.results) {
          qc.invalidateQueries({ queryKey: ["messages"] });
        }
      }
      if (event.status === "failed") counters.failed += 1;
      batchCounts.set(event.account, counters);
      const completed = counters.done + counters.failed;
      const description =
        counters.failed > 0
          ? `${completed}/${event.totalBatches} batches (${counters.failed} failed)`
          : `${completed}/${event.totalBatches} batches`;
      toast.loading("AI is triaging your mails…", {
        id: triageToastId(event.account),
        description,
      });
      return;
    }
    case "filters.started":
      toast.loading("AI is finding potential new filters…", {
        id: filtersToastId(event.account),
      });
      return;
    case "triage.finished": {
      toast.dismiss(triageToastId(event.account));
      const elapsed = formatElapsed(event.elapsedMs);

      if (event.failedBatches > 0) {
        toast.error(`Triage failed for ${event.account}`, {
          description: "Some messages remain untriaged. Check logs and try again.",
        });
      } else {
        toast.success(`AI finished triaging ${event.account}`, {
          description:
            event.suggestedNewLabels > 0
              ? `${event.triaged} triaged in ${elapsed}, ${event.suggestedNewLabels} new label suggestion${event.suggestedNewLabels === 1 ? "" : "s"}`
              : `${event.triaged} triaged in ${elapsed}`,
        });
      }
      qc.invalidateQueries({ queryKey: ["messages"] });
      qc.invalidateQueries({ queryKey: queryKeys.accounts });
      return;
    }
    case "filters.finished": {
      toast.dismiss(filtersToastId(event.account));
      if (event.suggestedFilters > 0) {
        toast.success(
          `Filters: ${event.suggestedFilters} suggestion${event.suggestedFilters === 1 ? "" : "s"}`,
        );
      }
      qc.invalidateQueries({ queryKey: ["filters"] });
      return;
    }
    case "sync.finished": {
      qc.invalidateQueries({ queryKey: queryKeys.accounts });
      return;
    }
    case "sync.error":
      if (event.message.includes("OAuth client credentials missing")) {
        toast.error("Google OAuth credentials not configured", {
          description: "Add your client_secret JSON in Settings → Google OAuth.",
          action: {
            label: "Go to Settings",
            onClick: () => navigate("/settings"),
          },
          duration: 10000,
        });
      } else {
        toast.error(`Sync failed: ${event.message}`);
      }
      return;
    case "sync.reconnect_required":
      // The account's Google grant is missing or revoked. Start the OAuth
      // consent flow straight from the toast — same call the Settings
      // "Connect with Google" button makes — instead of dropping the user on
      // /settings to find that button themselves.
      toast.error(`Reconnect ${event.account} with Google`, {
        description: "Its access was revoked or expired.",
        action: {
          label: "Reconnect",
          onClick: () => {
            void startGoogleOAuth();
          },
        },
        duration: 10000,
      });
      return;
    // `sync.claude_unavailable` is what a server older than #127 calls the same
    // event. Accepted for one release, then removable together with the alias in
    // the event schema.
    case "sync.claude_unavailable":
    case "sync.provider_unavailable": {
      // The chosen provider cannot run — no credential, or one it rejected — and
      // the credential and the provider pick are global, so every account would
      // fail the same way. Dismiss any hung triage/filter loaders and point at
      // Settings.
      const accounts = Array.from(batchCounts.keys());
      for (const a of accounts) {
        toast.dismiss(triageToastId(a));
        toast.dismiss(filtersToastId(a));
      }
      toast.error("AI is not configured", {
        description: "Add the provider's credential in Settings to enable triage.",
        action: {
          label: "Settings",
          onClick: () => navigate("/settings"),
        },
        duration: 10000,
      });
      return;
    }
  }
}

export interface UseSyncStream {
  start: (input: SyncStreamInput) => void;
  startTriage: (input: { account: string }) => void;
  isRunning: boolean;
}

export function useSyncStream(): UseSyncStream {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [isRunning, setIsRunning] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const batchCountsRef = useRef<Map<string, BatchCounters>>(new Map());
  // Triage runs queued after a Claude login: each opens once the previous closes,
  // since the transport is one account per socket.
  const triageQueueRef = useRef<string[]>([]);

  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []);

  const openSocketRef = useRef<(startPayload: object) => void>(() => {});

  const drainTriageQueue = useCallback(() => {
    const next = triageQueueRef.current.shift();
    if (next) openSocketRef.current({ type: "triage.start", account: next });
  }, []);

  // Queue triage runs for the given accounts and start the first (used to
  // auto-retriage after a Claude login interrupted a sync).
  const retriage = useCallback(
    (accounts: string[]) => {
      if (accounts.length === 0) return;
      triageQueueRef.current.push(...accounts);
      if (!wsRef.current) drainTriageQueue();
    },
    [drainTriageQueue],
  );

  const openSocket = useCallback(
    (startPayload: object) => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      batchCountsRef.current = new Map();
      setIsRunning(true);

      const ws = new WebSocket(buildSyncWsUrl());
      wsRef.current = ws;

      ws.addEventListener("open", () => {
        ws.send(JSON.stringify(startPayload));
      });
      ws.addEventListener("message", (ev) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          return;
        }
        const result = syncEventSchemas.ReceivedSyncServerEvent.safeParse(parsed);
        if (!result.success) {
          // A malformed/unrecognized event is dropped; warn so an unparseable
          // login/reauth prompt doesn't fail completely silently.
          console.warn("[sync] dropping unparseable event", result.error.issues);
          return;
        }
        dispatchEvent(result.data, qc, batchCountsRef.current, retriage, navigate);
      });
      ws.addEventListener("error", () => {
        toast.error("Sync connection error");
      });
      ws.addEventListener("close", () => {
        setIsRunning(false);
        if (wsRef.current === ws) wsRef.current = null;
        // Start the next queued retriage, if any.
        drainTriageQueue();
      });
    },
    [qc, retriage, drainTriageQueue, navigate],
  );

  // Keep the ref pointed at the latest openSocket so drainTriageQueue (declared
  // earlier, for the onclose handler) can call it without a circular dep.
  openSocketRef.current = openSocket;

  const start = useCallback(
    (input: SyncStreamInput) => {
      openSocket({ type: "sync.start", ...input });
    },
    [openSocket],
  );

  const startTriage = useCallback(
    (input: { account: string }) => {
      openSocket({ type: "triage.start", account: input.account });
    },
    [openSocket],
  );

  return { start, startTriage, isRunning };
}
