import type { Subprocess } from "bun";
import { getEnv } from "../env";
import {
  ClaudeAuthStatus,
  type ClaudeAuthStatusT,
} from "../schemas/claudeAuth";
import { createDebug } from "../util/debug";
import { spawnJson } from "./shell";

const debug = createDebug("adapter:claudeAuth");

export interface ClaudeLoginSession {
  sessionId: string;
  url: string;
  done: Promise<{ ok: true } | { ok: false; error: string }>;
}

type LoginProc = Subprocess<"pipe", "pipe", "pipe">;

interface RegistryEntry {
  sessionId: string;
  proc: LoginProc;
  url: string;
  done: Promise<{ ok: true } | { ok: false; error: string }>;
  createdAt: number;
  timer: ReturnType<typeof setTimeout>;
}

// The CLI prints the OAuth URL like:
//   If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?...
// We also tolerate console.anthropic.com defensively.
const CLAUDE_AUTH_URL_RE =
  /https:\/\/(?:claude\.com\/cai\/oauth|console\.anthropic\.com)\/[^\s]+/;

// Generous: the user must open the browser, sign in, and paste the code.
const SESSION_TTL_MS = 5 * 60_000;
const URL_TIMEOUT_MS = 15_000;

// Single API instance (Bun.serve) -> module-level state is safe and shared
// across requests. A login spans two requests (start -> code), so we keep the
// live process here keyed by sessionId.
const registry = new Map<string, RegistryEntry>();

function cleanup(sessionId: string): void {
  const entry = registry.get(sessionId);
  if (!entry) return;
  clearTimeout(entry.timer);
  registry.delete(sessionId);
}

export async function getClaudeAuthStatus(): Promise<ClaudeAuthStatusT> {
  const { CLAUDE_BIN } = getEnv();
  // `claude auth status --json` exits 0 whether or not we're logged in.
  const raw = await spawnJson({ cmd: [CLAUDE_BIN, "auth", "status", "--json"] });
  return ClaudeAuthStatus.parse(raw);
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

export async function startClaudeLoginSession(): Promise<ClaudeLoginSession> {
  // Single-flight: a fresh start supersedes any in-flight attempt.
  for (const entry of registry.values()) {
    try {
      entry.proc.kill();
    } catch {}
    cleanup(entry.sessionId);
  }

  const { CLAUDE_BIN } = getEnv();
  const proc = Bun.spawn({
    cmd: [CLAUDE_BIN, "auth", "login", "--claudeai"],
    stdout: "pipe",
    stderr: "pipe",
    stdin: "pipe", // kept open so we can write the pasted code later
    env: { ...process.env },
  }) as LoginProc;

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
          const m = CLAUDE_AUTH_URL_RE.exec(buffer);
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
          const m = CLAUDE_AUTH_URL_RE.exec(buffer);
          if (m) return ok(m[0]);
        }
      } catch (err) {
        fail(`stderr error: ${(err as Error).message}`);
      }
    })();

    proc.exited.then((code) => {
      if (!settled) fail(`claude auth login exited (${code}) before printing URL`);
    });

    setTimeout(() => fail("timed out waiting for claude auth URL"), URL_TIMEOUT_MS);
  });

  const sessionId = crypto.randomUUID();
  const done = proc.exited.then((code) =>
    code === 0
      ? ({ ok: true } as const)
      : ({ ok: false as const, error: `claude auth login exit ${code}` }),
  );
  // Evict whenever the process finishes, however it finishes.
  done.finally(() => cleanup(sessionId));

  const timer = setTimeout(() => {
    try {
      proc.kill();
    } catch {}
    cleanup(sessionId);
  }, SESSION_TTL_MS);

  registry.set(sessionId, {
    sessionId,
    proc,
    url,
    done,
    createdAt: Date.now(),
    timer,
  });

  debug("login url ready", { sessionId });
  return { sessionId, url, done };
}

export async function submitClaudeLoginCode(
  sessionId: string,
  code: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const entry = registry.get(sessionId);
  if (!entry) {
    // expired, already completed, or unknown id
    return { ok: false, error: "session_not_found" };
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
  debug("login code submitted", { sessionId, ok: result.ok });
  return result;
}
