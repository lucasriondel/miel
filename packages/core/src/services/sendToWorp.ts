/**
 * Relay a Gmail attachment to worp's `/api/ingest` for auto-invoice-filing.
 *
 * The API route stays a thin wrapper: it POSTs `{ flow }`, we do everything
 * server-side — fetch bytes via the existing attachments service, build the
 * FormData worp expects, and hold the worp API key here so it never touches
 * the browser. worp config is OPTIONAL: without a base URL and a key we fail
 * with a `WorpNotConfiguredError` up-front and never open a socket, so
 * installs without worp still respond cleanly (503) rather than 500.
 *
 * The config is a runtime setting, not environment (#107): the base URL in
 * `app_settings`, the key and the proxy header map encrypted in
 * `encrypted_secrets`. That makes the unconfigured path the fresh-install
 * default rather than a rarity, which is why the gate is up-front and total.
 */
import { Effect } from "effect";
import { WorpIngestError, WorpNotConfiguredError } from "../errors";
import { createDebug } from "../util/debug";
import { Stores } from "../stores/contracts";
import { StoresLive } from "../stores/postgres";
import { runPromiseRethrow, tryAsync } from "../util/effect";
import { downloadAttachmentEffect, type DownloadedAttachment } from "./attachments";
// Imported as a module rather than through the barrel: these two readers
// return decrypted secrets and are deliberately absent from `index.ts`.
import { readWorpApiKeyEffect, readWorpExtraHeadersEffect } from "./encryptedSecrets";
import { getSettingEffect } from "./settings";
import { WORP_BASE_URL_SETTING } from "../worpConfig";

const debug = createDebug("service:sendToWorp");

export type WorpFlow = "personal" | "pro";

export interface SendToWorpArgs {
  accountId: string;
  gmailMessageId: string;
  attachmentId: string;
  flow: WorpFlow;
}

/**
 * worp's `UploadResult` is an opaque JSON body — we forward it verbatim to the
 * API caller rather than re-shape it, so worp remains the source of truth for
 * the ingest contract.
 */
export type WorpUploadResult = unknown;

export interface WorpConfig {
  baseUrl: string;
  apiKey: string;
  /**
   * Headers to add when reaching worp through a proxy, merged into the ingest
   * request after miel's own `Authorization`.
   *
   * Generic on purpose. Cloudflare Access — the case this started as — is not
   * worp config at all: CF validates its `CF-Access-Client-*` pair and strips
   * it at the edge, so worp only ever sees its own bearer. They are transport
   * headers for reaching a host behind a proxy, and CF Access is one proxy
   * among several (Authelia, oauth2-proxy, an mTLS gateway) a self-hoster
   * might use. One map covers all of them with no schema change (#107).
   *
   * Absent or empty when worp is reachable directly.
   */
  extraHeaders?: Record<string, string>;
}

/**
 * Read worp config from settings: the base URL from `app_settings`, the key
 * and the header map decrypted out of `encrypted_secrets` (#107).
 *
 * Async because the config now lives in Postgres. The one call site already
 * runs inside an Effect, so this is not a new seam.
 *
 * Returns null — meaning "worp is off" — unless both the base URL and the key
 * are set. The header map has no say in that: a proxy header set with no worp
 * behind it configures nothing, and worp reached directly needs no headers.
 */
export const readWorpConfigEffect = (): Effect.Effect<WorpConfig | null, never, Stores> =>
  Effect.gen(function* () {
    const [rawBaseUrl, apiKey, extraHeaders] = yield* Effect.all(
      [
        getSettingEffect(WORP_BASE_URL_SETTING).pipe(Effect.orElseSucceed(() => "")),
        readWorpApiKeyEffect(),
        readWorpExtraHeadersEffect(),
      ],
      { concurrency: "unbounded" },
    );
    const baseUrl = rawBaseUrl.trim();
    const trimmedKey = apiKey?.trim();
    if (!baseUrl || !trimmedKey) return null;
    return {
      baseUrl,
      apiKey: trimmedKey,
      ...(extraHeaders ? { extraHeaders } : {}),
    };
  });

