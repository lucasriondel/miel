// Unit tests for the gog reauth paste-back validation. Pure functions, no
// process spawn or DB needed. Run: bun test src/adapters/pasteBackSession.test.ts
import { expect, test, describe } from "bun:test";
import { extractState, validatePastedRedirect } from "./pasteBackSession";

const STATE = "PU2vazIXORSkki99b0kKm_XdTNAKfkYYWm69suXxxU0";
const printedUrl = `https://accounts.google.com/o/oauth2/auth?client_id=x&redirect_uri=http%3A%2F%2Flocalhost%3A1&state=${STATE}`;
const goodRedirect = `http://localhost:1/?state=${STATE}&code=4/0AeoWuM_abc&scope=email`;

describe("extractState", () => {
  test("pulls state from the printed auth URL", () => {
    expect(extractState(printedUrl)).toBe(STATE);
  });

  test("pulls state from the pasted redirect (state first param)", () => {
    expect(extractState(goodRedirect)).toBe(STATE);
  });

  test("url-decodes the state value", () => {
    expect(extractState("http://x/?state=a%2Bb%3Dc&code=1")).toBe("a+b=c");
  });

  test("returns undefined when no state present", () => {
    expect(extractState("http://localhost:1/?code=abc")).toBeUndefined();
  });
});

describe("validatePastedRedirect", () => {
  test("accepts a matching state with a code", () => {
    expect(validatePastedRedirect(goodRedirect, STATE)).toBeNull();
  });

  test("tolerates surrounding whitespace", () => {
    expect(validatePastedRedirect(`  ${goodRedirect}\n`, STATE)).toBeNull();
  });

  test("rejects a redirect from a different login attempt (state mismatch)", () => {
    const other = `http://localhost:1/?state=DIFFERENT&code=4/0AeoWuM_abc`;
    expect(validatePastedRedirect(other, STATE)).toBe("state_mismatch");
  });

  test("rejects a redirect missing a code", () => {
    const noCode = `http://localhost:1/?state=${STATE}&scope=email`;
    expect(validatePastedRedirect(noCode, STATE)).toBe("no_code_in_url");
  });

  test("rejects when the user pasted something that isn't a redirect URL", () => {
    expect(validatePastedRedirect("not a url at all", STATE)).toBe(
      "no_code_in_url",
    );
  });

  test("surfaces a Google-side OAuth error before anything else", () => {
    const denied = `http://localhost:1/?error=access_denied&state=${STATE}`;
    expect(validatePastedRedirect(denied, STATE)).toBe(
      "oauth_error:access_denied",
    );
  });
});
