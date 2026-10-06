# The worp integration

miel can relay a message's PDF attachment to a worp instance for auto-invoice-filing. Its configuration is a runtime setting (#107), split by secrecy: `worp.base_url` in `app_settings`; `worp.api_key` and `worp.extra_headers` in `encrypted_secrets`. `services/worpSettings.ts` hides the split behind one "worp settings" object, `services/encryptedSecrets.ts` stays the only decryptor, and `sendToWorp.ts` the only reader of the plaintext.

The gate is total and up-front: no base URL or no key means `WorpNotConfiguredError` before a socket is opened, answered as `worp_not_configured` (503). That is the fresh-install default; the attachment UI hides the action until the server reports `configured`.

`worp.api_key` is held to the shared `MIN_KEY_LENGTH` (#118), in `UpdateWorpSettingsRequest` and again in the setter (`setSecretEffect`). The empty string is exempt: it means "clear it". `worpSettings.ts` checks before writing anything, so a bad key refuses the whole patch, as an `InvalidWorpSettingsError` with `field: "apiKey"` and the shared `too_short` reason.

`extra_headers` is a generic header-name→value map, not named Cloudflare fields: transport headers for reaching a host behind a proxy (CF Access, Authelia, oauth2-proxy, an mTLS gateway). The UI's "behind Cloudflare Access" shortcut only pre-fills two header names. Header names are validated as HTTP tokens and reserved names refused; `postToWorpIngest` writes `Authorization` last anyway.

`extraHeaders` on the settings PUT is a *patch* (#119): a string sets a header, `null` removes it, an unnamed one is left as stored. The editor only ever sees names and masked hints, so a replacement would make removing one header mean retyping every other secret. `mergeExtraHeaders` in `worpConfig.ts` is the case-insensitive merge, applied inside `encryptedSecrets.ts`. The editor's rules are in `packages/web/src/features/settings/worpHeaderDraft.ts`.
