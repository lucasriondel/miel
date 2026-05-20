const startedAt = Date.now();

function ts(): string {
  const ms = Date.now() - startedAt;
  return `+${ms}ms`;
}

function format(value: unknown): string {
  if (value === undefined) return "undefined";
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    const seen = new WeakSet<object>();
    const json = JSON.stringify(value, (_k, v) => {
      if (typeof v === "object" && v !== null) {
        if (seen.has(v as object)) return "[Circular]";
        seen.add(v as object);
      }
      if (typeof v === "string" && v.length > 200) {
        return `${v.slice(0, 200)}…(+${v.length - 200} chars)`;
      }
      return v;
    });
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

export interface DebugLogger {
  (msg: string, data?: Record<string, unknown>): void;
  child(suffix: string): DebugLogger;
}

export function createDebug(namespace: string): DebugLogger {
  const log = (msg: string, data?: Record<string, unknown>) => {
    const prefix = `[miel:${namespace}] ${ts()}`;
    if (data && Object.keys(data).length > 0) {
      const parts = Object.entries(data).map(
        ([k, v]) => `${k}=${format(v)}`,
      );
      process.stderr.write(`${prefix} ${msg} ${parts.join(" ")}\n`);
    } else {
      process.stderr.write(`${prefix} ${msg}\n`);
    }
  };
  const fn = log as DebugLogger;
  fn.child = (suffix: string) => createDebug(`${namespace}:${suffix}`);
  return fn;
}
