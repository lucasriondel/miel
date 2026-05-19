import { Command } from "commander";
import { runMigrations } from "@miel/core";

export function dbCommand(): Command {
  const cmd = new Command("db").description("Database utilities");
  cmd
    .command("migrate")
    .description("Run pending Drizzle migrations against DATABASE_URL")
    .action(async () => {
      await runMigrations();
      console.log("Migrations applied.");
    });
  return cmd;
}
