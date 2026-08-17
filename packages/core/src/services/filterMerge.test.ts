// Pure merge algebra: N Gmail filters → one `query` criterion + one action.
//
// No db, no Gmail — `buildMergedFilterSpec` is a function of the source rows'
// stored `criteria`/`action` JSON, which is what makes the OR-building and the
// action union cheap to pin down exactly.
import { describe, expect, test } from "bun:test";

import { buildMergedFilterSpec, criteriaToQueryTerm, type MergeSourceFilter } from "./filterMerge";
import { FilterMergeError } from "../errors";

const src = (
  gmailFilterId: string,
  criteria: Record<string, unknown>,
  action: Record<string, unknown> = { addLabelIds: ["L1"] },
): MergeSourceFilter => ({ gmailFilterId, criteria, action });

describe("criteriaToQueryTerm", () => {
  test("renders a simple sender as a bare from: term", () => {
    expect(criteriaToQueryTerm({ from: "a@x.com" })).toBe("from:a@x.com");
  });

  test("parenthesizes a value that carries whitespace or an OR", () => {
    expect(criteriaToQueryTerm({ subject: "monthly report" })).toBe("subject:(monthly report)");
    expect(criteriaToQueryTerm({ from: "a@x.com OR b@y.com" })).toBe("from:(a@x.com OR b@y.com)");
  });

  test("keeps an already-parenthesized value as-is", () => {
    expect(criteriaToQueryTerm({ to: "(a@x.com OR b@y.com)" })).toBe("to:(a@x.com OR b@y.com)");
  });

  test("uses a query criterion verbatim, parenthesized when it has parts", () => {
    expect(criteriaToQueryTerm({ query: "has:attachment" })).toBe("has:attachment");
    expect(criteriaToQueryTerm({ query: "from:a@x.com has:attachment" })).toBe(
      "(from:a@x.com has:attachment)",
    );
  });

  test("ANDs a filter's own fields together inside one parenthesized term", () => {
    expect(criteriaToQueryTerm({ from: "a@x.com", subject: "invoice" })).toBe(
      "(from:a@x.com subject:invoice)",
    );
  });

  test("translates the flag and size criteria into search operators", () => {
    expect(criteriaToQueryTerm({ hasAttachment: true })).toBe("has:attachment");
    expect(criteriaToQueryTerm({ excludeChats: true, from: "a@x.com" })).toBe(
      "(from:a@x.com -in:chats)",
    );
    expect(criteriaToQueryTerm({ negatedQuery: "unsubscribe me" })).toBe("-(unsubscribe me)");
    expect(criteriaToQueryTerm({ size: 1048576, sizeComparison: "larger" })).toBe("larger:1048576");
    expect(criteriaToQueryTerm({ size: 500, sizeComparison: "smaller" })).toBe("smaller:500");
  });

  test("returns null when nothing in the criteria is expressible", () => {
    expect(criteriaToQueryTerm({})).toBeNull();
    expect(criteriaToQueryTerm({ from: "   " })).toBeNull();
  });
});

describe("buildMergedFilterSpec — query", () => {
  test("ORs the source terms inside braces, in source order", () => {
    const spec = buildMergedFilterSpec([
      src("f1", { from: "a@x.com" }),
      src("f2", { from: "b@y.com" }),
      src("f3", { from: "c@z.com" }),
    ]);

    expect(spec.query).toBe("{from:a@x.com OR from:b@y.com OR from:c@z.com}");
  });

  test("ORs across criteria types, using whichever field each source used", () => {
    const spec = buildMergedFilterSpec([
      src("f1", { from: "a@x.com" }),
      src("f2", { subject: "monthly report" }),
      src("f3", { query: "has:attachment older_than:1y" }),
      src("f4", { to: "team@x.com" }),
    ]);

    expect(spec.query).toBe(
      "{from:a@x.com OR subject:(monthly report) OR " +
        "(has:attachment older_than:1y) OR to:team@x.com}",
    );
  });

  test("collapses duplicate terms and drops the braces when one survives", () => {
    const spec = buildMergedFilterSpec([
      src("f1", { from: "a@x.com" }),
      src("f2", { from: "a@x.com" }, { addLabelIds: ["L2"] }),
    ]);

    expect(spec.query).toBe("from:a@x.com");
  });

  test("rejects fewer than two sources", () => {
    const one = () => buildMergedFilterSpec([src("f1", { from: "a@x.com" })]);
    expect(one).toThrow(FilterMergeError);
    expect(one).toThrow(/at least 2/i);
  });

  test("rejects a source whose criteria cannot be expressed as a query", () => {
    const bad = () => buildMergedFilterSpec([src("f1", { from: "a@x.com" }), src("f2", {})]);
    expect(bad).toThrow(FilterMergeError);
    expect(bad).toThrow(/f2/);
  });

  test("rejects a size criterion with no usable comparison", () => {
    const bad = () =>
      buildMergedFilterSpec([
        src("f1", { from: "a@x.com" }),
        src("f2", { size: 10, sizeComparison: "unspecified" }),
      ]);
    expect(bad).toThrow(FilterMergeError);
    expect(bad).toThrow(/f2/);
  });
});

describe("buildMergedFilterSpec — action", () => {
  test("unions label ids across sources, deduped and in first-seen order", () => {
    const spec = buildMergedFilterSpec([
      src("f1", { from: "a@x.com" }, { addLabelIds: ["L1", "L2"] }),
      src("f2", { from: "b@y.com" }, { addLabelIds: ["L2", "L3"], removeLabelIds: ["INBOX"] }),
      src("f3", { from: "c@z.com" }, { removeLabelIds: ["UNREAD", "INBOX"] }),
    ]);

    expect(spec.addLabelIds).toEqual(["L1", "L2", "L3"]);
    expect(spec.removeLabelIds).toEqual(["INBOX", "UNREAD"]);
    expect(spec.forward).toBeUndefined();
  });

  test("keeps a forward address shared by the sources that set one", () => {
    const spec = buildMergedFilterSpec([
      src("f1", { from: "a@x.com" }, { forward: "ops@x.com" }),
      src("f2", { from: "b@y.com" }, { addLabelIds: ["L1"] }),
      src("f3", { from: "c@z.com" }, { forward: "ops@x.com" }),
    ]);

    expect(spec.forward).toBe("ops@x.com");
  });

  test("rejects sources that forward to different addresses", () => {
    const bad = () =>
      buildMergedFilterSpec([
        src("f1", { from: "a@x.com" }, { forward: "ops@x.com" }),
        src("f2", { from: "b@y.com" }, { forward: "other@x.com" }),
      ]);
    expect(bad).toThrow(FilterMergeError);
    expect(bad).toThrow(/forward/i);
  });

  test("rejects a label that one source adds and another removes", () => {
    const bad = () =>
      buildMergedFilterSpec([
        src("f1", { from: "a@x.com" }, { addLabelIds: ["L1"] }),
        src("f2", { from: "b@y.com" }, { removeLabelIds: ["L1"] }),
      ]);
    expect(bad).toThrow(FilterMergeError);
    expect(bad).toThrow(/L1/);
  });

  test("rejects sources that between them do nothing", () => {
    const bad = () =>
      buildMergedFilterSpec([
        src("f1", { from: "a@x.com" }, {}),
        src("f2", { from: "b@y.com" }, {}),
      ]);
    expect(bad).toThrow(FilterMergeError);
    expect(bad).toThrow(/action/i);
  });
});
