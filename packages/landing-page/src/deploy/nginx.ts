/**
 * Just enough of an nginx config reader for the serving contract to be asserted
 * on the config files themselves rather than on a copy of their text.
 *
 * Two server configs decide whether the path split works: this package's
 * `nginx.conf` (the public pages) and the app's `packages/web/nginx.conf
 * .template` (the SPA under `/app` plus the same-origin `/api` proxy). Neither
 * can be exercised here — there is no nginx and no Docker daemon in CI — so the
 * next best thing is to ask the file which location answers a given request,
 * using nginx's own precedence rules, and assert on that.
 *
 * Deliberately small: directives and blocks, `#` comments dropped. It does not
 * understand quoting around `;` or `{`, which neither config uses.
 */

export type NginxDirective = { name: string; value: string };

/** A `location` block: its modifier (`""` for a plain prefix) and its match. */
export type NginxLocation = {
  modifier: "" | "=" | "~" | "~*" | "^~";
  pattern: string;
  directives: NginxDirective[];
};

export type NginxServer = {
  /** Directives written at server level, i.e. outside every `location`. */
  directives: NginxDirective[];
  /** The `location` blocks, in the order the file lists them. */
  locations: NginxLocation[];
};

type Node = NginxDirective & { children?: Node[] };

const MODIFIERS = ["=", "~*", "~", "^~"] as const;

function stripComments(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/#.*$/, ""))
    .join("\n");
}

function asDirective(text: string): NginxDirective {
  const collapsed = text.trim().replace(/\s+/g, " ");
  const space = collapsed.indexOf(" ");
  if (space === -1) return { name: collapsed, value: "" };
  return { name: collapsed.slice(0, space), value: collapsed.slice(space + 1) };
}

/** Directives and blocks up to the `}` that closes the enclosing one. */
function parseNodes(text: string, from: number): { nodes: Node[]; end: number } {
  const nodes: Node[] = [];
  let buffer = "";
  let index = from;

  while (index < text.length) {
    const character = text[index]!;
    if (character === ";") {
      if (buffer.trim().length > 0) nodes.push(asDirective(buffer));
      buffer = "";
      index += 1;
    } else if (character === "{") {
      const inner = parseNodes(text, index + 1);
      nodes.push({ ...asDirective(buffer), children: inner.nodes });
      buffer = "";
      index = inner.end;
    } else if (character === "}") {
      return { nodes, end: index + 1 };
    } else {
      buffer += character;
      index += 1;
    }
  }

  return { nodes, end: index };
}

/** The `server` block of a config, split into its directives and locations. */
export function parseServer(conf: string): NginxServer {
  const { nodes } = parseNodes(stripComments(conf), 0);
  const server = nodes.find((node) => node.name === "server");
  if (!server?.children) throw new Error("no server block");

  const directives: NginxDirective[] = [];
  const locations: NginxLocation[] = [];

  for (const node of server.children) {
    if (node.name !== "location") {
      if (!node.children) directives.push({ name: node.name, value: node.value });
      continue;
    }
    const modifier = MODIFIERS.find((candidate) => node.value.startsWith(`${candidate} `)) ?? "";
    locations.push({
      modifier,
      pattern: node.value.slice(modifier.length).trim(),
      directives: (node.children ?? []).map((child) => ({ name: child.name, value: child.value })),
    });
  }

  return { directives, locations };
}

type Block = { directives: NginxDirective[] };

/** Every value a directive was given, in order. Empty if it was never written. */
export function valuesOf(block: Block, name: string): string[] {
  return block.directives
    .filter((directive) => directive.name === name)
    .map((directive) => directive.value);
}

/** A directive's value, or `undefined` if the config does not set it. */
export function valueOf(block: Block, name: string): string | undefined {
  return valuesOf(block, name)[0];
}

/**
 * Which location answers a request for `path`, by nginx's rules: an exact `=`
 * match wins outright; otherwise the longest matching prefix is remembered, and
 * unless it is marked `^~` the regex locations are tried in file order before
 * falling back to it.
 */
export function locationFor(server: NginxServer, path: string): NginxLocation | undefined {
  const exact = server.locations.find(
    (location) => location.modifier === "=" && location.pattern === path,
  );
  if (exact) return exact;

  let longestPrefix: NginxLocation | undefined;
  for (const location of server.locations) {
    if (location.modifier !== "" && location.modifier !== "^~") continue;
    if (!path.startsWith(location.pattern)) continue;
    if (!longestPrefix || location.pattern.length > longestPrefix.pattern.length) {
      longestPrefix = location;
    }
  }
  if (longestPrefix?.modifier === "^~") return longestPrefix;

  const matched = server.locations.find((location) => {
    if (location.modifier !== "~" && location.modifier !== "~*") return false;
    return new RegExp(location.pattern, location.modifier === "~*" ? "i" : "").test(path);
  });

  return matched ?? longestPrefix;
}
