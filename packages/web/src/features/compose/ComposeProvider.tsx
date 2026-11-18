import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { useAccounts } from "../../api/queries";
import type { Account, MessageDetail } from "../../api/types";
import { accountDisplayName } from "../../components/sidebar/accountDisplayName";
import { ComposeDock } from "./ComposeDock";
import {
  isBlank,
  MAX_WINDOWS,
  newSession,
  replySession,
  type ComposeAccount,
  type ComposeFields,
  type ComposeSession,
  type ReplyMode,
  type ReplyPrefill,
} from "./composeSession";

export type { ReplyMode, ReplyPrefill } from "./composeSession";

/**
 * The app-wide compose surface: the floating windows docked bottom-right, and
 * the one way anything opens one. The sidebar's Compose button (and `C`) calls
 * `openNew`; the reader's Reply split button calls `openReply`.
 */
export interface ComposeApi {
  /** A blank new message from `accountId` (the mailbox on screen). */
  openNew: (accountId: string | undefined) => void;
  /** A reply, reply-all or text-only forward of `message`. */
  openReply: (message: MessageDetail, mode: ReplyMode, prefill?: ReplyPrefill) => void;
}

/** What a docked window may do to its own session. Internal to the compose feature. */
export type FieldsPatch =
  | Partial<ComposeFields>
  | ((fields: ComposeFields) => Partial<ComposeFields>);

export interface ComposeSessionActions {
  /** A patch, or a function of the latest fields for writes that race (upload progress). */
  update: (id: string, patch: FieldsPatch) => void;
  minimize: (id: string) => void;
  restore: (id: string) => void;
  remove: (id: string) => void;
  /** Put a closed window back as it was — the Undo of a scheduled send. */
  reopen: (session: ComposeSession) => void;
}

const noop: ComposeApi = { openNew: () => {}, openReply: () => {} };

const ComposeContext = createContext<ComposeApi>(noop);

export const useCompose = (): ComposeApi => useContext(ComposeContext);

const FULL = "Three windows are open — send or discard one first.";

/** Opening or restoring one window folds every other open one to its title bar. */
const focusOnly = (sessions: ComposeSession[], id: string): ComposeSession[] =>
  sessions.map((s) =>
    s.id === id
      ? { ...s, intent: "open" }
      : s.intent === "open"
        ? { ...s, intent: "minimized" }
        : s,
  );

/** The name the From row shows is the mailbox's name in miel — its nickname first. */
const toAccount = (a: Account): ComposeAccount => ({
  id: a.id,
  email: a.email,
  displayName: accountDisplayName(a),
});

interface Props {
  children: ReactNode;
  /** How long the autosave waits after the last keystroke. Tests shorten it. */
  draftSaveDelayMs?: number;
}

/**
 * Holds every compose window's fields, so a minimized window keeps what was
 * typed while its body is unmounted, and so `C` can tell a blank new-message
 * window (restored) from one holding work (a second one is opened beside it).
 *
 * The windows themselves — requests, autosave, shortcuts — are each
 * `ComposeSessionWindow`'s, rendered in the dock below the app.
 */
export const ComposeProvider = ({ children, draftSaveDelayMs = 1500 }: Props) => {
  const [sessions, setSessions] = useState<ComposeSession[]>([]);
  const accounts = useAccounts();
  const accountList = accounts.data;

  // Read through a ref so the cap's notice is raised once, outside the state
  // updater (which StrictMode runs twice).
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const openSession = useCallback(
    (make: (current: ComposeSession[]) => ComposeSession | string) => {
      const current = sessionsRef.current;
      const made = make(current);
      if (typeof made === "string") {
        setSessions((latest) => focusOnly(latest, made));
        return;
      }
      if (current.length >= MAX_WINDOWS) {
        toast.error(FULL);
        return;
      }
      setSessions((latest) => focusOnly([...latest, made], made.id));
    },
    [],
  );

  const openNew = useCallback(
    (accountId: string | undefined) => {
      const account =
        accountList?.find((a) => a.id === accountId) ?? (accountId ? undefined : accountList?.[0]);
      if (!account) return;
      openSession((current) => {
        const blank = current.find(
          (s) => s.kind === "new" && s.accountId === account.id && isBlank(s.fields),
        );
        return blank ? blank.id : newSession(toAccount(account));
      });
    },
    [accountList, openSession],
  );

  const openReply = useCallback(
    (message: MessageDetail, mode: ReplyMode, prefill?: ReplyPrefill) => {
      const account = accountList?.find((a) => a.id === message.accountId);
      openSession((current) => {
        const existing = current.find(
          (s) =>
            s.kind === mode &&
            s.message?.gmailMessageId === message.gmailMessageId &&
            s.accountId === message.accountId,
        );
        if (!existing)
          return replySession(message, mode, account ? toAccount(account) : null, prefill);
        return existing.id;
      });
    },
    [accountList, openSession],
  );

  const actions = useMemo<ComposeSessionActions>(
    () => ({
      update: (id, patch) =>
        setSessions((current) =>
          current.map((s) =>
            s.id === id
              ? {
                  ...s,
                  fields: {
                    ...s.fields,
                    ...(typeof patch === "function" ? patch(s.fields) : patch),
                  },
                }
              : s,
          ),
        ),
      minimize: (id) =>
        setSessions((current) =>
          current.map((s) =>
            s.id === id ? { ...s, intent: "minimized", focusInstruction: false } : s,
          ),
        ),
      restore: (id) => setSessions((current) => focusOnly(current, id)),
      remove: (id) => setSessions((current) => current.filter((s) => s.id !== id)),
      reopen: (session) => {
        const current = sessionsRef.current;
        if (!current.some((s) => s.id === session.id) && current.length >= MAX_WINDOWS) {
          toast.error(FULL);
          return;
        }
        setSessions((latest) =>
          latest.some((s) => s.id === session.id)
            ? focusOnly(latest, session.id)
            : focusOnly([...latest, { ...session, intent: "open" }], session.id),
        );
      },
    }),
    [],
  );

  const api = useMemo<ComposeApi>(() => ({ openNew, openReply }), [openNew, openReply]);

  return (
    <ComposeContext.Provider value={api}>
      {children}
      <ComposeDock sessions={sessions} actions={actions} draftSaveDelayMs={draftSaveDelayMs} />
    </ComposeContext.Provider>
  );
};
