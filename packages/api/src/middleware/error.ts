import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { ShellError, createDebug, isProviderUnavailable } from "@miel/core";

const debug = createDebug("api:error");

// Tagged-error _tag → HTTP response. Grant errors map to a reconnect prompt;
// a provider that cannot run to "unavailable" (the taxonomy's classification,
// #126 — this file used to keep its own two-tag copy of it); other Gmail errors
// to a bad-gateway.
const RECONNECT_TAGS = new Set(["TokenRefreshError", "GmailAuthError", "AccountNotConnectedError"]);
const GMAIL_TAGS = new Set([
  "GmailApiError",
  "GmailParseError",
  "GmailSendError",
  "GmailLabelError",
  "GmailFilterError",
]);

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  if (err instanceof ZodError) {
    return c.json({ error: "validation_failed", issues: err.issues }, 400);
  }

  const tag = (err as { _tag?: string })?._tag;
  const message = err instanceof Error ? err.message : "internal_error";

  if (tag && RECONNECT_TAGS.has(tag)) {
    return c.json({ error: "reconnect_required", message }, 401);
  }
  // The AI provider cannot run: no Claude Code token, a token the CLI rejected,
  // or a task pointed at a vendor with no stored key. One classification for all
  // three (#126), with one exception inside it — a refusal raised while the user
  // was editing the picker, which is their input being wrong rather than the
  // install being unable to work.
  if (isProviderUnavailable(err)) {
    const refusal = err as {
      task?: string;
      provider?: string;
      reason?: string;
      model?: string;
      phase?: string;
    };
    // A refused save. The reason code *is* the error field, which is what the
    // settings route's two inline guards answered before the rule moved into
    // core (#124), so the body is unchanged: the reason, the task, the vendor
    // and (for a model problem) the model. `model` is undefined on the
    // credential reason and JSON drops it, exactly as it did there.
    if (refusal.phase === "save") {
      return c.json(
        {
          error: refusal.reason,
          task: refusal.task,
          provider: refusal.provider,
          model: refusal.model,
        },
        400,
      );
    }
    // Everything else is an install discovering, as it tries to work, that it
    // cannot. Nothing about *this* request is wrong, so it is a 503 — and the
    // specifics travel where a run refusal has them (#125), so a UI can say what
    // to fix without the API inventing a sentence for it.
    if (refusal.phase === "run") {
      return c.json(
        {
          error: "claude_unavailable",
          reason: refusal.reason,
          task: refusal.task,
          provider: refusal.provider,
          model: refusal.model,
        },
        503,
      );
    }
    return c.json({ error: "claude_unavailable", message }, 503);
  }
  if (tag && GMAIL_TAGS.has(tag)) {
    return c.json({ error: "gmail_error", message }, 502);
  }
  // A merge is rejected before anything is mutated, so this is always "your
  // request can't be built", never a half-applied change. Ids that aren't this
  // account's read as a 404 like the single-filter routes; the rest are 400s.
  if (tag === "FilterMergeError") {
    const merge = err as {
      reason?: string;
      gmailFilterIds?: readonly string[];
    };
    return c.json(
      {
        error: "filter_merge_failed",
        message,
        reason: merge.reason,
        gmailFilterIds: merge.gmailFilterIds,
      },
      merge.reason === "unknown_filters" ? 404 : 400,
    );
  }
  // A rejected credential is the client's input being wrong, so 400 — and the
  // reason code travels instead of a message quoting the key (#104).
  if (tag === "InvalidProviderCredentialError") {
    const cred = err as { provider?: string; reason?: string };
    return c.json(
      { error: "invalid_provider_credential", provider: cred.provider, reason: cred.reason },
      400,
    );
  }
  // Same shape and same reason as the credential rejection above, for the
  // name-keyed secrets (#109): the reason code travels, the value never does.
  if (tag === "InvalidSecretError") {
    const secret = err as { name?: string; reason?: string };
    return c.json({ error: "invalid_secret", name: secret.name, reason: secret.reason }, 400);
  }
  // The chosen AI vendor failed the run (#116). A gateway status rather than a
  // 500, for the reason the Gmail tags get one: what broke is an external API we
  // called, not this server. The reason lives in `detail` — the fallthrough's
  // `err.message` is empty on this tag — and is already scrubbed of the key at
  // construction, which is what makes it safe to send on.
  if (tag === "HostedApiError") {
    const hosted = err as { detail?: string };
    return c.json({ error: "hosted_api_error", message: hosted.detail ?? message }, 502);
  }
  if (tag === "WorpNotConfiguredError") {
    return c.json({ error: "worp_not_configured", message }, 503);
  }
  // A refused worp settings patch is the client's input being wrong, so 400.
  // The reason code and the offending header's *name* travel; a header value is
  // a secret and never does, which is the same rule as the credential above.
  if (tag === "InvalidWorpSettingsError") {
    const worp = err as { field?: string; reason?: string; header?: string };
    return c.json(
      {
        error: "invalid_worp_settings",
        field: worp.field,
        reason: worp.reason,
        header: worp.header,
      },
      400,
    );
  }
  if (tag === "WorpIngestError") {
    const wErr = err as {
      status?: number;
      body?: unknown;
    };
    return c.json(
      {
        error: "worp_error",
        message,
        status: wErr.status,
        body: wErr.body,
      },
      502,
    );
  }
  if (err instanceof ShellError) {
    return c.json(
      {
        error: "shell_error",
        message: err.message,
        stderr: err.stderr,
        exitCode: err.exitCode,
      },
      502,
    );
  }

  debug.error("unhandled", { message, error: err });
  return c.json({ error: "internal_error", message }, 500);
};
