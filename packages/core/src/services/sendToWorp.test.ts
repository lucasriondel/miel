// Service tests for sendToWorp. Since #107 the config is a runtime setting, so
// what stands in for `process.env` is a pair of seeded in-memory stores (#132):
// the base URL in `app_settings`, the key and the proxy header map encrypted in
// `encrypted_secrets`, both read through the real services. `./attachments` is
// still mocked so the DB/Gmail path never runs.
//
// That leaves us verifying: (a) config-missing → WorpNotConfiguredError before
// any download attempt, for each half of the gate independently; (b)
// postToWorpIngest builds the FormData with the exact fields worp expects and
// forwards worp's success body verbatim; (c) the proxy header map reaches the
// wire and cannot displace worp's own Authorization; (d) worp's non-2xx
// surfaces as WorpIngestError with the upstream body attached.
import { beforeEach, describe, expect, mock, test } from "bun:test";
import { Effect } from "effect";
import { runExit, expectFailureTag } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import type { DownloadedAttachment } from "./attachments";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";
// A real 32-byte key, so the seeded secret rows are genuinely ciphertext and
// the service decrypts them the way it would decrypt a Postgres row.
process.env.TOKEN_ENCRYPTION_KEY = Buffer.from("k".repeat(32), "utf8").toString("base64");

const { WORP_API_KEY_SECRET, WORP_BASE_URL_SETTING, WORP_EXTRA_HEADERS_SECRET } =
  await import("../worpConfig");
const { encrypt } = await import("../util/crypto");

/** The config this install has stored, as the two stores hold it. */
const seed = (
  stored: { baseUrl?: string; apiKey?: string; headers?: Record<string, string> } = {},
): TestStores =>
  makeTestStores({
    settings: stored.baseUrl === undefined ? {} : { [WORP_BASE_URL_SETTING]: stored.baseUrl },
    secrets: {
      ...(stored.apiKey === undefined ? {} : { [WORP_API_KEY_SECRET]: encrypt(stored.apiKey) }),
      ...(stored.headers === undefined
        ? {}
        : { [WORP_EXTRA_HEADERS_SECRET]: encrypt(JSON.stringify(stored.headers)) }),
    },
  });

/** Both halves set — the configured relay every gating test varies from. */
const CONFIGURED = { baseUrl: "https://worp.local", apiKey: "sekret-Zx91qWertyuiop3f9" };
let stores: TestStores;

/** A `fetch` stand-in that answers every call with the one response given. */
const respondWith = (response: Response) => async (): Promise<Response> => response;

const attachmentBytes = new Uint8Array([1, 2, 3, 4, 5]);
const attachmentToReturn: DownloadedAttachment = {
  data: attachmentBytes,
  filename: "invoice.pdf",
  mimeType: "application/pdf",
  size: attachmentBytes.byteLength,
};

let downloadCalls: unknown[] = [];
mock.module("./attachments", () => ({
  downloadAttachment: async (args: unknown) => {
    downloadCalls.push(args);
    return attachmentToReturn;
  },
  downloadAttachmentEffect: (args: unknown) => {
    downloadCalls.push(args);
    return Effect.succeed(attachmentToReturn);
  },
}));

const { sendToWorpEffect, postToWorpIngest, readWorpConfigEffect } = await import("./sendToWorp");

