import { useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";
import { queryKeys, useClaudeAuthStatus } from "../../api/queries";
import { ApiError } from "../../api/client";
import { startClaudeLoginFlow } from "../auth/startClaudeLoginFlow";

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const ClaudeAuthManager = () => {
  const status = useClaudeAuthStatus();
  const qc = useQueryClient();
  const loggedIn = status.data?.loggedIn === true;

  const connect = () =>
    startClaudeLoginFlow(() =>
      qc.invalidateQueries({ queryKey: queryKeys.claudeAuth }),
    );

  return (
    <div className="rounded border border-miel-line bg-miel-panel p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-miel-ink">Claude CLI</h3>
          <p className="text-xs text-miel-muted">
            {status.isLoading ? (
              "Checking sign-in status…"
            ) : status.error ? (
              <>Could not check status: {describeError(status.error)}</>
            ) : loggedIn ? (
              <>
                Logged in
                {status.data?.email ? ` as ${status.data.email}` : ""}. Triage and
                replies use this login.
              </>
            ) : (
              "Not logged in. Triage and replies require a Claude login."
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {status.isLoading ? (
            <Spinner size={14} />
          ) : (
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                loggedIn
                  ? "bg-miel-line text-miel-ink"
                  : "bg-miel-high text-white"
              }`}
            >
              {loggedIn ? "Connected" : "Disconnected"}
            </span>
          )}
          <Button
            variant={loggedIn ? "secondary" : "primary"}
            onClick={connect}
          >
            {loggedIn ? "Reconnect" : "Connect Claude"}
          </Button>
        </div>
      </div>
    </div>
  );
};
