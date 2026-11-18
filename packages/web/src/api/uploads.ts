import { apiBase, apiSecret } from "../config";
import { ApiError, apiFetch } from "./client";

/**
 * The compose window's attachments: each file is uploaded on its own as soon as
 * it is attached (`POST /compose/uploads`) and a send names the ids it got back
 * (`uploadIds`), which is what gives every chip its own progress and lets a
 * refused file fail alone.
 */
export interface UploadedFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface UploadInput {
  /** The mailbox the message will be sent from: an upload belongs to one account. */
  accountId: string;
  file: File;
  /** 0–1, as the bytes leave the browser. */
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * The upload URL, resolved the way `apiFetch` resolves every path. Built here
 * rather than imported from the client: suites replace that module wholesale,
 * and a stub that predates this file would leave the import unresolved.
 */
const uploadUrl = (): string => new URL(`${apiBase}/compose/uploads`, window.location.origin).href;

const refusal = (status: number, parsed: unknown): ApiError => {
  const code =
    parsed &&
    typeof parsed === "object" &&
    typeof (parsed as { error?: unknown }).error === "string"
      ? (parsed as { error: string }).error
      : `request failed (${status})`;
  return new ApiError(code, status, parsed);
};

const parse = (text: string): unknown => {
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

/**
 * One file, as multipart. An `XMLHttpRequest` rather than `fetch` because only
 * it reports upload progress; a refusal (a file over 25 MB answers 413
 * `attachment_too_large`) is raised as the same `ApiError` `apiFetch` raises.
 */
export const uploadAttachment = ({
  accountId,
  file,
  onProgress,
  signal,
}: UploadInput): Promise<UploadedFile> =>
  new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", uploadUrl());
    xhr.setRequestHeader("Authorization", `Bearer ${apiSecret}`);
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
    });
    xhr.addEventListener("load", () => {
      const parsed = parse(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) resolve(parsed as UploadedFile);
      else reject(refusal(xhr.status, parsed));
    });
    xhr.addEventListener("error", () =>
      reject(new Error("The upload could not reach the server.")),
    );
    xhr.addEventListener("abort", () => reject(new DOMException("Upload cancelled", "AbortError")));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    const form = new FormData();
    form.append("accountId", accountId);
    form.append("file", file, file.name);
    xhr.send(form);
  });

/** Removing a chip: the staged bytes go too. A missing upload is already gone. */
export const deleteUpload = (accountId: string, uploadId: string) =>
  apiFetch<{ ok: true }>({
    path: `/compose/uploads/${accountId}/${uploadId}`,
    method: "DELETE",
  });