describe("sendToWorp — config gating", () => {
  const relay = () =>
    stores.provide(
      sendToWorpEffect({
        accountId: "a",
        gmailMessageId: "m",
        attachmentId: "x",
        flow: "personal",
      }),
    );

  beforeEach(() => {
    downloadCalls = [];
    stores = seed(CONFIGURED);
  });

  test("fails WorpNotConfiguredError when the base URL setting is empty", async () => {
    stores = seed({ ...CONFIGURED, baseUrl: "" });
    expectFailureTag(await runExit(relay()), "WorpNotConfiguredError");
    expect(downloadCalls.length).toBe(0);
  });

  test("fails WorpNotConfiguredError when no API key is stored", async () => {
    stores = seed({ baseUrl: CONFIGURED.baseUrl });
    expectFailureTag(await runExit(relay()), "WorpNotConfiguredError");
    expect(downloadCalls.length).toBe(0);
  });

  // The empty-config path is the fresh-install default now that nothing is read
  // from the environment, so "neither half set" is the case most installs hit.
  test("fails WorpNotConfiguredError when nothing is configured at all", async () => {
    stores = seed();
    expectFailureTag(await runExit(relay()), "WorpNotConfiguredError");
    expect(downloadCalls.length).toBe(0);
  });

  // Proxy headers configure nothing on their own: a header map with no worp
  // behind it must not read as "worp is on".
  test("fails WorpNotConfiguredError when only proxy headers are stored", async () => {
    stores = seed({ headers: { "CF-Access-Client-Id": "cf-id" } });
    expectFailureTag(await runExit(relay()), "WorpNotConfiguredError");
    expect(downloadCalls.length).toBe(0);
  });

  // The settings path assembled: both stores read, both halves present, the
  // proxy header map carried through. Asserted on the config rather than by
  // running the relay, because past the gate `sendToWorpEffect` reaches the
  // attachments service and there is no fetch seam of its own to intercept —
  // what the headers then do on the wire is `postToWorpIngest`'s contract,
  // covered below against its injectable `fetchImpl`.
  test("assembles the config from both stores when everything is set", async () => {
    stores = seed({ ...CONFIGURED, headers: { "CF-Access-Client-Id": "cf-id" } });
    const config = await stores.run(readWorpConfigEffect());
    expect(config).toEqual({
      ...CONFIGURED,
      extraHeaders: { "CF-Access-Client-Id": "cf-id" },
    });
  });

  // Absent rather than an empty object: the relay spreads this, and an empty
  // map and no map have to mean the same thing.
  test("omits extraHeaders entirely when no proxy headers are stored", async () => {
    const config = await stores.run(readWorpConfigEffect());
    expect(config).toEqual(CONFIGURED);
  });
});

