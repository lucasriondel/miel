import type { MessageDetail } from "../../api/types";
import { replyFields, type ComposeFields, type ReplyMode } from "../compose/composeSession";

/**
 * Switching an open window between Reply, Reply all and Forward (Compose &
 * Reply › "Switching mode inside the window"): the mode chip changes what was
 * prefilled, never what was typed.
 *
 * The rule, field by field, with "default" meaning what `replyFields` prefills
 * for a mode:
 *
 * - **To, Cc, Bcc** are diffed against the previous mode's default. An address
 *   the previous mode put there and that is still there is the mode's, and is
 *   replaced by the new mode's default. An address the user added is kept. A
 *   default the user removed stays removed if the new mode would put it back.
 *   No address lands twice, across all three lists.
 * - **Subject** is the new mode's default while it still reads exactly as the
 *   previous mode prefilled it; once edited it is the user's and is kept as
 *   typed.
 * - **Cc's row** stays open if the user opened it while the previous mode had
 *   it folded, and otherwise follows whether the new Cc holds anyone.
 * - **From**: a forward goes from the mailbox the original arrived in (the
 *   server builds it there), so switching to Forward from another mailbox
 *   comes back to that one, alias dropped. An alias of the window's own
 *   mailbox is valid in every mode and is kept.
 * - **Everything else** — the body, the AI instruction, attached files, a
 *   trimmed quote, a forward's removed files, the Gmail draft's id — is kept.
 *   The quote and the forwarded block are not fields: the window draws one or
 *   the other from its mode, and a trim or a removed file is there again if
 *   the user switches back.
 */
export const switchReplyMode = (
  message: MessageDetail,
  from: ReplyMode,
  to: ReplyMode,
  fields: ComposeFields,
): ComposeFields => {
  if (from === to) return fields;
  const before = replyFields(message, from);
  const after = replyFields(message, to);

  // Per list: the new mode's default, less what the user took out of the old
  // one, then what the user typed. A default moved from To to Cc is typed in
  // Cc and removed from To, so it stays where the user put it.
  const list = (current: readonly string[], was: readonly string[], next: readonly string[]) => {
    const wasDefault = new Set(was.map(addressKey));
    const kept = new Set(current.map(addressKey));
    const removed = new Set([...wasDefault].filter((key) => !kept.has(key)));
    return {
      defaults: next.filter((entry) => !removed.has(addressKey(entry))),
      typed: current.filter((entry) => !wasDefault.has(addressKey(entry))),
    };
  };
  const lists = [
    list(fields.to, before.to, after.to),
    list(fields.cc, before.cc, after.cc),
    list(fields.bcc, before.bcc, after.bcc),
  ];
  // No address twice: what the user typed is claimed first, so a default never
  // displaces it, and a default already placed in an earlier list is skipped.
  const claimed = new Set(lists.flatMap((l) => l.typed.map(addressKey)));
  const [nextTo, nextCc, nextBcc] = lists.map(({ defaults, typed }) => [
    ...defaults.filter((entry) => {
      const key = addressKey(entry);
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    }),
    ...typed,
  ]) as [string[], string[], string[]];

  const subject = fields.subject === before.subject ? after.subject : fields.subject;
  const ccOpenedByUser = fields.showCc && !before.showCc;
  const leavesOwnMailbox = to === "forward" && fields.fromAccountId !== message.accountId;

  return {
    ...fields,
    to: nextTo,
    cc: nextCc,
    bcc: nextBcc,
    showCc: ccOpenedByUser || nextCc.length > 0,
    subject,
    ...(leavesOwnMailbox ? { fromAccountId: message.accountId, fromAlias: null } : {}),
  };
};

/** The address an entry names, whichever way it was written ("Name <a@b>" or "a@b"). */
const addressKey = (entry: string): string => {
  const angled = /<([^<>]+)>\s*$/.exec(entry);
  return (angled ? angled[1]! : entry).trim().toLowerCase();
};

/** One row of the mode chip's menu. */
export interface ReplyModeOption {
  mode: ReplyMode;
  label: string;
  /** Who it reaches, or what it carries — the menu's second line. */
  detail: string;
}

/**
 * What the mode chip's menu offers. Reply all only when there is someone a
 * reply would leave out — the reader's caret menu follows the same rule — or
 * when the window already is one.
 */
export const replyModeOptions = (
  message: MessageDetail,
  current: ReplyMode,
  names: Record<string, string>,
  keptAttachments: number,
): ReplyModeOption[] => {
  // A hint line, not an address list: a known name, else the address's local part.
  const name = (address: string) => names[address.toLowerCase()] ?? address.split("@")[0]!;
  const sender = message.fromName?.trim() || message.fromEmail || "the sender";
  const options: ReplyModeOption[] = [{ mode: "reply", label: "Reply", detail: sender }];
  if (message.replyAllCc.length > 0 || current === "replyAll") {
    const cc = message.replyAllCc.map(name).join(", ");
    options.push({
      mode: "replyAll",
      label: "Reply all",
      detail: cc ? `${sender} · Cc ${cc}` : sender,
    });
  }
  const files =
    keptAttachments === 0
      ? ""
      : ` · keeps ${keptAttachments} attachment${keptAttachments === 1 ? "" : "s"}`;
  options.push({ mode: "forward", label: "Forward", detail: `Empties To${files}` });
  return options;
};
