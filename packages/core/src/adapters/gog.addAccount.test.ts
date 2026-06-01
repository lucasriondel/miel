// Adapter tests for the gog auth-add command construction (quickstart step 4).
// addAccount and startReauth both spawn `gog auth add …` via the shared
// paste-back session; we mock createPasteBackLoginSession to capture the argv
// and options it's called with (no real `Bun.spawn`, no DB), then assert the
// exact command — including that ONLY add-account passes `--services gmail`.
// Run: bun test src/adapters/gog.addAccount.test.ts
import { afterEach, expect, mock, test } from "bun:test";

const PASTEBACK = `${import.meta.dir}/pasteBackSession.ts`;
const GOG = `${import.meta.dir}/gog.ts`;

const realPasteBack = await import(PASTEBACK);

interface CapturedOpts {
  key: string;
  cmd: string[];
  urlRegex: RegExp;
  ttlMs: number;
  urlTimeoutMs?: number;
  label?: string;
  verifyState?: boolean;
}

let captured: CapturedOpts | null = null;

function installMock(): void {
  captured = null;
  mock.module(PASTEBACK, () => ({
    ...realPasteBack,
    createPasteBackLoginSession: async (opts: CapturedOpts) => {
      captured = opts;
      return {
        sessionId: "sid",
        url: "https://accounts.google.com/o/oauth2/auth?state=abc",
        done: Promise.resolve({ ok: true } as const),
      };
    },
  }));
}

afterEach(() => {
  mock.restore();
});

test("addAccount spawns `gog auth add <email> --services gmail --manual --no-input` with state verification", async () => {
  installMock();
  const { createGogAdapter } = await import(GOG);

  const session = await createGogAdapter().addAccount({
    account: "new@gmail.com",
    services: ["gmail"],
  });

  expect(captured).not.toBeNull();
  expect(captured!.cmd[0].endsWith("gog")).toBe(true);
  expect(captured!.cmd.slice(1)).toEqual([
    "auth",
    "add",
    "new@gmail.com",
    "--services",
    "gmail",
    "--manual",
    "--no-input",
  ]);
  expect(captured!.verifyState).toBe(true);
  expect(captured!.key).toBe("new@gmail.com");
  expect(captured!.label).toBe("gog auth add");

  // The session {sessionId, url} is surfaced to the caller.
  expect(session.sessionId).toBe("sid");
  expect(session.url).toContain("accounts.google.com");
});

test("addAccount defaults services to gmail when omitted", async () => {
  installMock();
  const { createGogAdapter } = await import(GOG);

  await createGogAdapter().addAccount({ account: "x@gmail.com" });

  expect(captured!.cmd.slice(1)).toEqual([
    "auth",
    "add",
    "x@gmail.com",
    "--services",
    "gmail",
    "--manual",
    "--no-input",
  ]);
});

test("startReauth spawns the same add command WITHOUT --services (regression guard)", async () => {
  installMock();
  const { createGogAdapter } = await import(GOG);

  await createGogAdapter().startReauth({ account: "old@gmail.com" });

  // The ONLY divergence between reauth and add-account is `--services gmail`.
  expect(captured!.cmd.slice(1)).toEqual([
    "auth",
    "add",
    "old@gmail.com",
    "--manual",
    "--no-input",
  ]);
  expect(captured!.verifyState).toBe(true);
  expect(captured!.key).toBe("old@gmail.com");
});
