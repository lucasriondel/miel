import { getEnv } from "../env";
import {
  ClaudeAuthStatus,
  type ClaudeAuthStatusT,
} from "../schemas/claudeAuth";
import { spawnJson } from "./shell";
import {
  createPasteBackLoginSession,
  submitPasteBackCode,
  type PasteBackResult,
} from "./pasteBackSession";

export interface ClaudeLoginSession {
  sessionId: string;
  url: string;
  done: Promise<PasteBackResult>;
}

// The CLI prints the OAuth URL like:
//   If the browser didn't open, visit: https://claude.com/cai/oauth/authorize?...
// We also tolerate console.anthropic.com defensively.
const CLAUDE_AUTH_URL_RE =
  /https:\/\/(?:claude\.com\/cai\/oauth|console\.anthropic\.com)\/[^\s]+/;

// Generous: the user must open the browser, sign in, and paste the code.
const SESSION_TTL_MS = 5 * 60_000;

// `claude -p` returns a success-shaped envelope with is_error:true and a result
// string like "Not logged in · Please run /login" when the CLI has no auth. We
// match on that result string to distinguish it from real run errors.
const NOT_LOGGED_IN_RE = /not logged in|please run \/login/i;

export function isClaudeNotLoggedInResult(result: string): boolean {
  return NOT_LOGGED_IN_RE.test(result);
}

export async function getClaudeAuthStatus(): Promise<ClaudeAuthStatusT> {
  const { CLAUDE_BIN } = getEnv();
  // `claude auth status --json` exits 0 whether or not we're logged in.
  const raw = await spawnJson({ cmd: [CLAUDE_BIN, "auth", "status", "--json"] });
  return ClaudeAuthStatus.parse(raw);
}

export async function startClaudeLoginSession(): Promise<ClaudeLoginSession> {
  const { CLAUDE_BIN } = getEnv();
  return createPasteBackLoginSession({
    key: "claude",
    cmd: [CLAUDE_BIN, "auth", "login", "--claudeai"],
    urlRegex: CLAUDE_AUTH_URL_RE,
    ttlMs: SESSION_TTL_MS,
    label: "claude auth login",
  });
}

export async function submitClaudeLoginCode(
  sessionId: string,
  code: string,
): Promise<PasteBackResult> {
  return submitPasteBackCode(sessionId, code);
}

/**
 * Eagerly spawns a Claude login session and returns the paste-back
 * {sessionId, url} for a `sync.claude_login_required` event. On spawn/URL-timeout
 * failure returns `{}` so callers emit a signal-only event (web falls back to a
 * click-to-start button). Mirrors the eager-vs-signal-only reauth path for gog.
 */
export async function startClaudeLoginForEvent(): Promise<{
  sessionId?: string;
  url?: string;
}> {
  try {
    const session = await startClaudeLoginSession();
    session.done.catch(() => {
      /* surfaced via the paste-back result or a status poll */
    });
    return { sessionId: session.sessionId, url: session.url };
  } catch {
    return {};
  }
}
