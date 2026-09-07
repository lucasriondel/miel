/**
 * Server-side face of the filter merge algebra.
 *
 * The algebra itself lives in the dependency-free leaf `../filterMergeSpec`, so
 * the web app can import it (through `@miel/core/filterMergeSpec`) and preview a
 * merge with the very function that will run on the server. What this module
 * adds is core's error contract: a `FilterMergeRejection` from the leaf becomes
 * the tagged `FilterMergeError` every core caller and the API's error handler
 * already pattern-match on.
 */
import { FilterMergeError } from "../errors";
import {
  FilterMergeRejection,
  buildMergedFilterSpec as buildMergedFilterSpecPure,
  criteriaToQueryTerm as criteriaToQueryTermPure,
} from "../filterMergeSpec";

export type { MergeSourceFilter, MergedFilterSpec } from "../filterMergeSpec";

/** Run `fn`, restating a leaf rejection in core's tagged-error taxonomy. */
function tagged<T>(fn: () => T): T {
  try {
    return fn();
  } catch (err) {
    if (err instanceof FilterMergeRejection) {
      throw new FilterMergeError({
        reason: err.reason,
        message: err.message,
        ...(err.gmailFilterIds ? { gmailFilterIds: err.gmailFilterIds } : {}),
      });
    }
    throw err;
  }
}

/** One source filter's criteria as a Gmail search term; see the leaf module. */
export const criteriaToQueryTerm: typeof criteriaToQueryTermPure = (criteria, gmailFilterId) =>
  tagged(() => criteriaToQueryTermPure(criteria, gmailFilterId));

/** The one filter that replaces `sources`; see the leaf module. */
export const buildMergedFilterSpec: typeof buildMergedFilterSpecPure = (sources) =>
  tagged(() => buildMergedFilterSpecPure(sources));
