// The header-map rules, tested without a database because they are pure (#107).
//
// These matter more than the usual validator: the design accepts that a wrong
// header *value* is only caught when a relay runs, so the checks that can be
// made at save time are the only early warning there is.
import { describe, expect, test } from "bun:test";
import {
  CF_ACCESS_HEADERS,
  isReservedHeaderName,
  isValidHeaderName,
  mergeExtraHeaders,
  validateExtraHeaderPatch,
  validateExtraHeaders,
} from "./worpConfig";

describe("isValidHeaderName", () => {
  test("accepts ordinary header names", () => {
    expect(isValidHeaderName("X-Proxy-Token")).toBe(true);
    expect(isValidHeaderName("CF-Access-Client-Id")).toBe(true);
  });

  test("accepts the punctuation RFC 9110's token rule allows", () => {
    expect(isValidHeaderName("X-Weird_Header.Name~1")).toBe(true);
  });

  test("rejects names fetch would refuse — spaces, colons, empty", () => {
    expect(isValidHeaderName("Bad Header")).toBe(false);
    expect(isValidHeaderName("X-Proxy:")).toBe(false);
    expect(isValidHeaderName("")).toBe(false);
  });

  // A newline in a header name is header injection, not a typo.
  test("rejects a name containing a newline", () => {
    expect(isValidHeaderName("X-Proxy\r\nX-Injected")).toBe(false);
  });
});

describe("isReservedHeaderName", () => {
  test("reserves the headers miel sets itself", () => {
    expect(isReservedHeaderName("Authorization")).toBe(true);
    expect(isReservedHeaderName("Content-Type")).toBe(true);
  });

  // HTTP field names are case-insensitive, so the check has to be too —
  // otherwise `authorization` would slip past and displace worp's bearer.
  test("matches regardless of case", () => {
    expect(isReservedHeaderName("authorization")).toBe(true);
    expect(isReservedHeaderName("AUTHORIZATION")).toBe(true);
  });

  test("leaves a proxy's own headers alone", () => {
    for (const header of CF_ACCESS_HEADERS) {
      expect(isReservedHeaderName(header)).toBe(false);
    }
  });
});

describe("validateExtraHeaders", () => {
  test("accepts an empty map — no proxy headers is a legitimate state", () => {
    expect(validateExtraHeaders({})).toBeNull();
  });

  test("accepts a flat string-to-string map", () => {
    expect(validateExtraHeaders({ "X-A": "1", "X-B": "2" })).toBeNull();
  });

  test("rejects anything that is not a plain object", () => {
    expect(validateExtraHeaders(null)?.kind).toBe("not_an_object");
    expect(validateExtraHeaders([])?.kind).toBe("not_an_object");
    expect(validateExtraHeaders("X-A: 1")?.kind).toBe("not_an_object");
  });

  test("rejects a non-string value and names the header", () => {
    const problem = validateExtraHeaders({ "X-A": 1 });
    expect(problem).toEqual({ kind: "value_not_a_string", name: "X-A" });
  });

  test("rejects an invalid name and names it", () => {
    expect(validateExtraHeaders({ "Bad Header": "v" })).toEqual({
      kind: "invalid_name",
      name: "Bad Header",
    });
  });

  test("rejects a reserved name and names it", () => {
    expect(validateExtraHeaders({ Authorization: "Bearer x" })).toEqual({
      kind: "reserved_name",
      name: "Authorization",
    });
  });

  // The stored blob is the map itself, not a patch: a null there would reach
  // `fetch` as a header value and is a corrupt row, not an instruction.
  test("rejects a null value in a stored map", () => {
    expect(validateExtraHeaders({ "X-A": null })).toEqual({
      kind: "value_not_a_string",
      name: "X-A",
    });
  });
});

describe("validateExtraHeaderPatch", () => {
  // A patch names only the headers it changes, so null has to mean something:
  // it is how a header is removed without the caller re-sending the values of
  // the ones it is keeping — values the browser was never given (#119).
  test("accepts null as the removal instruction", () => {
    expect(validateExtraHeaderPatch({ "X-A": "1", "X-B": null })).toBeNull();
  });

  test("still refuses an invalid or reserved name, removal or not", () => {
    expect(validateExtraHeaderPatch({ "Bad Header": null })?.kind).toBe("invalid_name");
    expect(validateExtraHeaderPatch({ Authorization: null })?.kind).toBe("reserved_name");
  });

  test("still refuses a value that is neither a string nor null", () => {
    expect(validateExtraHeaderPatch({ "X-A": 1 })).toEqual({
      kind: "value_not_a_string",
      name: "X-A",
    });
  });

  test("rejects anything that is not a plain object", () => {
    expect(validateExtraHeaderPatch([])?.kind).toBe("not_an_object");
  });
});

describe("mergeExtraHeaders", () => {
  // The point of the whole patch shape: an editor that cannot see the stored
  // values can still remove one header and leave the rest untouched.
  test("leaves a header the patch does not name alone", () => {
    expect(mergeExtraHeaders({ "X-A": "1", "X-B": "2" }, { "X-B": null })).toEqual({ "X-A": "1" });
  });

  test("an empty patch changes nothing", () => {
    expect(mergeExtraHeaders({ "X-A": "1" }, {})).toEqual({ "X-A": "1" });
  });

  test("adds a header to nothing stored", () => {
    expect(mergeExtraHeaders(null, { "X-A": "1" })).toEqual({ "X-A": "1" });
  });

  test("removing every stored name leaves an empty map", () => {
    expect(mergeExtraHeaders({ "X-A": "1", "X-B": "2" }, { "X-A": null, "X-B": null })).toEqual({});
  });

  test("a new value replaces the stored one in place", () => {
    const merged = mergeExtraHeaders({ "X-A": "1", "X-B": "2" }, { "X-A": "9" });
    expect(merged).toEqual({ "X-A": "9", "X-B": "2" });
    // In place: the rows the user sees keep their order across a save.
    expect(Object.keys(merged)).toEqual(["X-A", "X-B"]);
  });

  // Field names are case-insensitive, so a re-spelled name has to replace the
  // stored entry rather than sit beside it — two entries would reach `fetch`
  // as one header with an arbitrary winner.
  test("a differently-cased name replaces the stored entry, keeping the new spelling", () => {
    expect(mergeExtraHeaders({ "X-A": "1" }, { "x-a": "9" })).toEqual({ "x-a": "9" });
  });

  test("a differently-cased null removes the stored entry", () => {
    expect(mergeExtraHeaders({ "X-A": "1" }, { "x-a": null })).toEqual({});
  });
});
