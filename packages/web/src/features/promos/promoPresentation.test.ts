import { describe, expect, test } from "bun:test";
import {
  MONOGRAM_TONES,
  monogramInitials,
  monogramTone,
  promoMerchant,
  shopDomain,
} from "./promoPresentation";

describe("the merchant's monogram", () => {
  test("takes the first letter of up to two words", () => {
    expect(monogramInitials("Calvin Klein")).toBe("CK");
    expect(monogramInitials("Aroma-Zone")).toBe("AZ");
    expect(monogramInitials("KoRo")).toBe("K");
  });

  test("skips words that do not name the shop", () => {
    expect(monogramInitials("Le Slip Français")).toBe("SF");
  });

  test("marks an unnamed sender without inventing a name", () => {
    expect(monogramInitials(null)).toBe("?");
  });

  test("gives a shop the same colour every time", () => {
    expect(monogramTone("Zara")).toBe(monogramTone("zara"));
    expect(MONOGRAM_TONES).toContain(monogramTone("Uniqlo"));
  });
});

describe("who a promo is from", () => {
  test("is the extracted merchant, else the sender's name", () => {
    expect(promoMerchant({ merchant: "Zara", fromName: "Zara News" })).toBe("Zara");
    expect(promoMerchant({ merchant: null, fromName: "Zara News" })).toBe("Zara News");
    expect(promoMerchant({ merchant: null, fromName: null })).toBeNull();
  });
});

describe("the shop's site", () => {
  test("drops the mailing subdomain", () => {
    expect(shopDomain("news@e.calvinklein.fr")).toBe("calvinklein.fr");
  });

  test("keeps a country registry's second level", () => {
    expect(shopDomain("hello@mail.shop.co.uk")).toBe("shop.co.uk");
  });

  test("is nothing when there is no address to read", () => {
    expect(shopDomain(null)).toBeNull();
    expect(shopDomain("not-an-address")).toBeNull();
  });
});
