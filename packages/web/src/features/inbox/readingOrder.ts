import type { ListedMessage } from "../../api/types";
import { bucketMessages } from "../../pages/inboxBuckets";
import { groupByCategory } from "../../pages/categoryGroups";

/**
 * The list's messages in the order they are drawn — high, medium, low, then
 * untriaged; within each, category by category — which is the order the
 * reader's pager ("2 of 14", up and down) walks.
 */
export const readingOrder = (messages: ListedMessage[]): ListedMessage[] => {
  const buckets = bucketMessages(messages);
  return [buckets.high, buckets.medium, buckets.low, buckets.untriaged].flatMap((bucket) =>
    groupByCategory(bucket).flatMap((g) => g.messages),
  );
};
