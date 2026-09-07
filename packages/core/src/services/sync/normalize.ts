import { type GogMessageT, GogMessageDecoded } from "../../schemas/gmail";
import type { NormalizedMessage } from "./types";
import {
  extractAttachments,
  extractBodies,
  extractHeaders,
  parseAddressList,
  parseFromHeader,
  parseInternalDate,
} from "../../util/gmailPayload";

export function normalizeMessage(accountId: string, raw: GogMessageT): NormalizedMessage {
  const decodedAttempt = GogMessageDecoded.safeParse(raw);
  if (
    decodedAttempt.success &&
    (decodedAttempt.data.bodyText !== undefined ||
      decodedAttempt.data.bodyHtml !== undefined ||
      decodedAttempt.data.body !== undefined ||
      decodedAttempt.data.subject !== undefined ||
      decodedAttempt.data.from !== undefined)
  ) {
    const d = decodedAttempt.data;
    const fromParsed = parseFromHeader(d.from ?? undefined);
    const toEmails = Array.isArray(d.to)
      ? d.to
      : typeof d.to === "string"
        ? parseAddressList(d.to)
        : [];
    const rawAsPayload = raw as Extract<GogMessageT, { payload?: unknown }>;
    const payloadBodies = extractBodies(rawAsPayload);
    return {
      accountId,
      gmailMessageId: d.id,
      gmailThreadId: d.threadId,
      fromEmail: fromParsed.email,
      fromName: fromParsed.name,
      toEmails,
      subject: d.subject ?? null,
      snippet: d.snippet ?? null,
      bodyText: d.bodyText ?? d.body ?? payloadBodies.bodyText,
      bodyHtml: d.bodyHtml ?? payloadBodies.bodyHtml,
      internalDate: parseInternalDate(d.internalDate),
      rawHeaders: d.headers ?? {},
      labelIds: d.labelIds ?? [],
      attachments: extractAttachments(rawAsPayload),
    };
  }

  const rawShape = raw as Extract<GogMessageT, { payload?: unknown }>;
  const headers = extractHeaders(rawShape);
  const bodies = extractBodies(rawShape);
  const fromParsed = parseFromHeader(headers["from"]);
  return {
    accountId,
    gmailMessageId: rawShape.id,
    gmailThreadId: rawShape.threadId,
    fromEmail: fromParsed.email,
    fromName: fromParsed.name,
    toEmails: parseAddressList(headers["to"]),
    subject: headers["subject"] ?? null,
    snippet: rawShape.snippet ?? null,
    bodyText: bodies.bodyText,
    bodyHtml: bodies.bodyHtml,
    internalDate: parseInternalDate(rawShape.internalDate),
    rawHeaders: headers,
    labelIds: rawShape.labelIds ?? [],
    attachments: extractAttachments(rawShape),
  };
}
