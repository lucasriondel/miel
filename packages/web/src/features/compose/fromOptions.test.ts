import { describe, expect, test } from "bun:test";
import type { Account } from "../../api/types";
import { fromOptions, selectedFrom } from "./fromOptions";

const account = (id: string, email: string, nickname: string | null = null): Account => ({
  id,
  email,
  displayName: "Lucas Riondel",
  nickname,
  avatarUrl: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: null,
});

const PRO = account("acc-pro", "lucas@carrier.studio", "Lucas — Pro");
const PERSO = account("acc-perso", "lucas@example.com", "Lucas — Perso");

const alias = (email: string, verified = true) => ({
  email,
  displayName: "Lucas at Carrier",
  isPrimary: false,
  isDefault: false,
  verified,
});

describe("fromOptions", () => {
  test("a reply offers its own mailbox first, marked received here, then the others", () => {
    const options = fromOptions({
      kind: "reply",
      windowAccountId: PRO.id,
      accounts: [PERSO, PRO],
      aliases: [],
    });
    expect(options.map((o) => [o.name, o.email, o.note])).toEqual([
      ["Lucas — Pro", "lucas@carrier.studio", "received here"],
      ["Lucas — Perso", "lucas@example.com", null],
    ]);
  });

  test("verified aliases follow the mailbox; unverified ones and the primary itself do not", () => {
    const options = fromOptions({
      kind: "new",
      windowAccountId: PRO.id,
      accounts: [PRO],
      aliases: [
        { ...alias("lucas@carrier.studio"), isPrimary: true },
        alias("hello@carrier.studio"),
        alias("pending@carrier.studio", false),
      ],
    });
    expect(options.map((o) => [o.alias, o.email])).toEqual([
      [null, "lucas@carrier.studio"],
      ["hello@carrier.studio", "hello@carrier.studio"],
    ]);
  });

  test("a forward stays in the mailbox it arrived in", () => {
    const options = fromOptions({
      kind: "forward",
      windowAccountId: PRO.id,
      accounts: [PRO, PERSO],
      aliases: [],
    });
    expect(options.map((o) => o.accountId)).toEqual([PRO.id]);
  });

  test("the selection falls back to the mailbox when its alias is gone", () => {
    const options = fromOptions({
      kind: "new",
      windowAccountId: PRO.id,
      accounts: [PRO],
      aliases: [],
    });
    expect(selectedFrom(options, PRO.id, "gone@carrier.studio")?.email).toBe(
      "lucas@carrier.studio",
    );
  });
});
