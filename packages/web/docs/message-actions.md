# Acting on messages

## Acting on a message

What the user did is on screen before the network answers, and undone visibly if the server refuses (#145). `api/messageMutation.ts` owns both halves: a mutation declares `optimistic` for the `["messages"]` lists and `optimisticDetail` for the `["message", …]` query, and the factory cancels, snapshots, writes and rolls back each. The detail plan is separate because it spells the same facts differently — priority lives on the newest triage run, a suggestion is a `status` on that run — while `labels`, which both share, is edited by helpers generic over the carrier. `optimisticDetail` only rewrites a detail already cached.

Archive, trash and the confirmation panel's delete return to the inbox from the click handler, beside `mutate`, not in its `onSuccess`. React-query drops the callbacks passed to `mutate` once their component unmounts, and these always unmount, so archive and trash carry their failure notice on the mutation itself (`announcingFailure` in `api/mutations.ts`). `features/inbox/detailExits.test.ts` counts the exits; `features/message-detail/detailActions.test.tsx` renders them.

Opening a message marks it read (#142): `features/message-detail/useMarkReadOnOpen.ts` fires the same `useSetMessageRead` the toggle uses, optimistic, rolled back silently on refusal. The hook's ref records the message it has *considered*, not the one it acted on: `UNREAD` is read off a cache that refetches and the toggle rewrite, so re-deciding on each sighting would re-fire on a refetch and undo a "Mark as unread". The toggle's suite therefore tests the trip back.

## Labelling the message you are reading

`features/message-detail/AddLabelButton.tsx` and `useAddMessageLabel` (#167). No new endpoint: `POST /messages/:accountId/:gmailMessageId/labels` has always taken both `add` and `remove`. The inbox row reuses this mutation whole (#170).

- **The header's badge row is unconditional** — the trigger always renders, so a message with no labels can be labelled. `MessageLabels` still self-hides.
- **Both optimistic plans, and a notice.** `optimistic` and `optimisticDetail`, so the badge appears on the page and the row before the server answers; `withLabel` leaves an existing label alone. The refusal toast rides on the mutation (`announcingFailure`), because a silent rollback reads as a missed click.
- **One picker.** A label already on the message is listed and marked "Added" rather than hidden.

## The one label picker

`features/labels/LabelPicker.tsx` is the whole of a label chooser; the bulk bar's `BulkLabelPicker` and the message detail's `AddLabelButton` mount it (#169). A face owns its trigger (`renderTrigger`) and the `align` edge its panel hangs from; everything else, closing included, is the picker's — a pick closes the panel and *then* reaches the caller. The panel is anchored in place, not portalled.

- **`offeredLabels.ts` is the rule, and it is pure**: system mailboxes out, sorted by name, case-insensitive substring of the *whole* name (so `Clients/Acme` matches "clients").
- **Four states**: loading, load-failed, no-labels-yet, and filter-matched-nothing. `LabelPickerBody.tsx` chooses between them; the field is drawn only in the branch that has something to narrow.
- **The query lives in `LabelPickerMenu`**, unmounted with the panel, so each open starts unfiltered.
- **The field sits outside the `menu` element** and only the results scroll. It takes the caret on open and leaves Escape to the popover, so one press closes the panel.

The filter is driven through both call sites (`select/bulkLabelWiring.test.tsx`, `message-detail/addLabelWiring.test.tsx`), which is what catches a trigger wired to a picker of its own.

The inbox row is the exception to `renderTrigger`: its panel is placed by the *list*, so it composes `LabelPickerMenu` directly. Both panels share `labelPanel.ts` (width, border, padding, shadow) and everything inside.

## Labelling a message from its inbox row

The row gained an add-label action (#170). Its badges stay read-only — *detaching* is a decision made on the detail page, and the section headers' flag actions still exclude labelling a whole category. The comments in `MessageRowLabels.tsx` and `SectionActions.tsx` say so.

It is `useAddMessageLabel` and the shared picker; what is new is who mounts the picker.

- **One picker for the list.** `RowLabelPickerHost`, mounted by `InboxPage`'s body, holds the open state, panel and mutation. A row contributes a `<button>` (`RowAddLabelButton`) naming its message and handing over the anchor element.
- **The panel is portalled and anchored**, like `FilterSimilarPopover`, and keyed by the row so each open starts fresh.
- **No host above means the trigger renders nothing** — mounting a local panel would be the per-row popover this exists to avoid.
- **The row publishes `data-labelling` while its panel is open** and `MessageRowEndCell` reads it, since the portalled panel takes hover and focus off the row and the trigger would otherwise fade out.
- **It heads `MessageActions`' row variant**: read/archive/delete stay last so columns line up from the right; the detail bar is excluded (its trigger is in the header). The mobile swipe strip gets it for free; the end cell's gradient stop is sized to the button count.

`features/labels/rowLabelWiring.test.tsx` mounts the page for real, so trigger, picker and mutation are proven to agree.

## Selecting messages

Multi-select is one hook — `features/select/useSelection.ts`, account-scoped by construction: the key is `account|item`, and only the account half is ever interpreted (the filters page uses it over filter ids). The category select (#146) is `features/select/CategorySelectButton.tsx` in each section header — the three priorities and untriaged.

What a press does is `toggleManySelection`'s decision, taken against the state it writes; `isSelected` is read in the button only to name it, so a stale render can mislabel but never select the wrong messages. The press also enters select mode (`InboxPage`'s `handleToggleCategory` calls `enterSelectMode` beside `toggleMany`).

The button filters `messages` to the section's own `accountId` (never `messages[0]`'s), and hangs off the same `live &&` the flag actions do, so a header exiting during an account switch carries no select.
