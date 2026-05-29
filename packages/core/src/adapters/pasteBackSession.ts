import type { Subprocess } from "bun";
import { createDebug } from "../util/debug";

const debug = createDebug("adapter:pasteBackSession");

export type PasteBackResult = { ok: true } | { ok: false; error: string };

export interface PasteBackSession {
  sessionId: string;
  url: string;
  done: Promise<PasteBackResult>;
}

type PasteBackProc = Subprocess<"pipe", "pipe", "pipe">;

interface RegistryEntry {
  sessionId: string;
  key: string;
  proc: PasteBackProc;
  url: string;
  /**
   * OAuth `state` from the URL this process printed, when the flow carries one
   * (gog reauth). The pasted redirect must echo the same `state`, otherwise the
   * code belongs to a different login attempt and the CLI would exit non-zero.
   * Undefined for flows without a verifiable state (Claude login).
   */
  expectedState?: string;
  done: Promise<PasteBackResult>;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
}

/** Pull the `state` query param out of an OAuth URL or pasted redirect. */
export function extractState(s: string): string | undefined {
  const m = /[?&]state=([^&\s]+)/.exec(s);
  return m ? decodeURIComponent(m[1]) : undefined;
}

/**
 * Validate a pasted redirect URL against the `state` the CLI printed, before
 * feeding it to the process. Returns an error reason, or null if it's good to
 * submit. Pure — exported for unit testing.
 */
export function validatePastedRedirect(
  pasted: string,
  expectedState: string,
): string | null {
  const trimmed = pasted.trim();
  const oauthError = /[?&]error=([^&\s]+)/.exec(trimmed);
  if (oauthError) return `oauth_error:${decodeURIComponent(oauthError[1])}`;
  if (!/[?&]code=[^&\s]+/.test(trimmed)) return "no_code_in_url";
  if (extractState(trimmed) !== expectedState) return "state_mismatch";
  return null;
}

// Single API instance (Bun.serve) -> module-level state is safe and shared
// across requests. A paste-back flow spans two requests (start -> code), so we
// keep the live process here keyed by sessionId. Both gog reauth and Claude
// login share this registry, distinguished by `key` for single-flight.
const registry = new Map<string, RegistryEntry>();

function cleanup(sessionId: string): void {
  const entry = registry.get(sessionId);
  if (!entry) return;
  clearTimeout(entry.timer);
  registry.delete(sessionId);
}

async function* lines(stream: ReadableStream<Uint8Array> | null) {
  if (!stream) return;
  const decoder = new TextDecoder();
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    yield decoder.decode(value, { stream: true });
  }
}

export interface CreatePasteBackSessionOptions {
  /** Single-flight key: a new session supersedes only the in-flight one with the same key. */
  key: string;
  cmd: string[];
  urlRegex: RegExp;
  ttlMs: number;
  urlTimeoutMs?: number;
  /** Defaults to `${cmd[0]} exited` in error messages. */
  label?: string;
  /**
   * When true, capture the `state` from the printed URL and require the pasted
   * redirect to echo it (gog reauth). Leave false for code-only flows.
   */
  verifyState?: boolean;
}

const DEFAULT_URL_TIMEOUT_MS = 15_000;

/**
 * Spawns a CLI that prints an OAuth URL and then waits on stdin for a pasted
 * code/redirect-URL. Returns once the URL is extracted; the caller submits the
 * paste-back via `submitPasteBackCode(sessionId, code)`.
 *
 * Per-key single-flight: starting a new session evicts any in-flight session
 * sharing the same `key` (account email for gog, "claude" for Claude login).
 */
