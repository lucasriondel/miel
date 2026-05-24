import { apiBase, apiSecret } from "../config";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface ApiRequest {
  path: string;
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: ApiRequest["query"]): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // apiBase may be a full URL (cross-origin API, e.g. prod) or a path (dev
  // proxy, e.g. "/api"). Resolve against window.location.origin so a path-only
  // base stays same-origin; a full URL keeps its own host.
  const url = new URL(`${apiBase}${normalizedPath}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  // When apiBase is same-origin we could return a relative path, but returning
  // the absolute href works in both cases and preserves a cross-origin host.
  return url.href;
}

export async function apiFetch<T>(req: ApiRequest): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiSecret}`,
  };
  let bodyInit: BodyInit | undefined;
  if (req.body !== undefined) {
    headers["Content-Type"] = "application/json";
    bodyInit = JSON.stringify(req.body);
  }
  const res = await fetch(buildUrl(req.path, req.query), {
    method: req.method ?? "GET",
    headers,
    body: bodyInit,
    signal: req.signal,
  });
  const text = await res.text();
  let parsed: unknown = null;
  if (text.length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }
  if (!res.ok) {
    const message =
      (parsed &&
        typeof parsed === "object" &&
        "error" in parsed &&
        typeof (parsed as { error: unknown }).error === "string"
        ? (parsed as { error: string }).error
        : null) ?? `request failed (${res.status})`;
    throw new ApiError(message, res.status, parsed);
  }
  return parsed as T;
}
