import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import * as syncEventSchemas from "@miel/core/schemas/syncEvents";
import { apiBase, apiSecret } from "../config";
import { queryKeys } from "./queries";
import { handleSyncReauth } from "../features/auth/handleSyncReauth";
import { handleClaudeLoginRequired } from "../features/auth/handleClaudeLoginRequired";

type SyncServerEventT = ReturnType<
  typeof syncEventSchemas.SyncServerEvent.parse
>;

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

function filtersToastId(account: string): string {
  return `sync:filters:${account}`;
}

function dispatchEvent(
  event: SyncServerEventT,
  qc: QueryClient,
  batchCounts: Map<string, BatchCounters>,
  retriage: (accounts: string[]) => void,
) {
  switch (event.type) {
    case "sync.started":
      return;
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
        toast.loading("Claude is triaging your mails…", {
          id: triageToastId(event.account),
          description: `0/${event.totalBatches} batches`,
        });
      }
      return;
    }
    case "triage.batch.progress": {
      const counters =
        batchCounts.get(event.account) ?? { done: 0, failed: 0 };
      if (event.status === "done") counters.done += 1;
      if (event.status === "failed") counters.failed += 1;
      batchCounts.set(event.account, counters);
      const completed = counters.done + counters.failed;
      const description =
        counters.failed > 0
          ? `${completed}/${event.totalBatches} batches (${counters.failed} failed)`
          : `${completed}/${event.totalBatches} batches`;
      toast.loading("Claude is triaging your mails…", {
        id: triageToastId(event.account),
        description,
      });
      return;
    }
    case "filters.started":
      toast.loading("Claude is finding potential new filters…", {
        id: filtersToastId(event.account),
      });
      return;
    case "triage.finished": {
      toast.dismiss(triageToastId(event.account));
      toast.success(`Claude finished triaging ${event.account}`, {
        description:
          event.suggestedNewLabels > 0
            ? `${event.triaged} triaged, ${event.suggestedNewLabels} new label suggestion${event.suggestedNewLabels === 1 ? "" : "s"}`
            : `${event.triaged} triaged`,
      });
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
            onClick: () => window.location.assign("/settings"),
          },
          duration: 10000,
        });
      } else {
        toast.error(`Sync failed: ${event.message}`);
      }
      return;
    case "sync.reauth_required":
      handleSyncReauth(event, qc);
      return;
    case "sync.claude_login_required": {
      // Accounts that began triaging this run are the ones whose work was cut
      // short; dismiss their hung loading toasts (triage + filters, since
      // filters.finished never fires when sync bails for login) and retriage
      // them after login. Dismissing a never-shown toast id is a no-op.
      const accounts = Array.from(batchCounts.keys());
      handleClaudeLoginRequired(event, qc, {
        dismissToastIds: [
          ...accounts.map(triageToastId),
          ...accounts.map(filtersToastId),
        ],
        onLoggedIn: () => retriage(accounts),
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

      ws.onopen = () => {
        ws.send(JSON.stringify(startPayload));
      };
      ws.onmessage = (ev) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(ev.data);
        } catch {
          return;
        }
        const result = syncEventSchemas.SyncServerEvent.safeParse(parsed);
        if (!result.success) {
          // A malformed/unrecognized event is dropped; warn so an unparseable
          // login/reauth prompt doesn't fail completely silently.
          console.warn("[sync] dropping unparseable event", result.error.issues);
          return;
        }
        dispatchEvent(result.data, qc, batchCountsRef.current, retriage);
      };
      ws.onerror = () => {
        toast.error("Sync connection error");
      };
      ws.onclose = () => {
        setIsRunning(false);
        if (wsRef.current === ws) wsRef.current = null;
        // Start the next queued retriage, if any.
        drainTriageQueue();
      };
    },
    [qc, retriage, drainTriageQueue],
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
