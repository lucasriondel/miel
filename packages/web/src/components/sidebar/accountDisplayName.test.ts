import { describe, expect, test } from "bun:test";
import { accountDisplayName } from "./accountDisplayName";

const base = { email: "lucas@example.com", displayName: "Lucas R", nickname: null };

describe("what a mailbox is called", () => {
  test("its nickname in miel first", () => {
    expect(accountDisplayName({ ...base, nickname: "Lucas — Pro" })).toBe("Lucas — Pro");
  });

  test("then its Google name", () => {
    expect(accountDisplayName(base)).toBe("Lucas R");
  });

  test("then the address's local part", () => {
    expect(accountDisplayName({ ...base, displayName: null })).toBe("lucas");
  });

  test("a blank nickname is no nickname", () => {
    expect(accountDisplayName({ ...base, nickname: "  " })).toBe("Lucas R");
  });
});
