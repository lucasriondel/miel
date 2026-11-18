/**
 * Attachments on their way out: the compose window uploads each file as it is
 * attached, keeps the id it is answered, and names the ids on the send, the
 * draft save or the scheduled send. See `compose_uploads` for why the bytes are
 * staged in Postgres.
 *
 * A file is refused here if it alone is over Gmail's limit, so the window can
 * mark that one chip refused ("48 MB — over Gmail's 25 MB") without blocking
 * the rest; the send checks the total again, since several files under the
 * limit can still add up to more.
 */
import { Effect } from "effect";
import { MAX_ATTACHMENTS_BYTES, UPLOAD_TTL_MS } from "../composeLimits";
import { ComposeRefusedError } from "../errors";
import { OutboxStore, type Stores } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createDebug } from "../util/debug";
import { resolveAccountEffect } from "./outgoing";

const debug = createDebug("service:uploads");

export interface UploadedAttachment {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface UploadAttachmentArgs {
  accountId: string;
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

/** A filename safe to put in a header: no path, no control characters, never empty. */
const cleanFilename = (name: string): string => {
  const base = name.split(/[\\/]/).pop() ?? "";
  // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return cleaned.length > 0 ? cleaned.slice(0, 255) : "attachment";
};

export const uploadAttachmentEffect = (
  args: UploadAttachmentArgs,
): Effect.Effect<UploadedAttachment, ComposeRefusedError, Stores> =>
  Effect.gen(function* () {
    const account = yield* resolveAccountEffect({ accountId: args.accountId });
    if (args.data.byteLength > MAX_ATTACHMENTS_BYTES) {
      return yield* new ComposeRefusedError({
        reason: "attachment_too_large",
        message: `${(args.data.byteLength / 1024 / 1024).toFixed(1)} MB — over Gmail's 25 MB.`,
      });
    }
    const stored = yield* OutboxStore.use((svc) =>
      svc.putUpload({
        accountId: account.id,
        filename: cleanFilename(args.filename),
        mimeType: args.mimeType || "application/octet-stream",
        data: args.data,
      }),
    );
    debug("uploaded", { id: stored.id, size: stored.size });
    return {
      id: stored.id,
      filename: stored.filename,
      mimeType: stored.mimeType,
      size: stored.size,
    };
  });

/** Drop an upload whose chip the user removed. */
export const removeUploadEffect = (args: {
  accountId: string;
  id: string;
}): Effect.Effect<{ ok: true }, ComposeRefusedError, OutboxStore> =>
  Effect.gen(function* () {
    const removed = yield* OutboxStore.use((svc) => svc.removeUpload(args));
    if (removed === 0) {
      return yield* new ComposeRefusedError({
        reason: "upload_not_found",
        message: `Upload not found: ${args.id}`,
      });
    }
    return { ok: true } as const;
  });

/** Drop uploads no send has spent within a day, keeping any a scheduled send still names. */
export const sweepUploadsEffect = (now: Date): Effect.Effect<number, never, OutboxStore> =>
  OutboxStore.use((svc) => svc.sweepUploads(new Date(now.getTime() - UPLOAD_TTL_MS)));

// Promise facades for the API/CLI boundary.
export async function uploadAttachment(args: UploadAttachmentArgs): Promise<UploadedAttachment> {
  return runWithStores(uploadAttachmentEffect(args));
}

export async function removeUpload(args: { accountId: string; id: string }): Promise<{ ok: true }> {
  return runWithStores(removeUploadEffect(args));
}
