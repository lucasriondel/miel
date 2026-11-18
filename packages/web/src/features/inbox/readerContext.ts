import type { ListedMessage } from "../../api/types";

/**
 * What the inbox hands the reader beside it (the `Outlet` context of the
 * message route): the messages in the order the list draws them, for the
 * reader's "1 of 3" pager and its up/down keys.
 */
export interface ReaderContext {
  readingOrder: ListedMessage[];
}
