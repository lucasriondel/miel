import { describe, expect, test } from "bun:test";
import { CREDENTIAL_PROVIDERS } from "@miel/core/providerModels";
import { HOSTED_VENDOR_NAMES, LOCAL_PROVIDER_NAME } from "./vendors";

/**
 * The copy tests loop over {@link HOSTED_VENDOR_NAMES} and assert each name is
 * on the page. A loop over an empty list passes without asserting anything, so
 * the derivation is checked here before anything is checked against it.
 */
describe("the vendor names the copy is checked against", () => {
  test("has one entry per vendor core can hold a key for", () => {
    expect(HOSTED_VENDOR_NAMES).toHaveLength(CREDENTIAL_PROVIDERS.length);
    expect(HOSTED_VENDOR_NAMES.length).toBeGreaterThan(0);
  });

  test("names each one, so a missing label cannot pass as a satisfied assertion", () => {
    for (const name of HOSTED_VENDOR_NAMES) {
      expect(name.length).toBeGreaterThan(0);
    }
    expect(new Set(HOSTED_VENDOR_NAMES).size).toBe(HOSTED_VENDOR_NAMES.length);
  });

  test("keeps the local provider separate: it is a subprocess, not a vendor account", () => {
    expect(LOCAL_PROVIDER_NAME.length).toBeGreaterThan(0);
    expect(HOSTED_VENDOR_NAMES).not.toContain(LOCAL_PROVIDER_NAME);
  });
});
