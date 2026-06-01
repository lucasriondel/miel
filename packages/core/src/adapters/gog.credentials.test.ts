// Adapter tests for the gog auth-setup commands wrapped in gog.ts:
//   - setGogCredentials  → `gog auth credentials <tmp>`   (quickstart step 3)
//   - setAccountAlias     → `gog auth alias set <a> <e>`   (quickstart step 5)
// We mock only `spawnVoid` (so no real `gog` runs) and capture the argv to
// assert on it. setGogCredentials writes a real temp file via node:fs (only the
// spawn is mocked), so we can verify the JSON is written and then cleaned up.
// No DB needed. Run: bun test src/adapters/gog.credentials.test.ts
import { afterEach, expect, mock, test } from "bun:test";

const SHELL = `${import.meta.dir}/shell.ts`;
const GOG = `${import.meta.dir}/gog.ts`;

// Keep the real shell module (error classes, spawnJson) and override spawnVoid.
const realShell = await import(SHELL);

interface SpawnVoidArgs {
  cmd: string[];
}

let captured: string[][] = [];
// Side effect observed inside the mocked spawn: the temp file the real
// setGogCredentials wrote, so we can assert its contents before cleanup runs.
let credentialsFileContents: string | null = null;

function installMock(): void {
  captured = [];
  credentialsFileContents = null;
  mock.module(SHELL, () => ({
    ...realShell,
    spawnVoid: async (o: SpawnVoidArgs) => {
      captured.push(o.cmd);
      // For the credentials command, the file at cmd[3] exists right now.
      if (o.cmd[1] === "auth" && o.cmd[2] === "credentials") {
        credentialsFileContents = await Bun.file(o.cmd[3]).text();
      }
    },
  }));
}

afterEach(() => {
  mock.restore();
});

test("setGogCredentials runs `gog auth credentials <tmp>`, writing the JSON then cleaning up", async () => {
  installMock();
  const { setGogCredentials } = await import(GOG);

  const json = '{"installed":{"client_id":"x","client_secret":"y"}}';
  await setGogCredentials(json);

  // Exactly one spawn, with the credentials argv (ignoring the GOG_BIN path).
  expect(captured).toHaveLength(1);
  expect(captured[0][0].endsWith("gog")).toBe(true);
  expect(captured[0].slice(1)).toEqual([
    "auth",
    "credentials",
    "/tmp/miel-gog-credentials.json",
  ]);

  // The JSON was actually written to the temp file before spawning.
  expect(credentialsFileContents).toBe(json);

  // …and the temp file is cleaned up afterward.
  expect(await Bun.file("/tmp/miel-gog-credentials.json").exists()).toBe(false);
});

test("setAccountAlias runs `gog auth alias set <alias> <email>`", async () => {
  installMock();
  const { setAccountAlias } = await import(GOG);

  await setAccountAlias({ alias: "work", email: "a@gmail.com" });

  expect(captured).toHaveLength(1);
  expect(captured[0][0].endsWith("gog")).toBe(true);
  expect(captured[0].slice(1)).toEqual([
    "auth",
    "alias",
    "set",
    "work",
    "a@gmail.com",
  ]);
});