export interface PostToWorpIngestArgs {
  config: WorpConfig;
  attachment: DownloadedAttachment;
  flow: WorpFlow;
  /** Injectable for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
}

/**
 * The wire step: build the multipart body, POST it, forward worp's JSON body
 * on success, surface a `WorpIngestError` (with worp's own body attached) on
 * any non-2xx.
 */
export async function postToWorpIngest(args: PostToWorpIngestArgs): Promise<WorpUploadResult> {
  const { config, attachment, flow, fetchImpl = fetch } = args;
  const url = `${config.baseUrl.replace(/\/+$/, "")}/api/ingest`;
  const form = new FormData();
  form.set("flow", flow);
  form.set("source", "miel");
  // Copy into a fresh ArrayBuffer so we don't hand Blob a Uint8Array whose
  // underlying buffer may be typed as SharedArrayBuffer under strict TS libs.
  const buf = new ArrayBuffer(attachment.data.byteLength);
  new Uint8Array(buf).set(attachment.data);
  const blob = new Blob([buf], {
    type: attachment.mimeType || "application/octet-stream",
  });
  // worp's ingest reads a multi-file field named `files` (plural) — a singular
  // `file` field yields `400 {"error":"no_files"}`. We send exactly one file.
  form.set("files", blob, attachment.filename || "attachment");

  // The headers the proxy in front of worp needs, then worp's own bearer auth
  // written last so it wins. Order matters: the settings route refuses to store
  // a reserved name, but a row predating that check — or written by hand — must
  // still not be able to replace the Authorization worp authenticates with.
  //
  // The proxy's headers are not worp's: a Cloudflare Access service token, for
  // instance, is validated and stripped by CF at the edge before the request
  // is forwarded, so worp still sees only its bearer. That is the reason this
  // is a generic map rather than named CF fields — any proxy's headers fit.
  const headers: Record<string, string> = {
    ...config.extraHeaders,
    Authorization: `Bearer ${config.apiKey}`,
  };

  const res = await fetchImpl(url, {
    method: "POST",
    headers,
    body: form,
  });

  const rawText = await res.text();

  // Cloudflare Access serves its login/interstitial page as an HTML 200 when a
  // request isn't authenticated. Without this guard that page would sail past
  // the `!res.ok` check below and get returned to the caller as a *successful*
  // ingest — a silent no-op. Detect it and fail loudly so a mis-set / expired
  // service token surfaces as an error instead of a fake success.
  const contentType = res.headers.get("content-type") ?? "";
  const looksLikeCfAccessLogin =
    (contentType.includes("text/html") || rawText.startsWith("<!DOCTYPE")) &&
    /cloudflareaccess\.com|Sign in ・ Cloudflare Access|cdn-cgi\/access/i.test(rawText);
  if (looksLikeCfAccessLogin) {
    throw new WorpIngestError({
      status: res.status,
      body: "cloudflare_access_login_page",
      message:
        "worp ingest was intercepted by Cloudflare Access (login page returned). " +
        "Check the CF-Access-Client-Id / CF-Access-Client-Secret headers under " +
        "Settings → Integrations → worp, and the worp Access policy's service-token rule.",
    });
  }

  let body: unknown = null;
  if (rawText.length > 0) {
    try {
      body = JSON.parse(rawText);
    } catch {
      body = rawText;
    }
  }

  if (!res.ok) {
    throw new WorpIngestError({
      status: res.status,
      body,
      message: `worp ingest failed with status ${res.status}`,
    });
  }
  return body;
}

export const sendToWorpEffect = (
  args: SendToWorpArgs,
): Effect.Effect<WorpUploadResult, Error, Stores> =>
  Effect.gen(function* () {
    const config = yield* readWorpConfigEffect();
    if (!config) {
      return yield* Effect.fail(new WorpNotConfiguredError());
    }
    debug.info("relay start", {
      flow: args.flow,
      gmailMessageId: args.gmailMessageId,
      attachmentId: args.attachmentId,
    });
    const attachment = yield* downloadAttachmentEffect({
      accountId: args.accountId,
      gmailMessageId: args.gmailMessageId,
      attachmentId: args.attachmentId,
    });
    const result = yield* tryAsync(() => postToWorpIngest({ config, attachment, flow: args.flow }));
    debug.info("relay ok", {
      filename: attachment.filename,
      size: attachment.size,
    });
    return result;
  });

export async function sendToWorp(args: SendToWorpArgs): Promise<WorpUploadResult> {
  return runPromiseRethrow(Effect.provide(sendToWorpEffect(args), StoresLive));
}
