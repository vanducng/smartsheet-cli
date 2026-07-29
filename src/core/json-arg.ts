import { readFileSync } from "node:fs";
import { CliFailure } from "./cli-response.js";

export function loadJsonArg(value: string, flagName: string): unknown {
  if (!value) {
    throw new CliFailure(`${flagName} requires JSON or @path.`);
  }

  let input = value;
  if (value.startsWith("@")) {
    const path = value.slice(1);
    if (!path) throw new CliFailure(`${flagName} requires a path after @.`);
    try {
      input = readFileSync(path, "utf8");
    } catch {
      throw new CliFailure(`${flagName} could not read the JSON file.`);
    }
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch {
    throw new CliFailure(`${flagName} must contain valid JSON.`);
  }

  if (parsed === null || typeof parsed !== "object") {
    throw new CliFailure(`${flagName} must contain a JSON object or array.`);
  }
  return parsed;
}
