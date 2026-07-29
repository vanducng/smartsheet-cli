import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CliFailure } from "./cli-response.js";
import { loadJsonArg } from "./json-arg.js";

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("JSON arguments", () => {
  it.each([
    ['{"name":"row"}', { name: "row" }],
    ["[1,2]", [1, 2]],
  ])("parses inline JSON", (input, expected) => {
    expect(loadJsonArg(input, "--input")).toEqual(expected);
  });

  it("reads JSON from @path", () => {
    const directory = mkdtempSync(join(tmpdir(), "smartsheet-cli-json-"));
    directories.push(directory);
    const path = join(directory, "rows.json");
    writeFileSync(path, '[{"cells":[]}]');

    expect(loadJsonArg(`@${path}`, "--input")).toEqual([{ cells: [] }]);
  });

  it.each(["", "@", "@missing.json", "not-json", "null", "true", "1", '"x"'])(
    "rejects invalid input %j",
    (input) => {
      expect(() => loadJsonArg(input, "--input")).toThrow(CliFailure);
    },
  );
});
