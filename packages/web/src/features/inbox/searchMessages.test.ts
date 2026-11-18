import { describe, expect, test } from "bun:test";
import { listedMessage } from "../../api/listedMessage.fixture";
import { searchMessages, searchWords } from "./searchMessages";

const ACME = listedMessage({
  gmailMessageId: "m-1",
  fromName: "Acme Billing",
  fromEmail: "billing@acme.example",
  subject: "Your invoice for March",
  snippet: "Amount due: €120",
});
const CAFE = listedMessage({
  gmailMessageId: "m-2",
  fromName: "Café Léon",
  fromEmail: "hello@cafe.example",
  subject: "Réservation confirmée",
  snippet: "À samedi",
});

describe("searchMessages", () => {
  test("an empty query keeps every message", () => {
    expect(searchMessages([ACME, CAFE], "   ")).toEqual([ACME, CAFE]);
  });

  test("every word has to match, in any field and any order", () => {
    expect(searchMessages([ACME, CAFE], "march acme")).toEqual([ACME]);
    expect(searchMessages([ACME, CAFE], "acme invoice april")).toEqual([]);
  });

  test("reads the address and the snippet too", () => {
    expect(searchMessages([ACME, CAFE], "billing@acme")).toEqual([ACME]);
    expect(searchMessages([ACME, CAFE], "amount due")).toEqual([ACME]);
  });

  test("ignores case and accents", () => {
    expect(searchMessages([ACME, CAFE], "CAFE reservation")).toEqual([CAFE]);
  });

  test("splits on any whitespace", () => {
    expect(searchWords("  acme\tinvoice  ")).toEqual(["acme", "invoice"]);
  });
});
