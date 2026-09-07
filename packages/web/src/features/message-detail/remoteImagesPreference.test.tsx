// Remote images load by default, and whether they do is a preference (#149).
//
// Rendered against the DOM harness rather than read as source: what changed is
// what a user sees on opening a message — a header that no longer asks a
// question already answered in Settings, and a body whose images are simply
// there. The preference's own storage is `features/preferences/remoteImages`'s
// suite; the row that writes it is `features/settings/remoteImagesRow`'s.
import { afterEach, describe, expect, test } from "bun:test";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { messageDetail } from "../../api/messageDetail.fixture";
import {
  REMOTE_IMAGES_STORAGE_KEY,
  writeRemoteImagesPreference,
} from "../preferences/remoteImages";
import { MessageDetailBody } from "./MessageDetailBody";

afterEach(() => localStorage.removeItem(REMOTE_IMAGES_STORAGE_KEY));

const REMOTE = '<p>rich body</p><img src="https://cdn.example.com/pixel.png">';
const INLINE = '<img src="data:image/png;base64,AAA"><img src="cid:logo@1">';

/** The document the body frame hands the iframe. */
const bodyDocument = (): string => {
  const frame = screen.getByTitle("message-body");
  return frame.getAttribute("srcdoc") ?? "";
};

/**
 * Whether the document actually asks the network for the tracking pixel. The
 * leading space matters: the blocked form keeps the URL under
 * `data-blocked-src=`, which `src="https://…"` matches as a substring.
 */
const loadsRemoteImage = () =>
  /\ssrc="https:\/\/cdn\.example\.com\/pixel\.png"/.test(bodyDocument());

const openMessage = (bodyHtml: string) => {
  render(<MessageDetailBody message={messageDetail({ bodyHtml })} />);
};

const toggle = () => screen.queryByRole("button", { name: /remote images/i });

describe("with the preference at its default", () => {
  test("a message's remote images are loaded with no interaction", () => {
    openMessage(REMOTE);

    expect(loadsRemoteImage()).toBe(true);
    expect(bodyDocument()).not.toContain("data-blocked-src");
  });

  test("the header offers no remote-images toggle", () => {
    openMessage(REMOTE);

    expect(toggle()).toBeNull();
  });
});

describe("with the preference set to hide", () => {
  test("images are stripped and the toggle is offered, as before", () => {
    writeRemoteImagesPreference("hide");
    openMessage(REMOTE);

    expect(bodyDocument()).toContain("data-blocked-src");
    expect(loadsRemoteImage()).toBe(false);
    expect(toggle()).toHaveProperty("textContent", "Show remote images");
  });

  test("the toggle still loads this message's images when pressed", () => {
    writeRemoteImagesPreference("hide");
    openMessage(REMOTE);

    fireEvent.click(toggle()!);

    expect(loadsRemoteImage()).toBe(true);
    expect(toggle()).toHaveProperty("textContent", "Hide remote images");
  });
});

describe("what the preference does not decide", () => {
  test("inline data: and cid: images render under either setting", () => {
    openMessage(INLINE);
    expect(bodyDocument()).toContain('src="data:image/png;base64,AAA"');
    expect(bodyDocument()).toContain('src="cid:logo@1"');

    act(() => writeRemoteImagesPreference("hide"));
    expect(bodyDocument()).toContain('src="data:image/png;base64,AAA"');
    expect(bodyDocument()).toContain('src="cid:logo@1"');
  });

  test("a message with no remote images never shows the toggle either way", () => {
    writeRemoteImagesPreference("hide");
    openMessage("<p>rich body</p>");

    expect(toggle()).toBeNull();
  });
});

describe("a preference changed while a message is open", () => {
  test("reaches the message body without a reload", () => {
    openMessage(REMOTE);
    expect(bodyDocument()).not.toContain("data-blocked-src");

    act(() => writeRemoteImagesPreference("hide"));

    expect(bodyDocument()).toContain("data-blocked-src");
    expect(toggle()).toHaveProperty("textContent", "Show remote images");
  });
});
