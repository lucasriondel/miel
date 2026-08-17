import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import { apiFetch, type ApiRequest } from "./client";
import { queryKeys } from "./queries";
import type { ListMessagesResponse, ListedMessage } from "./types";

/**
 * The cache choreography every message mutation performs, written once.
 *
 * Acting on a message means the same five steps each time: cancel the list
 * refetches that are in flight, snapshot what they cached, write the expected
 * result optimistically, put the snapshot back if the request failed, and
 * re-read from the server. Each mutation used to spell all five out, which made
 * the dangerous part — the dual cache shape below — a comment with a dozen
 * chances to be violated. A mutation now declares only what is its own: the
 * request, how a message changes, and what else that change touches.
 */

const MESSAGES_KEY = ["messages"] as const;

// `["messages", params]` holds two different cache shapes: `useMessages`
// (a plain useQuery) caches a `ListMessagesResponse` directly, while
// `useAllMessages` (a useInfiniteQuery on the same key, so a single
// optimistic update reaches both) caches `InfiniteData<ListMessagesResponse>`
// — `{ pages: [...], pageParams: [...] }`. Reading `.items` off the wrong one
// throws inside `onMutate`, which silently aborts the whole mutation (the
// mutationFn never runs). Handled here, and nowhere else.
type MessagesCacheValue = ListMessagesResponse | InfiniteData<ListMessagesResponse>;

type MessagesSnapshot = Array<[readonly unknown[], MessagesCacheValue | undefined]>;

function isInfiniteData(data: MessagesCacheValue): data is InfiniteData<ListMessagesResponse> {
  return "pages" in data;
}

function mapMessageItems(
  data: MessagesCacheValue,
  fn: (items: ListedMessage[]) => ListedMessage[],
): MessagesCacheValue {
  if (isInfiniteData(data)) {
    return {
      ...data,
      pages: data.pages.map((page) => ({ ...page, items: fn(page.items) })),
    };
  }
  return { ...data, items: fn(data.items) };
}

function allMessageItems(data: MessagesCacheValue): ListedMessage[] {
  return isInfiniteData(data) ? data.pages.flatMap((page) => page.items) : data.items;
}

function cachedMessages(qc: QueryClient): ListedMessage[] {
  return qc
    .getQueriesData<MessagesCacheValue>({ queryKey: MESSAGES_KEY })
    .flatMap(([, data]) => (data ? allMessageItems(data) : []));
}

/** The message (or messages) a mutation names, and the account they belong to. */
export interface MessageMutationTarget {
  accountId: string;
  gmailMessageId?: string;
  gmailMessageIds?: readonly string[];
}

export function sameMessage(m: ListedMessage, target: MessageMutationTarget): boolean {
  return m.accountId === target.accountId && m.gmailMessageId === target.gmailMessageId;
}

function messageDetailKeys(target: MessageMutationTarget): readonly (readonly unknown[])[] {
  const ids = target.gmailMessageId ? [target.gmailMessageId] : (target.gmailMessageIds ?? []);
  return ids.map((id) => queryKeys.message(target.accountId, id));
}

/** What the mutation expects a cached message to become. `null` drops the row. */
export type OptimisticItem = (message: ListedMessage) => ListedMessage | null;

/**
 * Builds that transform, given the input and every message currently cached
 * across the list queries. The second argument is what makes a thread-wide
 * removal expressible: archiving one message hides its siblings, which live in
 * other queries and other pages.
 */
export type OptimisticPlan<TInput> = (
  input: TInput,
  cached: readonly ListedMessage[],
) => OptimisticItem;

export interface MessageMutationConfig<TInput extends MessageMutationTarget> {
  /** The call itself — path, method and body. */
  request: (input: TInput) => ApiRequest;
  /** How the lists should read before the server answers. Omit to leave them. */
  optimistic?: OptimisticPlan<TInput>;
  /** Queries this mutation invalidates besides the lists and the message(s). */
  alsoInvalidate?: (input: TInput) => readonly (readonly unknown[])[];
  /**
   * Set by removals: the optimistic write is the truth, so the lists are only
   * re-read when the request failed. Refetching them on success would race a
   * second delete still in flight and briefly re-add the rows it removed.
   */
  listsAreAuthoritative?: boolean;
}

export interface MessageMutationContext {
  snapshot: MessagesSnapshot;
}

export function messageMutationOptions<TInput extends MessageMutationTarget, TResult>(
  qc: QueryClient,
  config: MessageMutationConfig<TInput>,
) {
  const invalidateTargets = (input: TInput) => {
    for (const key of messageDetailKeys(input)) {
      qc.invalidateQueries({ queryKey: key });
    }
    for (const key of config.alsoInvalidate?.(input) ?? []) {
      qc.invalidateQueries({ queryKey: key });
    }
  };

  return {
    mutationFn: async (input: TInput) => apiFetch<TResult>(config.request(input)),

    onMutate: async (input: TInput): Promise<MessageMutationContext> => {
      await qc.cancelQueries({ queryKey: MESSAGES_KEY });
      const snapshot = qc.getQueriesData<MessagesCacheValue>({ queryKey: MESSAGES_KEY });
      const plan = config.optimistic?.(input, cachedMessages(qc));
      if (plan) {
        qc.setQueriesData<MessagesCacheValue>({ queryKey: MESSAGES_KEY }, (data) =>
          data === undefined
            ? data
            : mapMessageItems(data, (items) =>
                items.map(plan).filter((m): m is ListedMessage => m !== null),
              ),
        );
      }
      return { snapshot };
    },

    onSuccess: (_data: TResult, input: TInput) => {
      if (!config.listsAreAuthoritative) {
        qc.invalidateQueries({ queryKey: MESSAGES_KEY });
      }
      invalidateTargets(input);
    },

    onError: (_err: unknown, input: TInput, context?: MessageMutationContext) => {
      for (const [key, data] of context?.snapshot ?? []) {
        qc.setQueryData(key, data);
      }
      qc.invalidateQueries({ queryKey: MESSAGES_KEY });
      invalidateTargets(input);
    },
  };
}
