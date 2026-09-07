import { describe, expect, test } from "bun:test";
import { parseCopy, parseStages } from "./dockerfile";

const SAMPLE = `# syntax=docker/dockerfile:1.7
ARG BUN_VERSION=1.3.4

FROM oven/bun:\${BUN_VERSION}-alpine AS builder
WORKDIR /repo
# a comment
COPY package.json bun.lock ./
RUN bun install \\
  --frozen-lockfile

FROM nginx:1.27-alpine AS runner
COPY --from=builder /repo/dist/public /usr/share/nginx/html
EXPOSE 80
`;

describe("parseStages", () => {
  const stages = parseStages(SAMPLE);

  test("splits on FROM and keeps each stage's image and alias", () => {
    expect(stages.map((stage) => stage.image)).toEqual([
      "oven/bun:${BUN_VERSION}-alpine",
      "nginx:1.27-alpine",
    ]);
    expect(stages.map((stage) => stage.alias)).toEqual(["builder", "runner"]);
  });

  test("drops comments and joins continued lines into one instruction", () => {
    const run = stages[0]?.instructions.filter((instruction) => instruction.name === "RUN") ?? [];
    expect(run).toHaveLength(1);
    expect(run[0]?.value).toBe("bun install --frozen-lockfile");
  });

  test("leaves instructions before the first FROM out of every stage", () => {
    const all = stages.flatMap((stage) => stage.instructions.map((i) => i.name));
    expect(all).not.toContain("ARG");
  });
});

describe("parseCopy", () => {
  test("reads the sources and the destination", () => {
    expect(parseCopy("package.json bun.lock ./")).toEqual({
      from: undefined,
      sources: ["package.json", "bun.lock"],
      dest: "./",
    });
  });

  test("reads --from and keeps it off the source list", () => {
    expect(parseCopy("--from=builder /repo/dist/public /usr/share/nginx/html")).toEqual({
      from: "builder",
      sources: ["/repo/dist/public"],
      dest: "/usr/share/nginx/html",
    });
  });

  test("collapses the runs of spaces used to line destinations up", () => {
    expect(parseCopy("packages/core/package.json    packages/core/package.json").sources).toEqual([
      "packages/core/package.json",
    ]);
  });
});
