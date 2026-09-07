/**
 * Build a base64url-encoded RFC 822 message for `users.messages.send`.
 *
 * Gmail's send endpoint takes a `raw` field: the full MIME message, base64url
 * encoded. For a reply to stay in-thread, the message must carry `In-Reply-To`
 * and `References` headers pointing at the original's `Message-ID`, and the send
 * call must pass the same `threadId`. The threading headers are what Gmail (and
 * every other mail client) uses to group the conversation — get them wrong and
 * the reply starts a new thread.
 */
export interface Rfc822Input {
  /** Recipient addresses. */
  to: string[];
  /** Carbon-copy addresses, editable from the compose window (#96). */
  cc?: string[];
  /** Subject (caller should already have prefixed "Re: " when replying). */
  subject: string;
  /** Plain-text body. */
  body: string;
  /** The original message's Message-ID header value, e.g. "<abc@mail.gmail.com>". */
  inReplyTo?: string;
}

/** RFC 2047 encode a header value if it contains non-ASCII. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/** Base64url (no padding) per Gmail's `raw` requirement. */
function base64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Construct the base64url `raw` value for a (reply) message. */
export function buildRawMessage(input: Rfc822Input): string {
  const headers: string[] = [
    `To: ${input.to.join(", ")}`,
    // An empty Cc header is not the same as no Cc header — some servers reject
    // it — so the line only exists when there is an address on it.
    ...(input.cc && input.cc.length > 0 ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
  ];
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`);
    headers.push(`References: ${input.inReplyTo}`);
  }
  const message = `${headers.join("\r\n")}\r\n\r\n${input.body}`;
  return base64url(message);
}
