import { describe, expect, test } from "bun:test";
import type { GogMessageRawT } from "../schemas/gmail";
import { extractAttachments } from "./gmailPayload";

describe("extractAttachments", () => {
  test("returns empty list when the payload has no parts with attachmentId", () => {
    const msg: GogMessageRawT = {
      id: "m1",
      threadId: "t1",
      payload: {
        mimeType: "text/plain",
        body: { data: "aGVsbG8=" },
      },
    };
    expect(extractAttachments(msg)).toEqual([]);
  });

  test("collects {attachmentId, filename, mimeType, size} for each attachment part", () => {
    const msg: GogMessageRawT = {
      id: "m1",
      threadId: "t1",
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          { mimeType: "text/plain", body: { data: "aGVsbG8=" } },
          {
            mimeType: "application/pdf",
            filename: "report.pdf",
            body: { attachmentId: "att-1", size: 1234 },
          },
          {
            mimeType: "image/png",
            filename: "logo.png",
            body: { attachmentId: "att-2", size: 4096 },
          },
        ],
      },
    };
    expect(extractAttachments(msg)).toEqual([
      {
        attachmentId: "att-1",
        filename: "report.pdf",
        mimeType: "application/pdf",
        size: 1234,
      },
      {
        attachmentId: "att-2",
        filename: "logo.png",
        mimeType: "image/png",
        size: 4096,
      },
    ]);
  });

  test("walks nested parts (multipart/mixed > multipart/alternative > attachments)", () => {
    const msg: GogMessageRawT = {
      id: "m1",
      threadId: "t1",
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "multipart/alternative",
            parts: [
              { mimeType: "text/plain", body: { data: "aGk=" } },
              { mimeType: "text/html", body: { data: "PGI+aGk8L2I+" } },
            ],
          },
          {
            mimeType: "application/zip",
            filename: "bundle.zip",
            body: { attachmentId: "att-deep", size: 8888 },
          },
        ],
      },
    };
    const out = extractAttachments(msg);
    expect(out).toHaveLength(1);
    expect(out[0].attachmentId).toBe("att-deep");
    expect(out[0].filename).toBe("bundle.zip");
  });

  test("skips parts that have no attachmentId even if they have a filename (inline body)", () => {
    const msg: GogMessageRawT = {
      id: "m1",
      threadId: "t1",
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          {
            mimeType: "application/pdf",
            filename: "ghost.pdf",
            body: { data: "aGVsbG8=", size: 5 },
          },
        ],
      },
    };
    expect(extractAttachments(msg)).toEqual([]);
  });

  test("defaults missing filename/mimeType/size sensibly", () => {
    const msg: GogMessageRawT = {
      id: "m1",
      threadId: "t1",
      payload: {
        mimeType: "multipart/mixed",
        parts: [
          {
            // no filename, no mimeType
            body: { attachmentId: "att-bare" },
          },
        ],
      },
    };
    expect(extractAttachments(msg)).toEqual([
      {
        attachmentId: "att-bare",
        filename: "",
        mimeType: "application/octet-stream",
        size: 0,
      },
    ]);
  });
});
