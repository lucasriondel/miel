import { useCallback, useEffect, useRef } from "react";
import { MAX_ATTACHMENTS_BYTES } from "@miel/core/composeLimits";
import { composeErrorMessage } from "../../api/apiErrorMessage";
import { deleteUpload, uploadAttachment } from "../../api/uploads";
import type { FieldsPatch } from "./ComposeProvider";
import type { UploadChip } from "./composeSession";

interface Options {
  uploads: UploadChip[];
  /** The mailbox the message goes from: every upload is staged for it. */
  accountId: string;
  update: (patch: FieldsPatch) => void;
}

const MB = 1024 * 1024;

/** The server's own wording for a file it would refuse, said before a byte is sent. */
export const tooLargeMessage = (bytes: number): string =>
  `${(bytes / MB).toFixed(1)} MB — over Gmail's 25 MB.`;

/** Every attached file that will travel, in bytes — failed chips travel nowhere. */
export const attachedBytes = (uploads: readonly UploadChip[]): number =>
  uploads.filter((u) => u.status !== "failed").reduce((sum, u) => sum + u.size, 0);

export const overAttachmentLimit = (uploads: readonly UploadChip[], extraBytes = 0): boolean =>
  attachedBytes(uploads) + extraBytes > MAX_ATTACHMENTS_BYTES;

let counter = 0;
const nextKey = () => `upload-${Date.now().toString(36)}-${(counter += 1)}`;

const patchChip =
  (key: string, patch: Partial<UploadChip>): FieldsPatch =>
  (fields) => ({
    uploads: fields.uploads.map((u) => (u.key === key ? { ...u, ...patch } : u)),
  });

/**
 * The window's attachments: each file is uploaded the moment it is attached,
 * on its own, so every chip has its own progress and a refused file fails
 * alone — it says why on its chip and never blocks the rest.
 *
 * The bytes stay here, keyed by chip, because an upload belongs to one
 * mailbox: picking another in the From menu stages every file again for it.
 * A send waits for what is still in flight ({@link waitForUploads}) and names
 * the ids in chip order.
 */
export function useAttachmentUploads({ uploads, accountId, update }: Options) {
  const files = useRef(new Map<string, File>());
  const inFlight = useRef(new Map<string, { promise: Promise<void>; abort: AbortController }>());
  const staged = useRef(new Map<string, { id: string; accountId: string }>());
  const latest = useRef(uploads);
  latest.current = uploads;

  const stage = useCallback(
    (key: string, file: File, forAccount: string) => {
      const abort = new AbortController();
      update(
        patchChip(key, { status: "uploading", progress: 0, error: null, uploadedFor: forAccount }),
      );
      const promise = uploadAttachment({
        accountId: forAccount,
        file,
        signal: abort.signal,
        onProgress: (progress) => update(patchChip(key, { progress })),
      })
        .then((result) => {
          staged.current.set(key, { id: result.id, accountId: forAccount });
          update(
            patchChip(key, {
              status: "ready",
              progress: 1,
              uploadId: result.id,
              filename: result.filename,
            }),
          );
        })
        .catch((err: unknown) => {
          if (abort.signal.aborted) return;
          update(patchChip(key, { status: "failed", error: composeErrorMessage(err) }));
        })
        .finally(() => {
          if (inFlight.current.get(key)?.abort === abort) inFlight.current.delete(key);
        });
      inFlight.current.set(key, { promise, abort });
    },
    [update],
  );

  const attach = useCallback(
    (picked: readonly File[]) => {
      const chips: UploadChip[] = [];
      const toStage: [string, File][] = [];
      for (const file of picked) {
        const key = nextKey();
        const tooLarge = file.size > MAX_ATTACHMENTS_BYTES;
        chips.push({
          key,
          filename: file.name,
          size: file.size,
          mimeType: file.type || "application/octet-stream",
          status: tooLarge ? "failed" : "uploading",
          progress: 0,
          uploadId: null,
          uploadedFor: null,
          error: tooLarge ? tooLargeMessage(file.size) : null,
        });
        if (!tooLarge) {
          files.current.set(key, file);
          toStage.push([key, file]);
        }
      }
      update((fields) => ({ uploads: [...fields.uploads, ...chips] }));
      for (const [key, file] of toStage) stage(key, file, accountId);
    },
    [accountId, stage, update],
  );

  const drop = useCallback((key: string) => {
    inFlight.current.get(key)?.abort.abort();
    inFlight.current.delete(key);
    files.current.delete(key);
    const done = staged.current.get(key);
    staged.current.delete(key);
    if (done) void deleteUpload(done.accountId, done.id).catch(() => {});
  }, []);

  const remove = useCallback(
    (key: string) => {
      drop(key);
      update((fields) => ({ uploads: fields.uploads.filter((u) => u.key !== key) }));
    },
    [drop, update],
  );

  // A different mailbox: what was staged for the old one is no use to it.
  useEffect(() => {
    for (const chip of latest.current) {
      if (chip.status === "failed" || chip.uploadedFor === null) continue;
      if (chip.uploadedFor === accountId) continue;
      const file = files.current.get(chip.key);
      if (!file) continue;
      const done = staged.current.get(chip.key);
      inFlight.current.get(chip.key)?.abort.abort();
      staged.current.delete(chip.key);
      if (done) void deleteUpload(done.accountId, done.id).catch(() => {});
      stage(chip.key, file, accountId);
    }
  }, [accountId, stage]);

  /** Before a send: what is still uploading finishes, then the ids in chip order. */
  const waitForUploads = useCallback(async (): Promise<string[]> => {
    await Promise.all([...inFlight.current.values()].map((u) => u.promise));
    return latest.current.flatMap((chip) => {
      const done = staged.current.get(chip.key);
      return done && done.accountId === accountId ? [done.id] : [];
    });
  }, [accountId]);

  /** The window is discarded: nothing it staged is wanted. */
  const discardAll = useCallback(() => {
    for (const key of [...files.current.keys(), ...staged.current.keys()]) drop(key);
  }, [drop]);

  return { attach, remove, waitForUploads, discardAll };
}
