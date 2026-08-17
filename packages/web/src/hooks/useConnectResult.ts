import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { readConnectResult, stripConnectResult } from "../api/connectResult";
import { useAccounts, queryKeys } from "../api/queries";
import {
  connectFailureChannel,
  describeConnectFailure,
} from "../features/onboarding/connectFailure";

export interface ConnectResultState {
  /** Failure to show inside the onboarding gate, already in plain English. */
  gateError: string | null;
  /** Drops it — the gate calls this when the user retries the connect. */
  clearGateError: () => void;
}

/**
 * Confirms the outcome of an in-app Google OAuth round-trip, wherever it lands.
 *
 * The callback returns the browser to the page the connect started from —
 * settings, or the new account's inbox when it came from the onboarding gate —
 * so this lives on the app layout rather than on any one page. It reports the
 * outcome once and strips the param, so a refresh can't resurface it.
 *
 * A *failure* is reported wherever the user can actually see it (see
 * {@link connectFailureChannel}): a toast normally, but inline in the
 * onboarding gate when the failure left them with zero accounts and the gate
 * therefore reopens over the toast. That decision needs a settled account list,
 * so the reason is held in state until one arrives rather than being reported
 * from the URL-reading effect directly.
 */
export function useConnectResult(): ConnectResultState {
  const [params, setParams] = useSearchParams();
  const qc = useQueryClient();
  const accounts = useAccounts();
  const [reason, setReason] = useState<string | null>(null);
  // Once the gate has shown a failure, it has been reported; if the gate later
  // closes (an account appearing from elsewhere) we drop it rather than toast
  // a message the user has already read.
  const shownInGate = useRef(false);

  useEffect(() => {
    const result = readConnectResult(params);
    if (!result) return;
    if (result.kind === "connected") {
      toast.success(`Connected ${result.email}`);
      qc.invalidateQueries({ queryKey: queryKeys.accounts });
    } else {
      shownInGate.current = false;
      setReason(result.reason);
    }
    setParams(stripConnectResult(params), { replace: true });
  }, [params, qc, setParams]);

  const channel = connectFailureChannel(accounts);

  useEffect(() => {
    if (!reason || channel === "hold") return;
    if (channel === "gate") {
      shownInGate.current = true;
      return;
    }
    if (!shownInGate.current) toast.error(describeConnectFailure(reason));
    setReason(null);
  }, [reason, channel]);

  const clearGateError = useCallback(() => setReason(null), []);

  return {
    gateError: reason && channel === "gate" ? describeConnectFailure(reason) : null,
    clearGateError,
  };
}
