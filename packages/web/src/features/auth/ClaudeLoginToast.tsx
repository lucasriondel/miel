import { useState } from "react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "../../api/client";
import { Button } from "../../components/Button";
import { Spinner } from "../../components/Spinner";

interface Props {
  toastId: string | number;
  sessionId: string;
  url: string;
  onSuccess?: () => void;
}

function describeError(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Login failed";
}

/**
 * Rendered inside a persistent sonner toast (via toast.custom). Holds the code
 * input locally and submits it to the waiting `claude auth login` process.
 */
export const ClaudeLoginToast = ({ toastId, sessionId, url, onSuccess }: Props) => {
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const trimmed = code.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiFetch<{ ok: true }>({
        path: "/auth/claude/login/code",
        method: "POST",
        body: { sessionId, code: trimmed },
      });
      toast.dismiss(toastId);
      toast.success("Claude CLI is now logged in.");
      onSuccess?.();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-[340px] flex-col gap-2 rounded-md border border-miel-line bg-miel-panel p-3 text-sm">
      <span className="font-semibold text-miel-ink">Connect Claude CLI</span>
      <p className="text-xs text-miel-muted">
        Open the sign-in page, complete it, then paste the code shown back here.
      </p>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-miel-ink underline"
      >
        Open sign-in page
      </a>
      <div className="flex items-center gap-2">
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Paste code"
          autoFocus
          className="flex-1 rounded border border-miel-line bg-miel-bg px-2 py-1 text-sm text-miel-ink placeholder:text-miel-muted"
        />
        <Button variant="primary" disabled={submitting} onClick={submit}>
          {submitting ? <Spinner size={12} /> : null}
          {submitting ? "Verifying…" : "Submit"}
        </Button>
      </div>
      {error ? <span className="text-xs text-miel-high">{error}</span> : null}
    </div>
  );
};
