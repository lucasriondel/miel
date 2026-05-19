import type { MiddlewareHandler } from "hono";
import { getEnv } from "@miel/core";

export function bearerAuth(): MiddlewareHandler {
  return async (c, next) => {
    const { API_SECRET } = getEnv();
    const header = c.req.header("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match || match[1] !== API_SECRET) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  };
}
