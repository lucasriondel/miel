import type { ListedMessage } from "../api/types";

export interface InboxBuckets {
  high: ListedMessage[];
  medium: ListedMessage[];
  low: ListedMessage[];
  untriaged: ListedMessage[];
}

export const bucketMessages = (messages: ListedMessage[]): InboxBuckets => {
  const buckets: InboxBuckets = {
    high: [],
    medium: [],
    low: [],
    untriaged: [],
  };
  for (const m of messages) {
    if (m.priority) buckets[m.priority].push(m);
    else buckets.untriaged.push(m);
  }
  return buckets;
};
