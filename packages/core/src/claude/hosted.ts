/**
 * The hosted transport — one schema-constrained generation over HTTP through
 * the Vercel ai-sdk, against Anthropic, Google or OpenAI (#105).
 *
 * The vendor differs only in which ai-sdk factory builds the model handle; the
 * task differs only in its Schema, its system prompt and a one-line
 * instruction. Everything else is shared, including the two failure rules: any
 * vendor failure becomes a `HostedApiError` with the key scrubbed out, and a
 * payload the Schema refuses becomes a `HostedApiError` too — the model broke
 * its contract, which is reported as the vendor call having failed, exactly as
 * it always was.
 *
 * This used to live in `ai-task-runner-effect`; it came back into core when
 * the CLI transport moved to `effect-ai-claude-code` (an `effect/ai`
 * `LanguageModel`) and the runner's one hosted-vs-CLI `if` became `Claude.ts`'s
 * own. The three vendors stay on the ai-sdk because Effect v4 ships no Google
 * provider.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, jsonSchema } from "ai";
import { Effect, Redacted, Schema } from "effect";
import type { CredentialProvider } from "../credentialProviders";
import { HostedApiError } from "../errors";
import type { ClaudeRunResult } from "./Claude";

/**
 * The one HTTP call, as a function — the transport's seam. The default
 * ({@link generateHostedLive}) is the real ai-sdk; a test hands the service a
 * fake through `_setHostedGenerateForTests` and asserts what reached it. It
 * resolves to the raw object payload, decoded by the caller: keeping ai-sdk
 * types out of the signature is what makes a fake three lines.
 */
export type HostedGenerate = (args: {
  readonly vendor: CredentialProvider;
  readonly modelId: string;
  readonly apiKey: string;
  readonly system: string;
  readonly prompt: string;
  /** The task's JSON Schema, verbatim — `unknown` because ai-sdk only forwards it. */
  readonly jsonSchema: unknown;
  /** Aborted when the run is interrupted — a draft the user stopped. */
  readonly signal?: AbortSignal;
}) => Promise<unknown>;

/**
 * The vendor's model handle. A switch rather than a lookup table: the three
 * factories take vendor-specific settings objects that no shared signature
 * describes without widening all of them.
 */
const createModel = (vendor: CredentialProvider, apiKey: string, modelId: string) => {
  switch (vendor) {
    case "anthropic":
      return createAnthropic({ apiKey })(modelId);
    case "google":
      return createGoogleGenerativeAI({ apiKey })(modelId);
    case "openai":
      return createOpenAI({ apiKey })(modelId);
  }
};

/** The real ai-sdk call. The task's JSON Schema is handed over verbatim. */
export const generateHostedLive: HostedGenerate = async (args) => {
  const model = createModel(args.vendor, args.apiKey, args.modelId);
  const result = await generateObject({
    model,
    system: args.system,
    prompt: args.prompt,
    schema: jsonSchema(args.jsonSchema as Parameters<typeof jsonSchema>[0]),
    abortSignal: args.signal,
  });
  return result.object;
};

/**
 * The task's Schema as the JSON Schema a vendor is handed.
 *
 * Closed objects (`additionalProperties: false`, every property required) on
 * purpose: that is what the Zod-derived schema used to say, and it is what
 * OpenAI's strict structured-output mode demands of a schema before it will
 * accept one. The decoder stays lenient about extra keys, so the stricter
 * document can only make the vendor's answer more conformant, never refuse a
 * conformant one.
 */
export const hostedJsonSchema = (schema: Schema.Top): Record<string, unknown> => {
  const document = Schema.toJsonSchemaDocument(schema, { onExcessProperty: "error" });
  const definitions =
    Object.keys(document.definitions).length > 0 ? { $defs: document.definitions } : {};
  return { ...document.schema, ...definitions };
};

/**
 * Vendor SDKs quote what they were handed, credentials included, so the key is
 * scrubbed from any message before it becomes a `HostedApiError`.
 */
const redact = (detail: string, apiKey: string): string =>
  apiKey.length > 0 ? detail.split(apiKey).join("«redacted»") : detail;

/** One generation against one vendor, decoded through the task's Schema. */
export const runHosted = <Output>(args: {
  readonly vendor: CredentialProvider;
  readonly modelId: string;
  readonly system: string;
  readonly instruction: string;
  readonly output: Schema.Codec<Output, Record<string, unknown>, never, never>;
  readonly apiKey: Redacted.Redacted<string>;
  readonly generate: HostedGenerate;
}): Effect.Effect<ClaudeRunResult<Output>, HostedApiError> =>
  Effect.gen(function* () {
    // Unwrapped here and nowhere else: the call that spends it, and the scrub
    // that keeps it out of the error it might come back quoted in.
    const apiKey = Redacted.value(args.apiKey);
    const payload = yield* Effect.tryPromise({
      // The signal Effect hands the promise is aborted when the fiber is
      // interrupted, so a stopped draft stops the vendor request with it.
      try: (signal) =>
        args.generate({
          signal,
          vendor: args.vendor,
          modelId: args.modelId,
          apiKey,
          system: args.system,
          prompt: args.instruction,
          jsonSchema: hostedJsonSchema(args.output),
        }),
      catch: (err) =>
        new HostedApiError({
          detail: redact(err instanceof Error ? err.message : String(err), apiKey),
        }),
    });
    const output = yield* Schema.decodeUnknownEffect(args.output)(payload).pipe(
      Effect.mapError((err) => new HostedApiError({ detail: redact(err.message, apiKey) })),
    );
    return {
      output,
      runId: `hosted-${args.vendor}-${Date.now()}`,
      model: args.modelId,
    };
  });
