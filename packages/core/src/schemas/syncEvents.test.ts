// The one event whose name had to change (#127).
//
// `sync.claude_unavailable` was named when the only way an AI task could fail
// to start was a missing Claude Code token. Since #126 it fires for any
// provider — a keyless OpenAI included — so the name lied about what the client
// was being told.
//
// Renaming a name that travels over a socket means two schemas for one release,
// and this suite pins which is which: the server emits `SyncServerEvent`, whose
// union carries only the new name, and the client parses
// `ReceivedSyncServerEvent`, which additionally accepts the old literal from a
// server that has not been redeployed yet.
import { describe, expect, test } from "bun:test";
import {
  ReceivedSyncServerEvent,
  SyncClaudeUnavailableEventAlias,
  SyncProviderUnavailableEvent,
  SyncServerEvent,
} from "./syncEvents";

describe("the provider-unavailable event (#127)", () => {
  test("is emitted as sync.provider_unavailable, reason and all", () => {
    const parsed = SyncServerEvent.parse({
      type: "sync.provider_unavailable",
      reason: "ProviderNotRunnableError",
    });

    expect(parsed).toEqual({
      type: "sync.provider_unavailable",
      reason: "ProviderNotRunnableError",
    });
  });

  test("carries no account, since the credential and the provider pick are global", () => {
    expect(SyncProviderUnavailableEvent.parse({ type: "sync.provider_unavailable" })).toEqual({
      type: "sync.provider_unavailable",
    });
  });

  test("the old name is not something the server can still emit", () => {
    expect(SyncServerEvent.safeParse({ type: "sync.claude_unavailable" }).success).toBe(false);
  });

  // The compatibility half: a browser holding this release's bundle can be
  // talking to the previous release's API for as long as it takes the page to
  // reload, and the event it must not miss is the one that dismisses the hung
  // loaders.
  test("a client still accepts the old literal, reason intact", () => {
    const parsed = ReceivedSyncServerEvent.parse({
      type: "sync.claude_unavailable",
      reason: "ClaudeTokenMissingError",
    });

    expect(parsed).toEqual({
      type: "sync.claude_unavailable",
      reason: "ClaudeTokenMissingError",
    });
    expect(SyncClaudeUnavailableEventAlias.safeParse(parsed).success).toBe(true);
  });

  test("a client accepts the new name too, and everything else the server sends", () => {
    expect(ReceivedSyncServerEvent.safeParse({ type: "sync.provider_unavailable" }).success).toBe(
      true,
    );

    const serverNames = SyncServerEvent.options.map((o) => o.shape.type.value);
    const clientNames = new Set(ReceivedSyncServerEvent.options.map((o) => o.shape.type.value));

    expect(serverNames.filter((name) => !clientNames.has(name))).toEqual([]);
    expect(clientNames.has("sync.claude_unavailable")).toBe(true);
  });
});
