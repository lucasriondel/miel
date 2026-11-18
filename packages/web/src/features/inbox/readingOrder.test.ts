import { expect, test } from "bun:test";
import { listedMessage } from "../../api/listedMessage.fixture";
import { readingOrder } from "./readingOrder";

test("walks priorities high to untriaged, category by category within each", () => {
  const low = listedMessage({ gmailMessageId: "low", priority: "low" });
  const highPromo = listedMessage({
    gmailMessageId: "high-promo",
    priority: "high",
    labels: [
      {
        id: "l",
        name: "CATEGORY_PROMOTIONS",
        gmailLabelId: "CATEGORY_PROMOTIONS",
        colorBg: null,
        colorFg: null,
      },
    ],
  });
  const highPrimary = listedMessage({ gmailMessageId: "high-primary", priority: "high" });
  const untriaged = listedMessage({ gmailMessageId: "none", priority: null });
  expect(
    readingOrder([untriaged, low, highPromo, highPrimary]).map((m) => m.gmailMessageId),
  ).toEqual(["high-primary", "high-promo", "low", "none"]);
});
