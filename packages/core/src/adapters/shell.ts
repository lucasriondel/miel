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
