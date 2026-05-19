import { useSync } from "../../api/mutations";
import { ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";

interface Props {
  accountEmail?: string;
  onResult?: (info: { fetched: number; triaged: number; errors: string[] }) => void;
  onError?: (message: string) => void;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Unknown error";
}

export const SyncButton = ({ accountEmail, onResult, onError }: Props) => {
  const sync = useSync();
  return (
    <Button
      variant="primary"
      disabled={sync.isPending}
      onClick={() => {
        sync.mutate(
          { account: accountEmail, since: "7d" },
          {
            onSuccess: (data) => {
              const totals = data.runs.reduce(
                (acc, r) => {
                  acc.fetched += r.fetched;
                  acc.triaged += r.triaged;
                  acc.errors.push(...r.errors);
                  return acc;
                },
                { fetched: 0, triaged: 0, errors: [] as string[] },
              );
              onResult?.(totals);
            },
            onError: (err) => {
              onError?.(describeError(err));
            },
          },
        );
      }}
    >
      {sync.isPending ? <Spinner size={12} /> : null}
      {sync.isPending ? "Syncing…" : "Sync"}
    </Button>
  );
};
