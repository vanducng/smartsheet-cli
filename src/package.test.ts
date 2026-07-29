import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

describe("package contract", () => {
  it("ships the scoped Node 22 CLI", () => {
    expect(packageJson).toMatchObject({
      name: "@vanducng/smartsheet-cli",
      type: "module",
      bin: { smartsheet: "bin/smartsheet.js" },
      engines: { node: ">=22.12.0" },
      files: ["bin", "docs", "skills", "AGENTS.md", "README.md", "LICENSE"],
      dependencies: { axios: "1.18.1", smartsheet: "5.2.0" },
    });
    expect(packageJson.exports).toBeUndefined();
    expect(packageJson.scripts.build).toContain("--target=node22");
    expect(packageJson.scripts.build).toContain("--packages=external");
    expect(packageJson.scripts.build).toContain("--outfile=bin/smartsheet.js");
  });
});
