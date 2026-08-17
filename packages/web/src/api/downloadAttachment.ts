import { apiBase, apiSecret } from "../config";

export async function downloadAttachment(args: {
  accountId: string;
  gmailMessageId: string;
  attachmentId: string;
  filename: string;
}): Promise<void> {
  const url =
    `${apiBase}/messages/${encodeURIComponent(args.accountId)}` +
    `/${encodeURIComponent(args.gmailMessageId)}` +
    `/attachments/${encodeURIComponent(args.attachmentId)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiSecret}` },
  });
  if (!res.ok) {
    throw new Error(`download failed (${res.status})`);
  }
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = args.filename || "attachment";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
