import type { GogMessagePayloadT, GogMessageRawT } from "../schemas/gmail";

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return new TextDecoder("utf-8").decode(
      Uint8Array.from(atob(padded + "===".slice((padded.length + 3) % 4)), (c) => c.charCodeAt(0)),
    );
  } catch {
    return "";
  }
}

function walk(part: GogMessagePayloadT | undefined, acc: { text: string[]; html: string[] }): void {
  if (!part) return;
  const mime = part.mimeType ?? "";
  const data = part.body?.data;
  if (data) {
    const decoded = decodeBase64Url(data);
    if (mime.startsWith("text/html")) acc.html.push(decoded);
    else if (mime.startsWith("text/plain")) acc.text.push(decoded);
    else if (!part.parts || part.parts.length === 0) acc.text.push(decoded);
  }
  for (const child of part.parts ?? []) walk(child, acc);
}

export function extractBodies(msg: GogMessageRawT): {
  bodyText: string;
  bodyHtml: string;
} {
  const acc = { text: [] as string[], html: [] as string[] };
  walk(msg.payload, acc);
  return { bodyText: acc.text.join("\n\n"), bodyHtml: acc.html.join("\n") };
}

export interface AttachmentMeta {
  attachmentId: string;
  filename: string;
  mimeType: string;
  size: number;
}

function partHeader(part: GogMessagePayloadT, name: string): string | undefined {
  return part.headers?.find((h) => h.name.toLowerCase() === name)?.value;
}

// A part the HTML body draws through `cid:` is part of the message's content —
// a signature logo, a social icon, an embedded screenshot — not a file someone
// attached. Mail clients render those inline and list only the rest, and a
// signature-heavy reply chain can carry twenty of them.
function referencedContentIds(html: string): Set<string> {
  const ids = new Set<string>();
  for (const match of html.matchAll(/cid:([^"'\s)>]+)/gi)) {
    ids.add(decodeCid(match[1]!).toLowerCase());
  }
  return ids;
}

function decodeCid(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function isInlineContent(part: GogMessagePayloadT, cids: Set<string>): boolean {
  const contentId = partHeader(part, "content-id")?.trim().replace(/^<|>$/g, "");
  return contentId !== undefined && contentId.length > 0 && cids.has(contentId.toLowerCase());
}

function walkAttachments(
  part: GogMessagePayloadT | undefined,
  cids: Set<string>,
  acc: AttachmentMeta[],
): void {
  if (!part) return;
  const attachmentId = part.body?.attachmentId;
  if (attachmentId && !isInlineContent(part, cids)) {
    acc.push({
      attachmentId,
      filename: part.filename ?? "",
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body?.size ?? 0,
    });
  }
  for (const child of part.parts ?? []) walkAttachments(child, cids, acc);
}

export function extractAttachments(msg: GogMessageRawT): AttachmentMeta[] {
  const acc: AttachmentMeta[] = [];
  const cids = referencedContentIds(extractBodies(msg).bodyHtml);
  walkAttachments(msg.payload, cids, acc);
  return acc;
}

export function extractHeaders(msg: GogMessageRawT): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of msg.payload?.headers ?? []) {
    out[h.name.toLowerCase()] = h.value;
  }
  return out;
}

export function parseFromHeader(value: string | undefined): {
  email: string;
  name: string | null;
} {
  if (!value) return { email: "", name: null };
  const match = value.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  if (match) {
    const name = match[1]!.trim();
    return { email: match[2]!.trim(), name: name.length > 0 ? name : null };
  }
  return { email: value.trim(), name: null };
}

export function parseAddressList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((p) => parseFromHeader(p).email)
    .filter((e) => e.length > 0);
}

export function parseInternalDate(v: string | number | undefined): Date {
  if (v === undefined || v === null) return new Date();
  const ms = typeof v === "string" ? Number(v) : v;
  if (Number.isFinite(ms)) return new Date(ms);
  return new Date();
}
