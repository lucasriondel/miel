// The label catalogue. The database is reached only through the store seam
// (#132, extended in #136): `LabelStore` holds the five queries, and what is
// left here is what a label *means* — that Gmail's `system`/`user` distinction
// collapses to two strings, and that a label Gmail already has is adopted
// rather than duplicated when creating one races.
import { Effect } from "effect";
import { LabelStore, type StoredLabel } from "../stores/contracts";
import { runWithStores } from "../stores/postgres";
import { createGmailAdapter, type GmailDataAdapter } from "../google/gmailAdapter";
import { ShellError } from "../adapters/shell";
import { createDebug } from "../util/debug";
import { tryAsync } from "../util/effect";

const debug = createDebug("service:labels");

/** A stored label, under the name every caller here already imports. */
export type LabelRow = StoredLabel;

/** Gmail's label type, as the two strings we store. */
const storedType = (type: string | undefined) => (type === "system" ? "system" : "user");

export const syncLabelsForAccountEffect = (args: {
  accountId: string;
  accountEmail: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<LabelRow[], Error, LabelStore> =>
  Effect.gen(function* () {
    debug("syncLabelsForAccount", { account: args.accountEmail });
    const gmail = args.gmail ?? createGmailAdapter();
    const remote = yield* tryAsync(() => gmail.listLabels({ account: args.accountEmail }));
    if (remote.length === 0) {
      debug("syncLabelsForAccount empty", { account: args.accountEmail });
      return [];
    }

    const upserted = yield* LabelStore.upsert(
      remote.map((l) => ({
        accountId: args.accountId,
        gmailLabelId: l.id,
        name: l.name,
        type: storedType(l.type),
        colorBg: l.color?.backgroundColor ?? null,
        colorFg: l.color?.textColor ?? null,
      })),
    );
    debug("syncLabelsForAccount done", {
      account: args.accountEmail,
      upserted: upserted.length,
    });
    return upserted;
  });

export const getLabelsForAccountEffect = (
  accountId: string,
): Effect.Effect<LabelRow[], never, LabelStore> => LabelStore.byAccount(accountId);

export const getLabelsByGmailIdsEffect = (args: {
  accountId: string;
  gmailLabelIds: string[];
}): Effect.Effect<LabelRow[], never, LabelStore> => LabelStore.byGmailIds(args);

export const ensureLabelEffect = (args: {
  accountId: string;
  accountEmail: string;
  name: string;
  gmail?: GmailDataAdapter;
}): Effect.Effect<LabelRow, Error, LabelStore> =>
  Effect.gen(function* () {
    debug("ensureLabel", { account: args.accountEmail, name: args.name });
    const gmail = args.gmail ?? createGmailAdapter();
    const existing = yield* LabelStore.byName({
      accountId: args.accountId,
      name: args.name,
    });
    if (existing) {
      debug("ensureLabel hit", { name: args.name, labelId: existing.id });
      return existing;
    }

    debug("ensureLabel creating", {
      account: args.accountEmail,
      name: args.name,
    });
    const created = yield* tryAsync(() =>
      gmail.createLabel({ account: args.accountEmail, name: args.name }),
    ).pipe(
      Effect.catchAll((err) => {
        if (err instanceof ShellError && /label already exists/i.test(err.stderr)) {
          debug("ensureLabel already exists in gmail", { name: args.name });
          return Effect.gen(function* () {
            const remote = yield* tryAsync(() => gmail.listLabels({ account: args.accountEmail }));
            const found = remote.find((l) => l.name === args.name);
            if (!found) {
              return yield* Effect.fail(
                new Error(`Label exists in Gmail but not found: ${args.name}`),
              );
            }
            return found;
          });
        }
        return Effect.fail(err);
      }),
    );

    const [inserted] = yield* LabelStore.upsert([
      {
        accountId: args.accountId,
        gmailLabelId: created.id,
        name: created.name,
        type: storedType(created.type),
        colorBg: created.color?.backgroundColor ?? null,
        colorFg: created.color?.textColor ?? null,
      },
    ]);
    debug("ensureLabel created", {
      name: args.name,
      labelId: inserted.id,
      gmailLabelId: inserted.gmailLabelId,
    });
    return inserted;
  });

// Promise facades for the API/CLI boundary.
export async function syncLabelsForAccount(args: {
  accountId: string;
  accountEmail: string;
  gmail?: GmailDataAdapter;
}): Promise<LabelRow[]> {
  return runWithStores(syncLabelsForAccountEffect(args));
}

export async function getLabelsForAccount(accountId: string): Promise<LabelRow[]> {
  return runWithStores(getLabelsForAccountEffect(accountId));
}

export async function getLabelsByGmailIds(args: {
  accountId: string;
  gmailLabelIds: string[];
}): Promise<LabelRow[]> {
  return runWithStores(getLabelsByGmailIdsEffect(args));
}

export async function ensureLabel(args: {
  accountId: string;
  accountEmail: string;
  name: string;
  gmail?: GmailDataAdapter;
}): Promise<LabelRow> {
  return runWithStores(ensureLabelEffect(args));
}
