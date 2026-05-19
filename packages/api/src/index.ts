import { getEnv } from "@miel/core";
import { createApp } from "./app";

const app = createApp();
const { API_PORT } = getEnv();

const server = Bun.serve({
  port: API_PORT,
  fetch: app.fetch,
});

console.log(`miel api listening on http://localhost:${server.port}`);
