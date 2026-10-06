# Message detail: compose, attachments, viewing preferences

## The compose window

Replying is a floating window (#96): docked bottom-right at `z-[80]`, collapsible to its title bar. `features/compose/*` is the window — `ComposeWindow`, title bar, To/Cc/Subject header, body, footer, plus the pure `recipients.ts` (one text field per address list, parsed but never rewritten under the caret) and `composeWindowState.ts` — and none of it knows a message is being answered. `features/reply/*` is the reply: prefilled recipients and subject (`replyDefaults.ts`), the AI instruction section, and the two mutations. A future blank Compose mounts the same shell with an empty form.

The window's state is derived: `composeWindowMode(intent, draft)` folds intent with "is there anything unsent", so a window holding a draft cannot fall shut. Minimize is exempt — it is an explicit request to keep the draft out of the way. The body is unmounted while minimized, which is safe because `ReplyComposer` controls every field.

To and Cc are editable end to end: `SendReplyRequest` takes optional `to`/`cc`, `services/replyRecipients.ts` decides between what was typed and the default (the sender), and `rfc822.ts` writes a `Cc` header when there is one. Optional because the CLI names neither.

## Attachments

Attachments sit *under* the message (#143): `features/message-detail/MessageAttachmentsSection.tsx`, a heading and one `AttachmentRow` per file, rendering nothing when there are none. The header's badge row is labels and suggestions only, and its draw condition has no attachment clause.

The actions are written once: `components/useAttachmentActions.ts` holds the two requests, the shared busy flag and whether worp may be offered (file type *and* worp configured); `components/AttachmentMenuContent.tsx` is the menu both faces open. The inbox row keeps the compact `MessageAttachments` → `AttachmentPill` (capped at three with `+n`); the detail page mounts full-width rows. A new face reuses both.

`api/downloadAttachment.ts` calls `fetch` itself rather than `apiFetch` (it wants the blob and an `<a download>` click), so a suite exercising it stubs `fetch` *and* the client.

## Viewing preferences

The theme and remote-image loading are per-browser (#149) — no schema, endpoint or migration — and share Settings' General card (`features/settings/GeneralCard.tsx`).

`features/preferences/remoteImages.ts` holds the storage key, the default, a reader that treats anything unrecognised as the default, and a `useSyncExternalStore` hook over a listener set, so the settings row and an open message body agree. The default is **show**, unlike Gmail and Apple Mail — a remote image is the standard read receipt, and the product decision is to pay that price by default. That is why the hide path stays; keep it.

In `MessageDetailBody`: under *show* there is no per-message remote-images toggle; under *hide* `stripRemoteImages` blanks the `http(s)` sources and the toggle opts one message in. Inline `data:` and `cid:` images are never stripped. The frame's image `load`/`error` listeners size it once images arrive.
