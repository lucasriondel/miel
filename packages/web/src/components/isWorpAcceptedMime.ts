const WORP_ACCEPTED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

// Extensions matching WORP_ACCEPTED_MIME_TYPES, used as a fallback when the
// reported MIME type is generic (e.g. application/octet-stream) or missing.
// Some mail clients mislabel PDFs/images as application/octet-stream, which
// would otherwise hide "Send to worp" for a file worp can actually ingest.
const WORP_ACCEPTED_EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp", "gif"]);

// MIME types too generic to trust; fall back to the filename extension instead.
const GENERIC_MIME_TYPES = new Set(["application/octet-stream", "binary/octet-stream"]);

function extensionOf(filename: string | null | undefined): string | null {
  if (!filename) return null;
  const dot = filename.lastIndexOf(".");
  if (dot < 0 || dot === filename.length - 1) return null;
  return filename
    .slice(dot + 1)
    .trim()
    .toLowerCase();
}

export function isWorpAcceptedMime(
  mimeType: string | null | undefined,
  filename?: string | null,
): boolean {
  const normalized = mimeType?.split(";")[0]!.trim().toLowerCase() || null;

  if (normalized && WORP_ACCEPTED_MIME_TYPES.has(normalized)) return true;

  // When the MIME type is absent or generic, trust the filename extension.
  if (!normalized || GENERIC_MIME_TYPES.has(normalized)) {
    const ext = extensionOf(filename);
    return ext !== null && WORP_ACCEPTED_EXTENSIONS.has(ext);
  }

  return false;
}
