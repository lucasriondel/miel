import { describe, expect, test } from "bun:test";
import { findExternalReferences, staticizeHtml } from "./staticize";

describe("staticizeHtml", () => {
  test("drops module scripts emitted by the client build", () => {
    const html = `<html><body><h1>Miel</h1><script type="module" src="/_build/assets/client.js"></script></body></html>`;
    expect(staticizeHtml(html)).toBe(`<html><body><h1>Miel</h1></body></html>`);
  });

  test("drops inline scripts, including hydration payloads", () => {
    const html = `<html><head><script>window.__TSS__={a:1}</script></head><body>hi</body></html>`;
    expect(staticizeHtml(html)).toBe(`<html><head></head><body>hi</body></html>`);
  });

  test("drops modulepreload and preload links", () => {
    const html = `<head><link rel="modulepreload" href="/a.js"><link rel="preload" href="/b.js" as="script"></head>`;
    expect(staticizeHtml(html)).toBe(`<head></head>`);
  });

  test("inlines a local stylesheet into a style element", () => {
    const html = `<head><link rel="stylesheet" href="/_build/assets/app.css"></head>`;
    const out = staticizeHtml(html, (url) =>
      url === "/_build/assets/app.css" ? "body{color:red}" : null,
    );
    expect(out).toBe(`<head><style>body{color:red}</style></head>`);
  });

  test("throws rather than silently dropping a stylesheet it cannot read", () => {
    const html = `<head><link rel="stylesheet" href="/missing.css"></head>`;
    expect(() => staticizeHtml(html, () => null)).toThrow(/missing\.css/);
  });

  test("keeps hand-written style elements and page content untouched", () => {
    const html = `<html><head><style>:root{color-scheme:light dark}</style></head><body><main><h1>Miel</h1></main></body></html>`;
    expect(staticizeHtml(html)).toBe(html);
  });

  test("leaves mailto and https anchors alone", () => {
    const html = `<p><a href="mailto:a@b.com">mail</a><a href="https://github.com/x/y">repo</a></p>`;
    expect(staticizeHtml(html)).toBe(html);
  });
});

describe("findExternalReferences", () => {
  test("finds nothing in a self-contained page", () => {
    const html = `<html><head><style>body{margin:0}</style></head><body><a href="https://github.com/x/y">repo</a><a href="mailto:a@b.com">mail</a></body></html>`;
    expect(findExternalReferences(html)).toEqual([]);
  });

  test("reports scripts, stylesheets, fonts and images", () => {
    const html = [
      `<script src="/app.js"></script>`,
      `<link rel="stylesheet" href="/app.css">`,
      `<link rel="preconnect" href="https://fonts.googleapis.com">`,
      `<img src="/logo.png" alt="">`,
    ].join("");
    expect(findExternalReferences(html)).toEqual([
      "/app.js",
      "/app.css",
      "https://fonts.googleapis.com",
      "/logo.png",
    ]);
  });

  test("reports inline scripts too, since they need JavaScript to run", () => {
    expect(findExternalReferences(`<script>alert(1)</script>`)).toEqual(["<inline script>"]);
  });

  test("reports a font or image a style element would fetch", () => {
    const html = `<head><style>@font-face{font-family:X;src:url("https://fonts.gstatic.com/x.woff2")}body{background:url(/hero.png)}</style></head>`;
    expect(findExternalReferences(html)).toEqual([
      "https://fonts.gstatic.com/x.woff2",
      "/hero.png",
    ]);
  });

  test("reports a stylesheet pulled in by an @import rule", () => {
    const html = `<style>@import "https://example.com/a.css";</style>`;
    expect(findExternalReferences(html)).toEqual(["https://example.com/a.css"]);
  });

  test("reports a url() in a style attribute", () => {
    const html = `<div style="background-image:url('/bg.svg')"></div>`;
    expect(findExternalReferences(html)).toEqual(["/bg.svg"]);
  });

  test("ignores data: URIs, which the browser never fetches", () => {
    const html = `<style>body{background:url(data:image/gif;base64,R0lGOD)}</style>`;
    expect(findExternalReferences(html)).toEqual([]);
  });
});
