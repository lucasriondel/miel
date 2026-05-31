import { createDebug } from "../util/debug";

const debug = createDebug("shell");

export interface SpawnJsonOptions {
  cmd: string[];
  stdin?: string;
  env?: Record<string, string>;
}

export class ShellError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number,
    public readonly stderr: string,
    public readonly stdout: string,
    public readonly cmd: string[],
  ) {
    super(message);
    this.name = "ShellError";
  }
}

export class ReauthRequiredError extends Error {
  constructor(
    public readonly account: string,
    public readonly cause: ShellError,
  ) {
    super(`Account ${account} needs re-authentication`);
    this.name = "ReauthRequiredError";
  }
}

// Thrown when the Claude CLI reports it isn't logged in (the `claude -p` envelope
// comes back with is_error + "Not logged in · Please run /login"). The login is
// global (not per-account), so this carries no account — the web drives a single
// `claude auth login` paste-back flow, mirroring ReauthRequiredError for gog.
export class ClaudeNotLoggedInError extends Error {
  constructor(public readonly cause: ShellError) {
    super("Claude CLI is not logged in");
    this.name = "ClaudeNotLoggedInError";
  }
}

export function isInvalidGrantStderr(stderr: string): boolean {
  return /invalid_grant/i.test(stderr);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}… (+${s.length - max} more)`;
}

async function readAll(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  out += decoder.decode();
  return out;
}

export async function spawnCapture(opts: SpawnJsonOptions): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
}> {
  const bin = opts.cmd[0]?.split("/").pop() ?? opts.cmd[0];
  const argPreview = opts.cmd.slice(1, 8).join(" ");
  const startedAt = Date.now();
  debug("spawn", {
    bin,
    args: argPreview,
    argc: opts.cmd.length - 1,
    hasStdin: Boolean(opts.stdin),
  });

  const proc = Bun.spawn({
    cmd: opts.cmd,
    stdin: opts.stdin ? new TextEncoder().encode(opts.stdin) : "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, ...(opts.env ?? {}) },
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    readAll(proc.stdout as ReadableStream<Uint8Array> | null),
    readAll(proc.stderr as ReadableStream<Uint8Array> | null),
    proc.exited,
  ]);

  debug("spawn done", {
    bin,
    exitCode,
    ms: Date.now() - startedAt,
    stdoutBytes: stdout.length,
    stderrBytes: stderr.length,
    ...(exitCode !== 0
      ? {
          stderr: truncate(stderr.trim(), 2000),
          stdout: truncate(stdout.trim(), 500),
        }
      : {}),
  });

  return { stdout, stderr, exitCode };
}

export async function spawnJson<T = unknown>(opts: SpawnJsonOptions): Promise<T> {
  const { stdout, stderr, exitCode } = await spawnCapture(opts);
  if (exitCode !== 0) {
    throw new ShellError(
      `Command failed (exit ${exitCode}): ${opts.cmd.join(" ")}`,
      exitCode,
      stderr,
      stdout,
      opts.cmd,
    );
  }
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new ShellError(
      `Command produced no stdout: ${opts.cmd.join(" ")}`,
      exitCode,
      stderr,
      stdout,
      opts.cmd,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch (err) {
    throw new ShellError(
      `Failed to parse JSON from ${opts.cmd.join(" ")}: ${(err as Error).message}`,
      exitCode,
      stderr,
      stdout,
      opts.cmd,
    );
  }
}

export async function spawnVoid(opts: SpawnJsonOptions): Promise<void> {
  const { stdout, stderr, exitCode } = await spawnCapture(opts);
  if (exitCode !== 0) {
    throw new ShellError(
      `Command failed (exit ${exitCode}): ${opts.cmd.join(" ")}`,
      exitCode,
      stderr,
      stdout,
      opts.cmd,
    );
  }
}
