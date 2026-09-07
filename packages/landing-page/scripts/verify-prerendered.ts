/**
 * Final step of `bun run build`: check the HTML in `dist/public` against the
 * contract each page owes — its whole copy as raw text, the permission table
 * derived from the canonical scope list, the Anthropic disclosure, the contact
 * address, the GitHub link, and the cross-links between the three pages.
 *
 * It runs here rather than in `bun test` because it needs the build to have
 * happened. Run on its own it says so instead of failing obscurely:
 *
 *   bun scripts/verify-prerendered.ts [dist/public]
 */
import {
  type BuiltPage,
  MissingBuildError,
  PUBLIC_DIR,
  readBuiltPages,
  verifyPrerendered,
} from "../src/build/verifyPrerendered";

const publicDir = process.argv[2] ?? PUBLIC_DIR;

/** How many problems to print per page before summarising the rest. */
const MAX_REPORTED = 12;

let pages: BuiltPage[];
try {
  pages = readBuiltPages(publicDir);
} catch (error) {
  if (error instanceof MissingBuildError) {
    console.error(`verify-prerendered: ${error.message}`);
    process.exit(1);
  }
  throw error;
}

const results = verifyPrerendered(pages);

for (const { route, label, problems } of results) {
  if (problems.length === 0) {
    console.log(`verify-prerendered: ✓ ${route} — ${label} reads without JavaScript`);
    continue;
  }
  console.error(`verify-prerendered: ✗ ${route} — ${label}`);
  // A shell fails every assertion at once; the first dozen already say why.
  for (const problem of problems.slice(0, MAX_REPORTED)) console.error(`  - ${problem}`);
  if (problems.length > MAX_REPORTED) {
    console.error(`  … and ${problems.length - MAX_REPORTED} more`);
  }
}

const failed = results.filter((result) => result.problems.length > 0);
if (failed.length > 0) {
  console.error(
    `verify-prerendered: ${failed.length} of ${results.length} prerendered pages do not carry ` +
      `their text as raw HTML.`,
  );
  process.exit(1);
}
