import { describe, expect, test } from "bun:test";
import { stripRemoteImages, wrapMessageHtml } from "./htmlBody";

describe("wrapMessageHtml", () => {
  test("wraps body in a doctype'd document with base target=_blank", () => {
    const out = wrapMessageHtml("<p>Hi</p>");
    expect(out).toContain("<!doctype html>");
    expect(out).toContain('<base target="_blank">');
    expect(out).toContain("<body><p>Hi</p></body>");
  });

  test("injects baseline styles so the iframe doesn't render unstyled", () => {
    const out = wrapMessageHtml("");
    expect(out).toContain("font-family");
    expect(out).toContain("img, video { max-width: 100%");
  });
});

describe("stripRemoteImages", () => {
  test("rewrites http(s) image src to data-blocked-src", () => {
    const html = '<p><img src="https://tracker.example.com/pixel.gif" width="1"></p>';
    const out = stripRemoteImages(html);
    // The bare `src=` attribute must be gone (matches " src=" with a leading
    // word-break so we don't false-match the `-src=` tail of data-blocked-src).
    expect(/\ssrc=/.test(out)).toBe(false);
    expect(out).toContain('data-blocked-src="https://tracker.example.com/pixel.gif"');
    expect(out).toContain('style="display:none"');
  });

  test("leaves inline data: and cid: images alone", () => {
    const html = '<img src="data:image/png;base64,AAA"><img src="cid:logo@1">';
    const out = stripRemoteImages(html);
    expect(out).toContain('src="data:image/png;base64,AAA"');
    expect(out).toContain('src="cid:logo@1"');
    expect(out).not.toContain("data-blocked-src");
  });

  test("handles multiple images in one pass", () => {
    const html = '<img src="https://a.example.com/1.png"><img src="https://b.example.com/2.png">';
    const out = stripRemoteImages(html);
    expect(out.match(/data-blocked-src/g)?.length).toBe(2);
  });
});
