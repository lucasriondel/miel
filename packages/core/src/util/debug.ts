const startedAt = Date.now();

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 0,
  debug: 1,
  info: 2,
  warn: 3,
  error: 4,
};

// LOG_LEVEL env var controls the floor; anything below it is skipped.
// Default is "debug" so existing call sites stay visible, but per-message
// noise (google:*, http request logs) is tagged "trace" and hidden unless
// LOG_LEVEL=trace is set explicitly.
const MIN_LEVEL: LogLevel = (() => {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "trace" || raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return "debug";
})();

const NO_COLOR = Boolean(process.env.NO_COLOR) || !process.stderr.isTTY;

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
  blue: "\x1b[34m",
  gray: "\x1b[90m",
} as const;

function paint(code: string, text: string): string {
  if (NO_COLOR) return text;
  return `${code}${text}${COLORS.reset}`;
}

const LEVEL_STYLE: Record<LogLevel, { label: string; color: string }> = {
  trace: { label: "TRACE", color: COLORS.gray },
  debug: { label: "DEBUG", color: COLORS.dim },
  info: { label: "INFO ", color: COLORS.green },
  warn: { label: "WARN ", color: COLORS.yellow },
  error: { label: "ERROR", color: COLORS.red },
};

// Stable color per top-level namespace segment (google, service, db, ...) so
// scanning a scrolling terminal for "which subsystem" is a color glance.
const NAMESPACE_COLORS = [
  COLORS.cyan,
  COLORS.magenta,
  COLORS.blue,
  COLORS.green,
  COLORS.yellow,
] as const;

function colorForNamespace(namespace: string): string {
  const root = namespace.split(":")[0] ?? namespace;
  let hash = 0;
  for (let i = 0; i < root.length; i++) {
    hash = (hash * 31 + root.charCodeAt(i)) >>> 0;
  }
  return NAMESPACE_COLORS[hash % NAMESPACE_COLORS.length] as string;
}

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
  trace(msg: string, data?: Record<string, unknown>): void;
  info(msg: string, data?: Record<string, unknown>): void;
  warn(msg: string, data?: Record<string, unknown>): void;
  error(msg: string, data?: Record<string, unknown>): void;
  child(suffix: string): DebugLogger;
}

export function createDebug(namespace: string): DebugLogger {
  const nsColor = colorForNamespace(namespace);

  const write = (level: LogLevel, msg: string, data?: Record<string, unknown>) => {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return;

    const style = LEVEL_STYLE[level];
    const levelTag = paint(style.color, style.label);
    const nsTag = paint(nsColor, `[miel:${namespace}]`);
    const timeTag = paint(COLORS.dim, ts());
    const prefix = `${levelTag} ${nsTag} ${timeTag}`;

    if (data && Object.keys(data).length > 0) {
      const parts = Object.entries(data).map(
        ([k, v]) => `${paint(COLORS.dim, `${k}=`)}${format(v)}`,
      );
      process.stderr.write(`${prefix} ${msg} ${parts.join(" ")}\n`);
    } else {
      process.stderr.write(`${prefix} ${msg}\n`);
    }
  };

  const fn = ((msg: string, data?: Record<string, unknown>) =>
    write("debug", msg, data)) as DebugLogger;
  fn.trace = (msg, data) => write("trace", msg, data);
  fn.info = (msg, data) => write("info", msg, data);
  fn.warn = (msg, data) => write("warn", msg, data);
  fn.error = (msg, data) => write("error", msg, data);
  fn.child = (suffix: string) => createDebug(`${namespace}:${suffix}`);
  return fn;
}
