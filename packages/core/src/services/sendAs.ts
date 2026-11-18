/**
 * Which addresses an account may send as — the compose window's From menu.
 *
 * Gmail's `users.settings.sendAs.list`, which `gmail.settings.basic` (a scope
 * every connected account already granted, for filters) covers: no new scope
 * and no re-consent. Only verified aliases are sendable; the rest are listed
 * with `verified: false` so a menu can say why one is missing rather than hide
 * it. The account's own address is always first.
 */
import { Effect } from "effect";
import {
  createGmailAdapter,
  type GmailDataAdapter,
  type SendAsAlias,
} from "../google/gmailAdapter";
import type { ComposeRefusedError } from "../errors";
import type { MessageStore } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { tryAsync } from "../util/effect";
import { resolveAccountEffect } from "./outgoing";

export const listSendAsEffect = (args: {
  accountId: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<SendAsAlias[], ComposeRefusedError | Error, MessageStore> =>
  Effect.gen(function* () {
    const gmail = args.gmail ?? createGmailAdapter();
    const account = yield* resolveAccountEffect({ accountId: args.accountId });
    const aliases = yield* tryAsync(() => gmail.listSendAs({ account: account.email }));
    return aliases.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  });

export async function listSendAs(args: { accountId: string }): Promise<SendAsAlias[]> {
  return runWithStores(listSendAsEffect(args));
}
