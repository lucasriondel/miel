interface GmailUrlInput {
  accountEmail: string;
  gmailMessageId: string;
}

export function buildGmailMessageUrl({ accountEmail, gmailMessageId }: GmailUrlInput): string {
  const authuser = encodeURIComponent(accountEmail);
  const id = encodeURIComponent(gmailMessageId);
  return `https://mail.google.com/mail/?authuser=${authuser}#all/${id}`;
}
