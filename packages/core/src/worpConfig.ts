/**
 * The shape of worp's configuration, and the rules for validating it (#107).
 *
 * A leaf module with no imports, like `credentialProviders.ts` and
 * `claudeUsage.ts`: the Zod request schemas, the settings service and the web
 * UI all need these names and predicates, and a schema module has no business
 * pulling in the db client to get them.
 */

/** Where the base URL lives — not a secret, so it sits in `app_settings`. */
export const WORP_BASE_URL_SETTING = "worp.base_url";

/**
 * Names of worp's two rows in `encrypted_secrets`. Dotted, so they cannot
 * collide with the bare vendor names (`anthropic`, …) sharing that table.
 */
export const WORP_API_KEY_SECRET = "worp.api_key";
export const WORP_EXTRA_HEADERS_SECRET = "worp.extra_headers";

/**
 * The Cloudflare Access service-token headers.
 *
 * Named here only so the UI can offer "behind Cloudflare Access" as a
 * two-field shortcut instead of asking the user to spell these correctly from
 * memory. Nothing downstream treats them specially: they go into the same
 * generic header map as any other proxy's, because CF Access is one proxy
 * among several (Authelia, oauth2-proxy, an mTLS gateway) a self-hoster might
 * put in front of worp.
 */
export const CF_ACCESS_HEADERS = ["CF-Access-Client-Id", "CF-Access-Client-Secret"] as const;

/**
 * A valid HTTP field name per RFC 9110's `token` rule.
 *
 * Checked at save time because a header map is free-form: the value cannot be
 * validated (any string may be a legitimate token) but the name can, and a
 * name with a space or a colon in it would be rejected by `fetch` at relay
 * time — far from where it was typed.
 */
const HTTP_TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

export function isValidHeaderName(name: string): boolean {
  return HTTP_TOKEN.test(name);
}

/**
 * Headers miel sets itself on the ingest request. A map entry naming one of
 * these is refused rather than silently overriding worp's own bearer auth or
 * the multipart boundary.
 */
const RESERVED_HEADERS = new Set(["authorization", "content-type", "content-length", "host"]);

export function isReservedHeaderName(name: string): boolean {
  return RESERVED_HEADERS.has(name.toLowerCase());
}

export type WorpExtraHeaders = Record<string, string>;

/**
 * What a caller may ask to change about the map: a string sets that header, a
 * null removes it, and a name the patch does not mention is left as stored.
 *
 * A patch rather than a replacement because of who does the asking (#119). The
 * settings UI is never given the stored values — it sees names and masked
 * hints — so a replacement would make removing one header mean retyping every
 * other header's secret, and would delete anything added since the page loaded.
 */
export type WorpExtraHeadersPatch = Record<string, string | null>;

export type HeaderMapProblem =
  | { kind: "not_an_object" }
  | { kind: "value_not_a_string"; name: string }
  | { kind: "invalid_name"; name: string }
  | { kind: "reserved_name"; name: string };

function validateHeaderMap(value: unknown, allowNull: boolean): HeaderMapProblem | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { kind: "not_an_object" };
  }
  for (const [name, headerValue] of Object.entries(value)) {
    const ok = typeof headerValue === "string" || (allowNull && headerValue === null);
    if (!ok) return { kind: "value_not_a_string", name };
    if (!isValidHeaderName(name)) return { kind: "invalid_name", name };
    if (isReservedHeaderName(name)) return { kind: "reserved_name", name };
  }
  return null;
}

/**
 * Validate a parsed JSON value as a flat string→string header map — the shape
 * that is stored and sent, where every value is a header value.
 *
 * Returns the problem rather than throwing, so the API route can turn it into
 * a 400 that names the offending header and the UI can point at the field.
 */
export function validateExtraHeaders(value: unknown): HeaderMapProblem | null {
  return validateHeaderMap(value, false);
}

/**
 * The same rules for an incoming {@link WorpExtraHeadersPatch}, where null is
 * an instruction rather than a value. Name checks are unchanged: a removal
 * still has to name a header that could have been stored in the first place.
 */
export function validateExtraHeaderPatch(value: unknown): HeaderMapProblem | null {
  return validateHeaderMap(value, true);
}

/**
 * Apply a patch to the stored map.
 *
 * Matching is case-insensitive because HTTP field names are: leaving `X-A` and
 * `x-a` side by side would send one header whose value depends on iteration
 * order. A patched entry keeps its stored position — the editor lists what it
 * is given, so a save should not reshuffle the rows — but takes the patch's
 * spelling, which is the one the user just typed. Two spellings of one name
 * inside a single patch collapse to the last, as they would at the socket.
 */
export function mergeExtraHeaders(
  stored: WorpExtraHeaders | null,
  patch: WorpExtraHeadersPatch,
): WorpExtraHeaders {
  const byLowerName = new Map(
    Object.entries(patch).map(([name, value]) => [name.toLowerCase(), { name, value }]),
  );
  const merged: WorpExtraHeaders = {};
  const applied = new Set<string>();
  for (const [name, value] of Object.entries(stored ?? {})) {
    const entry = byLowerName.get(name.toLowerCase());
    if (entry === undefined) {
      merged[name] = value;
      continue;
    }
    applied.add(name.toLowerCase());
    if (entry.value !== null) merged[entry.name] = entry.value;
  }
  for (const [lowerName, entry] of byLowerName) {
    if (applied.has(lowerName) || entry.value === null) continue;
    merged[entry.name] = entry.value;
  }
  return merged;
}

/**
 * The outward-safe view of the header map: the names in full, every value
 * masked. The names are shown because a mistyped one is the failure this
 * design accepts (it surfaces at relay time, not at save time), so seeing
 * exactly what will be sent is how a typo gets caught before anything is
 * relayed. The values are secrets — a CF service token is a credential even
 * though it is not worp's.
 */
export interface MaskedHeader {
  name: string;
  valueHint: string;
}
