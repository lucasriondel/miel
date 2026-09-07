import { Data } from "effect";

export class AccountNotFoundError extends Data.TaggedError("AccountNotFoundError")<{
  email: string;
}> {}

export class LabelSyncError extends Data.TaggedError("LabelSyncError")<{
  accountEmail: string;
  cause: unknown;
}> {}

export class MessageSearchError extends Data.TaggedError("MessageSearchError")<{
  accountEmail: string;
  cause: unknown;
}> {}

export { ShellError } from "../../adapters/shell";
