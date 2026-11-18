// Staging attachments: one file per upload, refused alone when it is over
// Gmail's limit, scoped to its account, and swept when no send spent it.
import { beforeEach, describe, expect, test } from "bun:test";

process.env.DATABASE_URL ??= "postgres://test:test@localhost/test";

import { MAX_ATTACHMENTS_BYTES } from "../composeLimits";
import { expectFailureTag, runExit } from "../testkit/runExit";
import { makeTestStores, type TestStores } from "../testkit/stores";
import { removeUploadEffect, uploadAttachmentEffect } from "./uploads";

const ACCOUNT = "11111111-1111-4111-8111-111111111111";
let stores: TestStores;

beforeEach(() => {
  stores = makeTestStores({ mailbox: { accounts: [{ id: ACCOUNT, email: "me@example.com" }] } });
});

describe("uploading an attachment", () => {
  test("answers its id and size, and keeps a filename safe to put in a header", async () => {
    const result = await stores.run(
      uploadAttachmentEffect({
        accountId: ACCOUNT,
        filename: "../../etc/Quote\r\nX.pdf",
        mimeType: "",
        data: new Uint8Array(10),
      }),
    );
    expect(result).toMatchObject({
      filename: "QuoteX.pdf",
      mimeType: "application/octet-stream",
      size: 10,
    });
    expect(stores.outbox.uploads).toHaveLength(1);
  });

  test("a file over Gmail's limit is refused on its own", async () => {
    const exit = await runExit(
      stores.provide(
        uploadAttachmentEffect({
          accountId: ACCOUNT,
          filename: "big.mov",
          mimeType: "video/quicktime",
          data: new Uint8Array(MAX_ATTACHMENTS_BYTES + 1),
        }),
      ),
    );
    expectFailureTag(exit, "ComposeRefusedError");
    expect(stores.outbox.uploads).toEqual([]);
  });

  test("an account that is not connected cannot upload", async () => {
    const exit = await runExit(
      stores.provide(
        uploadAttachmentEffect({
          accountId: "22222222-2222-4222-8222-222222222222",
          filename: "a",
          mimeType: "text/plain",
          data: new Uint8Array(1),
        }),
      ),
    );
    expectFailureTag(exit, "ComposeRefusedError");
  });

  test("removing a chip drops its upload; an unknown one is refused", async () => {
    const up = await stores.run(
      uploadAttachmentEffect({
        accountId: ACCOUNT,
        filename: "a",
        mimeType: "text/plain",
        data: new Uint8Array(1),
      }),
    );
    expect(await stores.run(removeUploadEffect({ accountId: ACCOUNT, id: up.id }))).toEqual({
      ok: true,
    });
    expectFailureTag(
      await runExit(stores.provide(removeUploadEffect({ accountId: ACCOUNT, id: up.id }))),
      "ComposeRefusedError",
    );
  });
});
