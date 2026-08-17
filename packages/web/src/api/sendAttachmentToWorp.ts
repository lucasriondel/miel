import { apiFetch } from "./client";

export type WorpFlow = "personal" | "pro";

export interface SendAttachmentToWorpArgs {
  accountId: string;
  gmailMessageId: string;
  attachmentId: string;
  flow: WorpFlow;
}

/**
 * worp's UploadResult is opaque — we forward it verbatim so worp remains the
 * source of truth for the ingest contract.
 */
export interface SendAttachmentToWorpResponse {
  ok: true;
  result: unknown;
}

export async function sendAttachmentToWorp(
  args: SendAttachmentToWorpArgs,
): Promise<SendAttachmentToWorpResponse> {
  return apiFetch<SendAttachmentToWorpResponse>({
    path:
      `/messages/${encodeURIComponent(args.accountId)}` +
      `/${encodeURIComponent(args.gmailMessageId)}` +
      `/attachments/${encodeURIComponent(args.attachmentId)}` +
      `/send-to-worp`,
    method: "POST",
    body: { flow: args.flow },
  });
}

/**
 * Best-effort extraction of a human-readable filename from worp's opaque
 * response body. Worp may return `{ filename }`, `{ filedAs }`, or nothing at
 * all; we try common shapes and return `null` when none match so the caller
 * can fall back to a generic success message.
 */
export function extractFiledFilename(result: unknown): string | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  for (const key of ["filename", "filedAs", "archivedFilename", "name"]) {
    const value = r[key];
    if (typeof value === "string" && value.length > 0) return value;
  }
  return null;
}
