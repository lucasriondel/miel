import { expect, test, describe } from "bun:test";
import { buildGmailMessageUrl } from "./gmailUrl";

describe("buildGmailMessageUrl", () => {
  test("uses the account email as authuser and the message id under #all/", () => {
    expect(
      buildGmailMessageUrl({
        accountEmail: "alice@example.com",
        gmailMessageId: "18a1b2c3d4",
      }),
    ).toBe("https://mail.google.com/mail/?authuser=alice%40example.com#all/18a1b2c3d4");
  });

  test("encodes special characters in the account email", () => {
    expect(
      buildGmailMessageUrl({
        accountEmail: "first+last@example.com",
        gmailMessageId: "msg-1",
      }),
    ).toBe("https://mail.google.com/mail/?authuser=first%2Blast%40example.com#all/msg-1");
  });

  test("encodes the gmail message id segment", () => {
    expect(
      buildGmailMessageUrl({
        accountEmail: "a@b.com",
        gmailMessageId: "id/with slashes",
      }),
    ).toBe("https://mail.google.com/mail/?authuser=a%40b.com#all/id%2Fwith%20slashes");
  });
});
