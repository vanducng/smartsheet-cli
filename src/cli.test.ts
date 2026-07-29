import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json" with { type: "json" };
import { createProgram, run } from "./cli.js";

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
});

describe("smartsheet CLI", () => {
  it("defines the binary identity", () => {
    const program = createProgram();

    expect(program.name()).toBe("smartsheet");
    expect(program.version()).toBe(packageJson.version);
  });

  it.each(["--help", "--version"])(
    "keeps %s human-readable and successful",
    async (flag) => {
      const stdout = vi
        .spyOn(process.stdout, "write")
        .mockImplementation(() => true);
      const stderr = vi
        .spyOn(console, "error")
        .mockImplementation(() => undefined);

      await run(["node", "smartsheet", flag]);

      const output = stdout.mock.calls.map(([value]) => String(value)).join("");
      expect(output).toContain(
        flag === "--help" ? "Usage: smartsheet" : packageJson.version,
      );
      expect(stderr).not.toHaveBeenCalled();
      expect(process.exitCode).toBeUndefined();
    },
  );

  it("returns one structured usage error", async () => {
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const exit = vi
      .spyOn(process, "exit")
      .mockImplementation((() => undefined) as never);

    await run(["node", "smartsheet", "invalid"]);

    expect(stderr).toHaveBeenCalledOnce();
    expect(JSON.parse(String(stderr.mock.calls[0][0]))).toEqual({
      ok: false,
      error: {
        code: "CLI_USAGE_ERROR",
        message: "Unknown command.",
        retryable: false,
        next_steps: ["Run `smartsheet --help` to list valid commands."],
      },
    });
    expect(exit).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("does not run when the entrypoint is imported", async () => {
    const parseAsync = vi.spyOn(Command.prototype, "parseAsync");

    await import("./index.js");

    expect(parseAsync).not.toHaveBeenCalled();
  });
});
