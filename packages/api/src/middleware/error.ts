import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { ReauthRequiredError, ShellError } from "@miel/core";

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  if (err instanceof ZodError) {
    return c.json(
      { error: "validation_failed", issues: err.issues },
      400,
    );
  }
  if (err instanceof ReauthRequiredError) {
    return c.json(
      {
        error: "reauth_required",
        account: err.account,
        message: err.message,
      },
      409,
    );
  }
  if (err instanceof ShellError) {
    return c.json(
      {
        error: "shell_error",
        message: err.message,
        stderr: err.stderr,
        exitCode: err.exitCode,
      },
      502,
    );
  }
  const message = err instanceof Error ? err.message : "internal_error";
  console.error("[api error]", err);
  return c.json({ error: "internal_error", message }, 500);
};