export async function createPasteBackLoginSession(
  opts: CreatePasteBackSessionOptions,
): Promise<PasteBackSession> {
  // Single-flight: evict any in-flight session with the same key.
  for (const entry of registry.values()) {
    if (entry.key !== opts.key) continue;
    try {
      entry.proc.kill();
    } catch {}
    cleanup(entry.sessionId);
  }

  const label = opts.label ?? opts.cmd[0] ?? "process";
  const urlTimeoutMs = opts.urlTimeoutMs ?? DEFAULT_URL_TIMEOUT_MS;

  const proc = Bun.spawn({
    cmd: opts.cmd,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe", // kept open so we can write the pasted code later
    env: { ...process.env },
  }) as PasteBackProc;

  let buffer = "";

  const url = await new Promise<string>((resolve, reject) => {
    let settled = false;
    const fail = (msg: string) => {
      if (settled) return;
      settled = true;
      try {
        proc.kill();
      } catch {}
      reject(new Error(msg));
    };
    const ok = (u: string) => {
      if (settled) return;
      settled = true;
      resolve(u);
    };

    (async () => {
      try {
        for await (const chunk of lines(proc.stdout)) {
          buffer += chunk;
          const m = opts.urlRegex.exec(buffer);
          if (m) return ok(m[0]);
        }
      } catch (err) {
        fail(`stdout error: ${(err as Error).message}`);
      }
    })();

    (async () => {
      try {
        for await (const chunk of lines(proc.stderr)) {
          buffer += chunk;
          const m = opts.urlRegex.exec(buffer);
          if (m) return ok(m[0]);
        }
      } catch (err) {
        fail(`stderr error: ${(err as Error).message}`);
      }
    })();

    proc.exited.then((code) => {
      if (!settled) fail(`${label} exited (${code}) before printing URL`);
    });

    setTimeout(() => fail(`timed out waiting for ${label} URL`), urlTimeoutMs);
  });

  const sessionId = crypto.randomUUID();
  const expectedState = opts.verifyState ? extractState(url) : undefined;
  const done = proc.exited.then((code) =>
    code === 0
      ? ({ ok: true } as const)
      : ({ ok: false as const, error: `${label} exit ${code}` }),
  );
  // Evict whenever the process finishes, however it finishes.
  done.finally(() => cleanup(sessionId));

  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {}
    cleanup(sessionId);
  }, opts.ttlMs);

  registry.set(sessionId, {
    sessionId,
    key: opts.key,
    proc,
    url,
    expectedState,
    done,
    createdAt: Date.now(),
    timer,
  });

  debug("paste-back url ready", {
    sessionId,
    key: opts.key,
    hasState: expectedState !== undefined,
  });
  return { sessionId, url, done };
}

/**
 * Writes `code + "\n"` to the waiting process's stdin, ends it, and awaits exit.
 * Used by both Claude login (an OAuth code) and gog reauth (a full redirect URL).
 */
export async function submitPasteBackCode(
  sessionId: string,
  code: string,
): Promise<PasteBackResult> {
  const entry = registry.get(sessionId);
  if (!entry) {
    // expired, already completed, or unknown id
    return { ok: false, error: "session_not_found" };
  }
  // For state-bearing flows (gog reauth) validate the pasted redirect *before*
  // feeding it to the CLI, so a stale tab or a code from a different login
  // attempt fails fast with a clear reason instead of an opaque CLI exit 1.
  if (entry.expectedState !== undefined) {
    const reason = validatePastedRedirect(code, entry.expectedState);
    if (reason) {
      debug("paste-back rejected", { sessionId, reason });
      return { ok: false, error: reason };
    }
  }
  const stdin = entry.proc.stdin;
  if (!stdin) {
    cleanup(sessionId);
    return { ok: false, error: "session_stdin_unavailable" };
  }
  try {
    stdin.write(new TextEncoder().encode(code.trim() + "\n"));
    await stdin.flush();
    // Close stdin so the CLI proceeds past the prompt and exits.
    await stdin.end();
  } catch (err) {
    return { ok: false, error: `write_failed: ${(err as Error).message}` };
  }
  // Await success/failure synchronously; cleanup is wired via done.finally.
  const result = await entry.done;
  debug("paste-back code submitted", { sessionId, ok: result.ok });
  return result;
}
