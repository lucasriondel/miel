import { describe, expect, test } from "bun:test";
import { messageDetail } from "../../api/messageDetail.fixture";
import { replyFields, type ComposeFields } from "../compose/composeSession";
import { replyModeOptions, switchReplyMode } from "./replyModeSwitch";

// The mode chip (Compose & Reply › "Switching mode inside the window") changes
// what was prefilled, never what was typed. These pin that rule field by field.

const MESSAGE = messageDetail({
  accountId: "acc-1",
  fromEmail: "claire@example.com",
  fromName: "Claire Martin",
  subject: "Dinner Saturday?",
  replyAllCc: ["samy@example.com", "nathalie@example.com"],
});

const opened = (mode: "reply" | "replyAll" | "forward", over: Partial<ComposeFields> = {}) => ({
  ...replyFields(MESSAGE, mode),
  ...over,
});

describe("switchReplyMode", () => {
  test("Reply all adds the other participants to Cc and opens its row", () => {
    const next = switchReplyMode(MESSAGE, "reply", "replyAll", opened("reply"));
    expect(next.to).toEqual(["claire@example.com"]);
    expect(next.cc).toEqual(["samy@example.com", "nathalie@example.com"]);
    expect(next.showCc).toBe(true);
    expect(next.subject).toBe("Re: Dinner Saturday?");
  });

  test("Forward empties To and Cc and swaps Re: for Fwd:", () => {
    const next = switchReplyMode(MESSAGE, "replyAll", "forward", opened("replyAll"));
    expect(next.to).toEqual([]);
    expect(next.cc).toEqual([]);
    expect(next.showCc).toBe(false);
    expect(next.subject).toBe("Fwd: Dinner Saturday?");
  });

  test("back to Reply from Forward readdresses the sender", () => {
    const next = switchReplyMode(MESSAGE, "forward", "reply", opened("forward"));
    expect(next.to).toEqual(["claire@example.com"]);
    expect(next.subject).toBe("Re: Dinner Saturday?");
  });

  test("a typed body, instruction and files survive every switch", () => {
    const typed = opened("reply", { body: "Count me in.", prompt: "say yes", quotedText: "> 8pm" });
    const there = switchReplyMode(MESSAGE, "reply", "forward", typed);
    const back = switchReplyMode(MESSAGE, "forward", "reply", there);
    expect(back.body).toBe("Count me in.");
    expect(back.prompt).toBe("say yes");
    expect(back.quotedText).toBe("> 8pm");
  });

  test("an address the user added is kept; only the mode's own are replaced", () => {
    const fields = opened("replyAll", {
      to: ["claire@example.com", "Paul <paul@example.com>"],
      bcc: ["me@example.com"],
    });
    const forward = switchReplyMode(MESSAGE, "replyAll", "forward", fields);
    expect(forward.to).toEqual(["Paul <paul@example.com>"]);
    expect(forward.cc).toEqual([]);
    expect(forward.bcc).toEqual(["me@example.com"]);
    const reply = switchReplyMode(MESSAGE, "forward", "reply", forward);
    expect(reply.to).toEqual(["claire@example.com", "Paul <paul@example.com>"]);
  });

  test("a default the user removed stays removed when the next mode would add it back", () => {
    const fields = opened("replyAll", { cc: ["samy@example.com"] });
    const reply = switchReplyMode(MESSAGE, "replyAll", "reply", fields);
    expect(reply.cc).toEqual([]);
    const all = switchReplyMode(MESSAGE, "reply", "replyAll", opened("reply", { to: [] }));
    expect(all.to).toEqual([]);
    expect(all.cc).toEqual(["samy@example.com", "nathalie@example.com"]);
  });

  test("no address lands twice: one the user typed is not added again as a default", () => {
    const fields = opened("reply", { to: ["claire@example.com", "SAMY@example.com"] });
    const next = switchReplyMode(MESSAGE, "reply", "replyAll", fields);
    expect(next.to).toEqual(["claire@example.com", "SAMY@example.com"]);
    expect(next.cc).toEqual(["nathalie@example.com"]);
  });

  test("an edited subject is the user's and is kept as typed", () => {
    const fields = opened("reply", { subject: "Re: Dinner — Saturday 8pm" });
    expect(switchReplyMode(MESSAGE, "reply", "forward", fields).subject).toBe(
      "Re: Dinner — Saturday 8pm",
    );
  });

  test("a Cc row the user opened stays open when Cc empties", () => {
    const fields = opened("reply", { showCc: true });
    expect(switchReplyMode(MESSAGE, "reply", "forward", fields).showCc).toBe(true);
    const plain = switchReplyMode(MESSAGE, "reply", "replyAll", opened("reply"));
    expect(switchReplyMode(MESSAGE, "replyAll", "reply", plain).showCc).toBe(false);
  });

  test("Forward comes back to the mailbox the original arrived in; an own alias is kept", () => {
    const elsewhere = opened("reply", { fromAccountId: "acc-2", fromAlias: null });
    const forward = switchReplyMode(MESSAGE, "reply", "forward", elsewhere);
    expect(forward.fromAccountId).toBe("acc-1");
    const alias = opened("reply", { fromAlias: "hello@carrier.studio" });
    expect(switchReplyMode(MESSAGE, "reply", "forward", alias).fromAlias).toBe(
      "hello@carrier.studio",
    );
    expect(switchReplyMode(MESSAGE, "reply", "replyAll", elsewhere).fromAccountId).toBe("acc-2");
  });

  test("the draft, the files and a forward's removed originals are kept", () => {
    const fields = opened("forward", { draftId: "d-1", droppedAttachmentIds: ["att-2"] });
    const next = switchReplyMode(MESSAGE, "forward", "reply", fields);
    expect(next.draftId).toBe("d-1");
    expect(next.droppedAttachmentIds).toEqual(["att-2"]);
  });
});

describe("replyModeOptions", () => {
  test("names who each mode reaches and what a forward carries", () => {
    const options = replyModeOptions(MESSAGE, "reply", { "samy@example.com": "Samy" }, 2);
    expect(options).toEqual([
      { mode: "reply", label: "Reply", detail: "Claire Martin" },
      {
        mode: "replyAll",
        label: "Reply all",
        detail: "Claire Martin · Cc Samy, nathalie",
      },
      { mode: "forward", label: "Forward", detail: "Empties To · keeps 2 attachments" },
    ]);
  });

  test("Reply all is not offered when a reply leaves nobody out", () => {
    const solo = messageDetail({ fromEmail: "claire@example.com", replyAllCc: [] });
    expect(replyModeOptions(solo, "reply", {}, 0).map((o) => o.mode)).toEqual(["reply", "forward"]);
    expect(replyModeOptions(solo, "reply", {}, 1).at(-1)!.detail).toBe(
      "Empties To · keeps 1 attachment",
    );
  });
});
