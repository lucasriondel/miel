import { greet } from "@miel/core";

const server = Bun.serve({
  port: 3001,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/") {
      return new Response(greet("api"));
    }
    return new Response("Not Found", { status: 404 });
  },
});

console.log(`API listening on http://localhost:${server.port}`);
