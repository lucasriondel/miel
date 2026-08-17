import type { MiddlewareHandler } from "hono";
import { createDebug } from "@miel/core";

const debug = createDebug("api:http");

export const requestLog = (): MiddlewareHandler => async (c, next) => {
  const start = performance.now();
  await next();
  const ms = Math.round(performance.now() - start);
  const line = `${c.req.method} ${c.req.path} ${c.res.status} ${ms}ms`;

  if (c.res.status >= 500) debug.error(line);
  else if (c.res.status >= 400) debug.warn(line);
  else debug.info(line);
};
