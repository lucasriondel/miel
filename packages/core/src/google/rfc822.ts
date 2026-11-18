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
  /**
   * Blind copy. Written as a header in the raw message, which is how Gmail's
   * send endpoint is told about it: Gmail delivers to these addresses and strips
   * the header from what every recipient receives.
   */
  bcc?: string[];
  /**
   * The From header, already formatted (`Name <address>` or a bare address).
   * Absent lets Gmail use the account's default address; present, it must be
   * one of the account's verified send-as aliases or Gmail rewrites it.
   */
  from?: string;
  /** Subject (caller should already have prefixed "Re: " when replying). */
  subject: string;
  /** Plain-text body. */
  body: string;
  /**
   * An HTML rendering of the same body. With one, the body travels as
   * `multipart/alternative` — what a quoted HTML original needs to survive.
   */
  html?: string;
  /** Files to attach. Any at all makes the message `multipart/mixed`. */
  attachments?: MimeAttachment[];
  /** The original message's Message-ID header value, e.g. "<abc@mail.gmail.com>". */
  inReplyTo?: string;
  /**
   * This message's own Message-ID. Normally Gmail assigns one; a scheduled send
   * writes its own so a retry can ask Gmail whether the first attempt landed.
   */
  messageId?: string;
}

/** One attached file, as the MIME builder needs it. */
export interface MimeAttachment {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

/** RFC 2047 encode a header value if it contains non-ASCII. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

/**
 * An address as a header writes it: the display name quoted (and RFC 2047
 * encoded when it is not ASCII), the address bare.
 */
export function formatAddress(email: string, name?: string | null): string {
  const display = name?.trim();
  if (!display) return email;
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(display)) {
    return `"${display.replace(/["\\]/g, "\\$&")}" <${email}>`;
  }
  return `${encodeHeader(display)} <${email}>`;
}

/** Base64url (no padding) per Gmail's `raw` requirement. */
function base64url(s: string): string {
  return Buffer.from(s, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Base64 wrapped at 76 columns, as a MIME body part carries it. */
function base64Lines(data: Uint8Array | string): string {
  const encoded = (
    typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data)
  ).toString("base64");
  return encoded.replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

/** A quoted-string parameter value, RFC 2047-encoded when it is not ASCII. */
function paramValue(value: string): string {
  return `"${encodeHeader(value).replace(/["\\]/g, "_")}"`;
}

/** A fresh, unguessable multipart boundary. */
const newBoundary = () => `miel_${crypto.randomUUID().replace(/-/g, "")}`;

/** A text part of a multipart body — base64, so no line can outgrow SMTP's limit. */
function textPart(contentType: string, content: string): string {
  return [
    `Content-Type: ${contentType}; charset="UTF-8"`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(content),
  ].join("\r\n");
}

/** Join parts under a boundary, closing delimiter included. */
function multipart(boundary: string, parts: string[]): string {
  return `${parts.map((p) => `--${boundary}\r\n${p}`).join("\r\n")}\r\n--${boundary}--`;
}

/** The text of a message: plain alone, or plain + HTML as alternatives. */
function bodyEntity(input: Rfc822Input): { headers: string[]; content: string } {
  if (input.html === undefined) {
    return {
      headers: ['Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: 8bit"],
      content: input.body,
    };
  }
  const boundary = newBoundary();
  return {
    headers: [`Content-Type: multipart/alternative; boundary="${boundary}"`],
    content: multipart(boundary, [
      textPart("text/plain", input.body),
      textPart("text/html", input.html),
    ]),
  };
}

function attachmentPart(file: MimeAttachment): string {
  const mimeType = /^[\w.+-]+\/[\w.+-]+$/.test(file.mimeType)
    ? file.mimeType
    : "application/octet-stream";
  return [
    `Content-Type: ${mimeType}; name=${paramValue(file.filename)}`,
    `Content-Disposition: attachment; filename=${paramValue(file.filename)}`,
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(file.data),
  ].join("\r\n");
}

/**
 * The full MIME message as text — what Gmail's media upload takes, and what
 * {@link buildRawMessage} base64url-encodes for the JSON `raw` field.
 *
 * A message with no HTML and no attachment is the single `text/plain` part it
 * always was; an HTML body makes it `multipart/alternative`; any attachment
 * wraps that in `multipart/mixed`.
 */
export function buildMimeMessage(input: Rfc822Input): string {
  const headers: string[] = [
    ...(input.from ? [`From: ${input.from}`] : []),
    `To: ${input.to.join(", ")}`,
    // An empty Cc header is not the same as no Cc header — some servers reject
    // it — so the line only exists when there is an address on it.
    ...(input.cc && input.cc.length > 0 ? [`Cc: ${input.cc.join(", ")}`] : []),
    ...(input.bcc && input.bcc.length > 0 ? [`Bcc: ${input.bcc.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    ...(input.messageId ? [`Message-ID: ${input.messageId}`] : []),
    "MIME-Version: 1.0",
  ];
  const body = bodyEntity(input);
  const attachments = input.attachments ?? [];
  let entityHeaders: string[];
  let content: string;
  if (attachments.length === 0) {
    entityHeaders = body.headers;
    content = body.content;
  } else {
    const boundary = newBoundary();
    entityHeaders = [`Content-Type: multipart/mixed; boundary="${boundary}"`];
    content = multipart(boundary, [
      `${body.headers.join("\r\n")}\r\n\r\n${body.content}`,
      ...attachments.map(attachmentPart),
    ]);
  }
  headers.push(...entityHeaders);
  if (input.inReplyTo) {
    headers.push(`In-Reply-To: ${input.inReplyTo}`);
    headers.push(`References: ${input.inReplyTo}`);
  }
  return `${headers.join("\r\n")}\r\n\r\n${content}`;
}

/** Construct the base64url `raw` value for a reply or a new message. */
export function buildRawMessage(input: Rfc822Input): string {
  return base64url(buildMimeMessage(input));
}
