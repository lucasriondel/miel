import { describe, it, expect } from "bun:test";
import { detectConfirmationCodes } from "./detectConfirmation";

const codesOf = (text: string) =>
  detectConfirmationCodes(null, text, null).codes.map((c) => c.value);

describe("detectConfirmationCodes", () => {
  describe("English", () => {
    it("detects a labelled code", () => {
      const result = detectConfirmationCodes(null, "Your verification code is 482913", null);
      expect(result.found).toBe(true);
      expect(result.codes[0].value).toBe("482913");
      expect(result.codes[0].type).toBe("otp");
    });

    it("detects OTP wording", () => {
      expect(codesOf("Your OTP is: 654321")).toContain("654321");
    });

    it("detects a code stated before the noun", () => {
      expect(codesOf("482913 is your GitHub verification code")).toContain("482913");
    });

    it("detects a 4-digit PIN", () => {
      expect(codesOf("Your PIN: 7890")).toContain("7890");
    });

    it("detects alphanumeric codes", () => {
      expect(codesOf("Your access code is A1B2C3")).toContain("A1B2C3");
    });
  });

  describe("French", () => {
    it("detects code de confirmation", () => {
      expect(codesOf("Votre code de confirmation : 482913")).toContain("482913");
    });

    it("detects an accented code de vérification", () => {
      expect(codesOf("Vérifiez votre compte. Code de vérification 771204")).toContain("771204");
    });
  });

  describe("German", () => {
    it("detects a compound Bestätigungscode", () => {
      expect(codesOf("Ihr Bestätigungscode lautet 482913")).toContain("482913");
    });

    it("detects Sicherheitscode with a colon", () => {
      expect(codesOf("Sicherheitscode: 771204 zur Anmeldung")).toContain("771204");
    });
  });

  describe("Spanish", () => {
    it("detects código de verificación", () => {
      expect(codesOf("El código de verificación es 482913")).toContain("482913");
    });

    it("detects clave de acceso", () => {
      expect(codesOf("Tu clave de acceso es 771204 para iniciar sesión")).toContain("771204");
    });
  });

  describe("Italian", () => {
    it("detects codice di verifica", () => {
      expect(codesOf("Il tuo codice di verifica è 482913")).toContain("482913");
    });

    it("detects codice di sicurezza", () => {
      expect(codesOf("Codice di sicurezza: 771204 per accedere")).toContain("771204");
    });
  });

  describe("links", () => {
    it("detects a magic link", () => {
      const result = detectConfirmationCodes(
        null,
        "Confirm your account: https://example.com/verify?token=abc123def456",
        null,
      );
      expect(result.codes.some((c) => c.type === "link")).toBe(true);
    });

    it("detects a localised confirmation link", () => {
      const result = detectConfirmationCodes(
        null,
        "Bestätigen Sie: https://example.de/konto/bestatigen/abc123",
        null,
      );
      expect(result.codes.some((c) => c.type === "link")).toBe(true);
    });
  });

  describe("rejects non-codes", () => {
    it("ignores an order number", () => {
      expect(
        detectConfirmationCodes(null, "Your order 482913 has shipped. Confirm delivery.", null)
          .found,
      ).toBe(false);
    });

    it("ignores a French invoice number", () => {
      expect(
        detectConfirmationCodes(
          null,
          "Votre facture 482913 est disponible. Connexion requise.",
          null,
        ).found,
      ).toBe(false);
    });

    it("ignores a bare account number", () => {
      expect(detectConfirmationCodes(null, "Your account number is 123456", null).found).toBe(
        false,
      );
    });

    it("ignores a year", () => {
      expect(
        detectConfirmationCodes(null, "Verify your account before 2026 to keep access", null).found,
      ).toBe(false);
    });

    it("ignores an unlabelled number in a verification mail", () => {
      expect(
        detectConfirmationCodes(
          null,
          "Please confirm your email. Some unrelated sentence. 482913 widgets sold.",
          null,
        ).found,
      ).toBe(false);
    });

    it("ignores repeated digits", () => {
      expect(detectConfirmationCodes(null, "Your code is 111111", null).found).toBe(false);
    });

    it("returns nothing without confirmation vocabulary", () => {
      expect(detectConfirmationCodes(null, "Lunch at 12:30?", null).found).toBe(false);
    });
  });

  describe("text handling", () => {
    it("strips HTML tags before detection", () => {
      const result = detectConfirmationCodes(
        null,
        null,
        "<p>Your code is <strong>555512</strong></p>",
      );
      expect(result.codes.map((c) => c.value)).toContain("555512");
    });

    it("ignores script and style contents", () => {
      const result = detectConfirmationCodes(
        null,
        null,
        "<style>.a{width:482913px}</style><p>Your code is 771204</p>",
      );
      expect(result.codes.map((c) => c.value)).toEqual(["771204"]);
    });

    it("deduplicates a repeated code", () => {
      const result = detectConfirmationCodes(
        null,
        "Verification code: 482913. Use this code: 482913",
        null,
      );
      expect(result.codes.filter((c) => c.value === "482913")).toHaveLength(1);
    });

    it("returns not-found on empty input", () => {
      expect(detectConfirmationCodes(null, null, null).found).toBe(false);
    });
  });
});
