import { describe, expect, test } from "bun:test";
import { GOOGLE_SCOPES } from "@miel/core/googleScopes";
import {
  SCOPE_DISCLOSURES,
  documentedScopes,
  staleDisclosures,
  undocumentedScopes,
} from "./scopes";

/**
 * The only automated defence against the public disclosure drifting out of step
 * with what the app actually asks for. Both directions matter: a scope added to
 * the app but never documented, and a page still advertising access that was
 * removed.
 */
describe("scope disclosure vs. the canonical scope list", () => {
  test("documents every scope the app requests", () => {
    expect(undocumentedScopes()).toEqual([]);
  });

  test("documents nothing the app does not request", () => {
    expect(staleDisclosures()).toEqual([]);
  });

  test("has exactly one row per requested scope, in the canonical order", () => {
    expect(SCOPE_DISCLOSURES.map((row) => row.scope)).toEqual([...GOOGLE_SCOPES]);
  });

  test("takes its scope strings from the core export rather than restating them", () => {
    for (const scope of documentedScopes()) {
      expect(GOOGLE_SCOPES).toContain(scope as (typeof GOOGLE_SCOPES)[number]);
    }
  });
});

describe("disclosure copy", () => {
  test("every row names the permission, Google's wording, and the feature", () => {
    for (const row of SCOPE_DISCLOSURES) {
      expect(row.permission.length).toBeGreaterThan(0);
      expect(row.consentWording.length).toBeGreaterThan(0);
      expect(row.feature.length).toBeGreaterThan(0);
    }
  });

  test("reproduces Google's delete-mail phrasing on the mail-modify scope unsoftened", () => {
    const modify = SCOPE_DISCLOSURES.find((row) => row.scope.endsWith("gmail.modify"));
    expect(modify?.consentWording).toBe(
      "Read, compose, send, and permanently delete all your email from Gmail",
    );
  });

  test("explains the mail-modify scope by the features that need the whole of it", () => {
    const modify = SCOPE_DISCLOSURES.find((row) => row.scope.endsWith("gmail.modify"));
    expect(modify?.feature).toMatch(/triage/i);
    expect(modify?.feature).toMatch(/label/i);
    expect(modify?.feature).toMatch(/archive|trash/i);
  });

  test("ties sending, filters and the profile scopes to one feature each", () => {
    const byScope = new Map(SCOPE_DISCLOSURES.map((row) => [row.scope, row]));
    expect(byScope.get("https://www.googleapis.com/auth/gmail.send")?.feature).toMatch(
      /repl(y|ies)/i,
    );
    expect(byScope.get("https://www.googleapis.com/auth/gmail.settings.basic")?.feature).toMatch(
      /filter/i,
    );
    expect(byScope.get("https://www.googleapis.com/auth/userinfo.profile")?.feature).toMatch(
      /name|avatar/i,
    );
    expect(byScope.get("https://www.googleapis.com/auth/userinfo.email")?.feature).toMatch(
      /which account/i,
    );
  });

  test("permission names are unique, so no two rows read the same", () => {
    const names = SCOPE_DISCLOSURES.map((row) => row.permission);
    expect(new Set(names).size).toBe(names.length);
  });
});
