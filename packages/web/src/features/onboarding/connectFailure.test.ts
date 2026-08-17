import { describe, expect, test } from "bun:test";
import {
  CONNECT_FAILURE_REASONS,
  connectFailureChannel,
  describeConnectFailure,
} from "./connectFailure";

const account = { id: "acc-1" };

describe("describeConnectFailure", () => {
  test("reads as a declined consent when the user said no at Google", () => {
    expect(describeConnectFailure("access_denied")).toMatch(/didn't grant|declin/i);
  });

  test("reads as an expired attempt when the flow state is gone", () => {
    expect(describeConnectFailure("state")).toMatch(/expire/i);
  });

  test("reads as a miel-side failure when the token exchange threw", () => {
    expect(describeConnectFailure("exchange")).toMatch(/couldn't finish/i);
  });

  test("gives the three reported cases distinguishable messages", () => {
    const messages = CONNECT_FAILURE_REASONS.map(describeConnectFailure);

    expect(new Set(messages).size).toBe(messages.length);
  });

  test("never shows the raw callback code to the user", () => {
    for (const reason of [
      ...CONNECT_FAILURE_REASONS,
      "temporarily_unavailable",
      "admin_policy_enforced",
      "<script>alert(1)</script>",
    ]) {
      expect(describeConnectFailure(reason)).not.toContain(reason);
    }
  });

  test("falls back to a plain message for a code we do not recognise", () => {
    const message = describeConnectFailure("interaction_required");

    expect(message).toMatch(/Google/);
    expect(message.length).toBeGreaterThan(0);
  });

  test("every message ends as a sentence, so it can stand alone in the dialog", () => {
    for (const reason of [...CONNECT_FAILURE_REASONS, "whatever"]) {
      expect(describeConnectFailure(reason)).toMatch(/\.$/);
    }
  });
});

describe("connectFailureChannel", () => {
  test("holds the failure while the account list is still loading", () => {
    // Reporting before the list settles would pick the wrong channel: a toast
    // raised now would be replaced a tick later by the gate opening over it.
    expect(connectFailureChannel({ isPending: true, isError: false, data: undefined })).toBe(
      "hold",
    );
  });

  test("routes to the gate on a settled, empty account list", () => {
    expect(connectFailureChannel({ isPending: false, isError: false, data: [] })).toBe("gate");
  });

  test("routes to a toast once at least one account is connected", () => {
    expect(connectFailureChannel({ isPending: false, isError: false, data: [account] })).toBe(
      "toast",
    );
  });

  test("routes to a toast when the account list itself failed to load", () => {
    // The gate stays shut in that case, so inline text would never be seen.
    expect(connectFailureChannel({ isPending: false, isError: true, data: undefined })).toBe(
      "toast",
    );
  });

  test("routes to the gate when a refetch fails over a known-empty list", () => {
    expect(connectFailureChannel({ isPending: false, isError: true, data: [] })).toBe("gate");
  });
});
