/**
 * The limits a message's attachments are held to, in one leaf module so the
 * compose window can state the same figure the server enforces ("Up to 25 MB in
 * total — Gmail's limit").
 *
 * Gmail accepts a message of up to 35 MB through the API's media upload, but
 * base64 grows a file by a third on the way into the MIME message, and Gmail's
 * own composer stops at 25 MB of files. Holding the files to 25 MB in total
 * keeps a message miel sends inside what Gmail will take and what its
 * recipients' servers commonly accept.
 */
export const MAX_ATTACHMENTS_BYTES = 25 * 1024 * 1024;

/** How long an upload no send has spent is kept before the sweep drops it. */
export const UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