describe("postToWorpIngest", () => {
  test("POSTs FormData with flow, source=miel, and the file to /api/ingest", async () => {
    let captured: { url: string | URL; init: RequestInit | undefined } | null = null;
    const fetchImpl = async (url: string | URL, init?: RequestInit): Promise<Response> => {
      captured = { url, init };
      return new Response(JSON.stringify({ ok: true, invoiceId: "abc123" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const result = await postToWorpIngest({
      config: { baseUrl: "https://worp.local/", apiKey: "sekret" },
      attachment: attachmentToReturn,
      flow: "personal",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toEqual({ ok: true, invoiceId: "abc123" });
    expect(captured).not.toBeNull();
    const cap = captured!;
    expect(String(cap.url)).toBe("https://worp.local/api/ingest");
    expect(cap.init?.method).toBe("POST");
    const headers = cap.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sekret");
    const form = cap.init?.body as FormData;
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("flow")).toBe("personal");
    expect(form.get("source")).toBe("miel");
    const file = form.get("files");
    expect(file).toBeInstanceOf(Blob);
    const fileBlob = file as File;
    expect(fileBlob.name).toBe("invoice.pdf");
    expect(fileBlob.type).toBe("application/pdf");
    expect(fileBlob.size).toBe(attachmentBytes.byteLength);
  });

  /** Run one ingest against a capturing fetch and hand back the sent headers. */
  const headersSentFor = async (config: {
    baseUrl: string;
    apiKey: string;
    extraHeaders?: Record<string, string>;
  }): Promise<Record<string, string>> => {
    let captured: RequestInit | undefined;
    const fetchImpl = async (_url: string | URL, init?: RequestInit): Promise<Response> => {
      captured = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };
    await postToWorpIngest({
      config,
      attachment: attachmentToReturn,
      flow: "personal",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    return captured?.headers as Record<string, string>;
  };

  // CF Access is stored as an ordinary entry in the header map rather than as
  // named config, because CF validates and strips these at the edge — they are
  // transport headers for a proxy, not worp credentials (#107).
  test("sends the CF Access service token when it is in the header map", async () => {
    const headers = await headersSentFor({
      baseUrl: "https://worp.local",
      apiKey: "sekret",
      extraHeaders: {
        "CF-Access-Client-Id": "cf-id",
        "CF-Access-Client-Secret": "cf-secret",
      },
    });

    expect(headers.Authorization).toBe("Bearer sekret");
    expect(headers["CF-Access-Client-Id"]).toBe("cf-id");
    expect(headers["CF-Access-Client-Secret"]).toBe("cf-secret");
  });

  // The point of the generic map: a proxy that is not Cloudflare needs no code
  // change and no new columns.
  test("sends an arbitrary proxy header, not just the CF pair", async () => {
    const headers = await headersSentFor({
      baseUrl: "https://worp.local",
      apiKey: "sekret",
      extraHeaders: { "X-Authelia-Token": "abc", "X-Shared-Secret": "def" },
    });

    expect(headers["X-Authelia-Token"]).toBe("abc");
    expect(headers["X-Shared-Secret"]).toBe("def");
  });

  test("sends only Authorization when no proxy headers are configured", async () => {
    const headers = await headersSentFor({ baseUrl: "https://worp.local", apiKey: "sekret" });

    expect(headers.Authorization).toBe("Bearer sekret");
    expect(Object.keys(headers)).toEqual(["Authorization"]);
  });

  // Defence in depth. The settings route refuses to store a reserved name, so
  // this map should be unreachable through the UI — but a row written before
  // that check existed, or by hand, must still not be able to swap out the
  // credential worp authenticates the relay with.
  test("a header map entry cannot displace worp's own Authorization", async () => {
    const headers = await headersSentFor({
      baseUrl: "https://worp.local",
      apiKey: "sekret",
      extraHeaders: { Authorization: "Bearer attacker" },
    });

    expect(headers.Authorization).toBe("Bearer sekret");
  });

  test("fails WorpIngestError when Cloudflare Access returns its login page as HTML 200", async () => {
    const cfLoginHtml =
      "<!DOCTYPE html>\n<html><head><title>Sign in ・ Cloudflare Access</title></head>" +
      "<body>example-team.cloudflareaccess.com</body></html>";
    const fetchImpl = async (): Promise<Response> =>
      new Response(cfLoginHtml, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });

    let thrown: unknown = null;
    try {
      await postToWorpIngest({
        config: { baseUrl: "https://worp.local", apiKey: "sekret" },
        attachment: attachmentToReturn,
        flow: "pro",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).not.toBeNull();
    const err = thrown as { _tag?: string; body?: unknown };
    expect(err._tag).toBe("WorpIngestError");
    expect(err.body).toBe("cloudflare_access_login_page");
  });

  test("surfaces WorpIngestError with upstream status + JSON body on non-2xx", async () => {
    const fetchImpl = respondWith(
      new Response(JSON.stringify({ error: "bad_pdf" }), {
        status: 422,
        headers: { "Content-Type": "application/json" },
      }),
    );

    let thrown: unknown = null;
    try {
      await postToWorpIngest({
        config: { baseUrl: "https://worp.local", apiKey: "sekret" },
        attachment: attachmentToReturn,
        flow: "pro",
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
    } catch (e) {
      thrown = e;
    }

    expect(thrown).not.toBeNull();
    const err = thrown as { _tag?: string; status?: number; body?: unknown };
    expect(err._tag).toBe("WorpIngestError");
    expect(err.status).toBe(422);
    expect(err.body).toEqual({ error: "bad_pdf" });
  });
});
