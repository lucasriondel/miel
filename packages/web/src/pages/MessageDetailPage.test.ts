import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// #92. The page used to `fetch()` the delete itself: no bearer token, no cache
// invalidation, and `.then(() => navigate(-1))` fires on a 404 as readily as on
// a 200, so the user was told a delete succeeded that never happened (the path
// it called, `/api/accounts/:id/messages/:id`, is not even a route the API
// serves).
//
// These are source assertions rather than a render: this package has no DOM
// harness, and what has to stay true here is structural — the page must not
// talk to the network itself, and the navigation must hang off the mutation's
// success. The cache and request behavior are covered in
// `api/mutations.trash.test.ts`.
const source = readFileSync(join(import.meta.dir, "MessageDetailPage.tsx"), "utf8");

describe("the message detail page", () => {
  test("makes no direct network call of its own", () => {
    expect(source).not.toMatch(/\bfetch\s*\(/);
    // No hard-coded proxy URL either — only the client knows where the API is.
    // (`../api/...` imports are module paths, hence the quote in the pattern.)
    expect(source).not.toMatch(/["'`]\/api\//);
  });

  test("routes the confirmation delete through the shared trash mutation", () => {
    expect(source).toContain("useTrashMessage");
    expect(source).toMatch(/trash\.mutate\(/);
  });

  // #145. Waiting for the answer meant sitting on a page whose message is
  // already gone from every list, so the exit moved onto the click. The
  // rendered proof — that the inbox is back before the request settles — is in
  // `features/message-detail/detailActions.test.tsx`.
  test("navigates back as the delete is fired, not once it lands", () => {
    expect(source).toMatch(/trash\.mutate\([\s\S]{0,200}\);\s*returnToInbox\(\);/);
  });

  // #95. Deleting and simply backing out are the same journey — both have to
  // land on the inbox the message was opened from, filters and scroll offset
  // included — so both take the one exit, `useReturnToInbox`. The page no
  // longer calls `navigate` itself at all.
  test("leaves by the same exit the back button uses", () => {
    expect(source).toContain("useReturnToInbox");
    expect(source).toMatch(/onClick=\{returnToInbox\}/);
    expect(source).not.toContain("navigate(-1)");
    expect(source).not.toContain("useNavigate");
  });

  // The page is unmounted by the time the delete answers, and react-query drops
  // the callbacks passed to `mutate` when their component goes — so a failure
  // reported from here would be reported to nobody. The notice lives on the
  // mutation instead (`api/mutations.ts`), which the cache calls either way.
  test("hands the delete no callbacks it would no longer be here to run", () => {
    expect(source).not.toMatch(/onSuccess:/);
    expect(source).not.toMatch(/onError:/);
    expect(source).not.toContain("console.error");
  });

  test("disables the control while the delete is in flight", () => {
    expect(source).toMatch(/isDeleting=\{trash\.isPending\}/);
  });
});
