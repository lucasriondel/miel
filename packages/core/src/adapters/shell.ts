import { Effect } from "effect";
import { createDebug } from "../util/debug";
import { runPromiseRethrow, toError } from "../util/effect";

const debug = createDebug("shell");

export interface SpawnJsonOptions {
  cmd: string[];
  stdin?: string;
  env?: Record<string, string>;
}

export class ShellError extends Error {
  readonly _tag = "ShellError";
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

export interface SpawnCaptureResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

// Spawning never fails with a recoverable error — a spawn that can't run is a
// defect (missing binary, bad cmd), so the error channel stays `never`.
export const spawnCaptureEffect = (opts: SpawnJsonOptions): Effect.Effect<SpawnCaptureResult> =>
  Effect.promise(async () => {
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
      env: { ...process.env, ...opts.env },
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
  });

export const spawnJsonEffect = <T = unknown>(
  opts: SpawnJsonOptions,
): Effect.Effect<T, ShellError> =>
  Effect.gen(function* () {
    const { stdout, stderr, exitCode } = yield* spawnCaptureEffect(opts);
    if (exitCode !== 0) {
      return yield* Effect.fail(
        new ShellError(
          `Command failed (exit ${exitCode}): ${opts.cmd.join(" ")}`,
          exitCode,
          stderr,
          stdout,
          opts.cmd,
        ),
      );
    }
    const trimmed = stdout.trim();
    if (!trimmed) {
      return yield* Effect.fail(
        new ShellError(
          `Command produced no stdout: ${opts.cmd.join(" ")}`,
          exitCode,
          stderr,
          stdout,
          opts.cmd,
        ),
      );
    }
    return yield* Effect.try({
      try: () => JSON.parse(trimmed) as T,
      catch: (err) =>
        new ShellError(
          `Failed to parse JSON from ${opts.cmd.join(" ")}: ${toError(err).message}`,
          exitCode,
          stderr,
          stdout,
          opts.cmd,
        ),
    });
  });

export const spawnVoidEffect = (opts: SpawnJsonOptions): Effect.Effect<void, ShellError> =>
  Effect.gen(function* () {
    const { stdout, stderr, exitCode } = yield* spawnCaptureEffect(opts);
    if (exitCode !== 0) {
      return yield* Effect.fail(
        new ShellError(
          `Command failed (exit ${exitCode}): ${opts.cmd.join(" ")}`,
          exitCode,
          stderr,
          stdout,
          opts.cmd,
        ),
      );
    }
  });

// Promise facades — same contracts as before the Effect migration, used by
// the API/CLI and the paste-back session helpers.
export async function spawnCapture(opts: SpawnJsonOptions): Promise<SpawnCaptureResult> {
  return runPromiseRethrow(spawnCaptureEffect(opts));
}

export async function spawnJson<T = unknown>(opts: SpawnJsonOptions): Promise<T> {
  return runPromiseRethrow(spawnJsonEffect<T>(opts));
}

export async function spawnVoid(opts: SpawnJsonOptions): Promise<void> {
  return runPromiseRethrow(spawnVoidEffect(opts));
}
