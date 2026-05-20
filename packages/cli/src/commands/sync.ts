import { Command } from "commander";
import { syncAll } from "@miel/core";

export function syncCommand(): Command {
  return new Command("sync")
    .description("Fetch messages from Gmail and triage them via Claude")
    .option("--account <email>", "Limit sync to a single account email")
    .option("--since <window>", "Time window for fetch (e.g. 7d, 24h)", "7d")
    .option("--max <n>", "Max messages per account", (v) => parseInt(v, 10))
    .action(
      async (opts: {
        account?: string;
        since?: string;
        max?: number;
      }) => {
        const results = await syncAll({
          accountEmail: opts.account,
          since: opts.since,
          max: opts.max,
          log: (m) => console.log(m),
        });
        if (results.length === 0) {
          console.log(
            "No accounts to sync. Run `miel accounts sync` first.",
          );
          return;
        }
        console.log("");
        console.log("Summary:");
        for (const r of results) {
          console.log(
            `  ${r.account}\tfetched=${r.fetched}\ttriaged=${r.triaged}\tnewLabelSuggestions=${r.suggestedNewLabels}\tfilters=${r.filtersSynced}\tnewFilterSuggestions=${r.suggestedFilters}\terrors=${r.errors.length}`,
          );          for (const e of r.errors) {
            console.log(`    ! ${e}`);
          }
        }
      },
    );
}
