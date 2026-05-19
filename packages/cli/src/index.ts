#!/usr/bin/env bun
import { Command } from "commander";
import { closeDb } from "@miel/core";
import { accountsCommand } from "./commands/accounts";
import { applyCommand } from "./commands/apply";
import { dbCommand } from "./commands/db";
import { replyCommand } from "./commands/reply";
import { syncCommand } from "./commands/sync";

const program = new Command();
program
  .name("miel")
  .description("Miel — Gmail triage CLI")
  .version("0.0.0")
  .showHelpAfterError();

program.addCommand(syncCommand());
program.addCommand(accountsCommand());
program.addCommand(applyCommand());
program.addCommand(replyCommand());
program.addCommand(dbCommand());

let exitCode = 0;
try {
  await program.parseAsync(process.argv);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  exitCode = 1;
} finally {
  await closeDb().catch(() => {});
}
process.exit(exitCode);
