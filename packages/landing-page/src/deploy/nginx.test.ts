import { describe, expect, test } from "bun:test";
import { locationFor, parseServer, valueOf, valuesOf } from "./nginx";

const CONF = `
# A comment, and a directive that only looks like one: # listen 8080;
server {
  listen 80;
  root /usr/share/nginx/html;
  absolute_redirect off;

  location = /app {
    return 301 /app/;
  }

  location /app/ {
    try_files $uri $uri/ /app/index.html;
  }

  location ^~ /static/ {
    expires 1y;
  }

  location ~* \\.(?:js|css)$ {
    expires 1y;
    add_header Cache-Control "public, immutable";
    try_files $uri =404;
  }

  location / {
    return 404;
  }
}
`;

const server = parseServer(CONF);

describe("parseServer", () => {
  test("reads the server's own directives and drops comments", () => {
    expect(valueOf(server, "listen")).toBe("80");
    expect(valueOf(server, "root")).toBe("/usr/share/nginx/html");
    expect(valueOf(server, "absolute_redirect")).toBe("off");
  });

  test("reports a directive nobody wrote as absent rather than empty", () => {
    expect(valueOf(server, "charset")).toBeUndefined();
  });

  test("keeps the locations in file order, with their modifiers", () => {
    expect(server.locations.map((location) => [location.modifier, location.pattern])).toEqual([
      ["=", "/app"],
      ["", "/app/"],
      ["^~", "/static/"],
      ["~*", "\\.(?:js|css)$"],
      ["", "/"],
    ]);
  });

  test("keeps a location's directives out of the server's own", () => {
    expect(valueOf(server, "return")).toBeUndefined();
    expect(valuesOf(server, "try_files")).toEqual([]);
  });

  test("collapses the whitespace a directive was lined up with", () => {
    const spaced = parseServer("server {\n  root    /srv;\n}");
    expect(valueOf(spaced, "root")).toBe("/srv");
  });

  test("reads every occurrence of a repeated directive", () => {
    const assets = locationFor(server, "/x.js");
    expect(valuesOf(assets!, "expires")).toEqual(["1y"]);
    expect(valueOf(assets!, "add_header")).toBe('Cache-Control "public, immutable"');
  });
});

describe("locationFor", () => {
  test("an exact match wins over the prefix that also covers the path", () => {
    expect(locationFor(server, "/app")?.modifier).toBe("=");
  });

  test("the longest prefix wins when several match", () => {
    expect(locationFor(server, "/app/settings")?.pattern).toBe("/app/");
  });

  test("a regex beats a prefix that matched first", () => {
    expect(locationFor(server, "/app/assets/index-a1b2.js")?.pattern).toBe("\\.(?:js|css)$");
  });

  test("the regex is case-insensitive when it was written that way", () => {
    expect(locationFor(server, "/app/assets/LOGO.CSS")?.pattern).toBe("\\.(?:js|css)$");
  });

  test("^~ on the winning prefix stops the regex from being tried", () => {
    expect(locationFor(server, "/static/app.js")?.pattern).toBe("/static/");
  });

  test("falls back to the catch-all when nothing more specific matches", () => {
    expect(locationFor(server, "/privacy")?.pattern).toBe("/");
    expect(valueOf(locationFor(server, "/privacy")!, "return")).toBe("404");
  });
});
