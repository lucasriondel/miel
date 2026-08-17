/**
 * Just enough of a Dockerfile reader for the container contract to be asserted
 * on the file itself rather than on a copy of its text in a test.
 *
 * The two images this package cares about are the one it ships (`Dockerfile`
 * here) and the app's (`packages/web/Dockerfile`), which must stay free of any
 * landing-page content. Both promises are about *which* instructions are there
 * — what gets copied in, what the install is filtered to, what the final stage
 * is — so the check needs the instructions, not the bytes.
 */

export type DockerInstruction = { name: string; value: string };

export type DockerStage = {
  /** The image the stage builds on, `${ARG}` references left as written. */
  image: string;
  /** The `AS <alias>` name, if the stage has one. */
  alias?: string;
  instructions: DockerInstruction[];
};

export type DockerCopy = {
  /** The `--from=` stage, if the copy pulls out of an earlier one. */
  from?: string;
  sources: string[];
  dest: string;
};

/** Instructions in order, comments dropped and continued lines joined. */
export function parseInstructions(text: string): DockerInstruction[] {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const joined: string[] = [];
  let pending = "";
  for (const line of lines) {
    if (line.endsWith("\\")) {
      pending += `${line.slice(0, -1).trim()} `;
      continue;
    }
    joined.push(`${pending}${line}`.trim());
    pending = "";
  }
  if (pending.length > 0) joined.push(pending.trim());

  return joined.map((line) => {
    const space = line.search(/\s/);
    if (space === -1) return { name: line.toUpperCase(), value: "" };
    return {
      name: line.slice(0, space).toUpperCase(),
      value: line.slice(space + 1).trim(),
    };
  });
}

/**
 * The build stages, in order. Instructions before the first `FROM` (the global
 * `ARG` block, the syntax directive) belong to no stage and are left out.
 */
export function parseStages(text: string): DockerStage[] {
  const stages: DockerStage[] = [];

  for (const instruction of parseInstructions(text)) {
    if (instruction.name === "FROM") {
      const [image, as, alias] = instruction.value.split(/\s+/);
      stages.push({
        image: image ?? "",
        alias: as?.toUpperCase() === "AS" ? alias : undefined,
        instructions: [],
      });
      continue;
    }
    stages.at(-1)?.instructions.push(instruction);
  }

  return stages;
}

/** A `COPY` instruction's argument list: flags, sources, destination. */
export function parseCopy(value: string): DockerCopy {
  const words = value.split(/\s+/).filter((word) => word.length > 0);
  const from = words.find((word) => word.startsWith("--from="))?.slice("--from=".length);
  const paths = words.filter((word) => !word.startsWith("--"));

  return { from, sources: paths.slice(0, -1), dest: paths.at(-1) ?? "" };
}

/** Every `COPY` in a stage, parsed. */
export function copiesIn(stage: DockerStage): DockerCopy[] {
  return stage.instructions
    .filter((instruction) => instruction.name === "COPY")
    .map((instruction) => parseCopy(instruction.value));
}
