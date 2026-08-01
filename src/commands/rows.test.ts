import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerRowCommands } from "./rows.js";

const { getSmartsheetClient, addRows, updateRow } = vi.hoisted(() => ({
  getSmartsheetClient: vi.fn(),
  addRows: vi.fn(),
  updateRow: vi.fn(),
}));

vi.mock("../smartsheet.js", () => ({ getSmartsheetClient }));

const directories: string[] = [];

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  getSmartsheetClient.mockReset();
  addRows.mockReset();
  updateRow.mockReset();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function program() {
  const command = new Command();
  registerRowCommands(command);
  getSmartsheetClient.mockReturnValue({ sheets: { addRows, updateRow } });
  return command;
}

describe("row commands", () => {
  it("registers add and update commands", () => {
    const rows = program().commands.find(
      (command) => command.name() === "rows",
    );

    expect(rows?.commands.map((command) => command.name())).toEqual([
      "add",
      "update",
    ]);
  });

  it("adds rows in one bulk request", async () => {
    const input = [{ toBottom: true, cells: [{ columnId: 1, value: "new" }] }];
    addRows.mockResolvedValue({ message: "SUCCESS", result: input });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await program().parseAsync([
      "node",
      "smartsheet",
      "rows",
      "add",
      "110345791164292",
      "--input",
      JSON.stringify(input),
    ]);

    expect(addRows).toHaveBeenCalledOnce();
    expect(addRows).toHaveBeenCalledWith({
      sheetId: 110345791164292,
      body: input,
    });
    expect(JSON.parse(String(stdout.mock.calls[0][0])).message).toBe("SUCCESS");
  });

  it("updates rows from @path in one bulk request", async () => {
    const directory = mkdtempSync(join(tmpdir(), "smartsheet-cli-rows-"));
    directories.push(directory);
    const path = join(directory, "rows.json");
    const input = [{ id: 123, cells: [{ columnId: 1, value: "updated" }] }];
    writeFileSync(path, JSON.stringify(input));
    updateRow.mockResolvedValue({ message: "SUCCESS", result: input });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await program().parseAsync([
      "node",
      "smartsheet",
      "rows",
      "update",
      "110345791164292",
      "--input",
      `@${path}`,
    ]);

    expect(updateRow).toHaveBeenCalledOnce();
    expect(updateRow).toHaveBeenCalledWith({
      sheetId: 110345791164292,
      body: input,
    });
    expect(JSON.parse(String(stdout.mock.calls[0][0])).result).toEqual(input);
  });

  it.each([
    ["invalid sheet ID", ["rows", "add", "invalid", "--input", "[{}]"]],
    ["empty array", ["rows", "add", "123", "--input", "[]"]],
    ["scalar", ["rows", "add", "123", "--input", "1"]],
    ["array row", ["rows", "add", "123", "--input", "[[]]"]],
    ["missing update ID", ["rows", "update", "123", "--input", "[{}]"]],
    [
      "unsafe update ID",
      ["rows", "update", "123", "--input", '[{"id":9007199254740992}]'],
    ],
  ])("rejects %s before an SDK call", async (_name, args) => {
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await program().parseAsync(["node", "smartsheet", ...args]);

    expect(addRows).not.toHaveBeenCalled();
    expect(updateRow).not.toHaveBeenCalled();
    expect(JSON.parse(String(stderr.mock.calls[0][0])).error.code).toBe(
      "VALIDATION_ERROR",
    );
    expect(process.exitCode).toBe(1);
  });

  it("maps provider failures without a second write", async () => {
    addRows.mockRejectedValue({ statusCode: 403, message: "Forbidden" });
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await program().parseAsync([
      "node",
      "smartsheet",
      "rows",
      "add",
      "123",
      "--input",
      "[{}]",
    ]);

    expect(addRows).toHaveBeenCalledOnce();
    expect(JSON.parse(String(stderr.mock.calls[0][0])).error).toMatchObject({
      code: "PERMISSION_DENIED",
      retryable: false,
    });
  });

  it("accepts 500 rows and rejects 501 before a write", async () => {
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const rows = Array.from({ length: 500 }, () => ({}));
    addRows.mockResolvedValue({ message: "SUCCESS" });

    await program().parseAsync([
      "node",
      "smartsheet",
      "rows",
      "add",
      "123",
      "--input",
      JSON.stringify(rows),
    ]);
    expect(addRows).toHaveBeenCalledOnce();
    expect(stdout).toHaveBeenCalledOnce();

    addRows.mockClear();
    await program().parseAsync([
      "node",
      "smartsheet",
      "rows",
      "add",
      "123",
      "--input",
      JSON.stringify([...rows, {}]),
    ]);
    expect(addRows).not.toHaveBeenCalled();
    expect(JSON.parse(String(stderr.mock.calls[0][0])).error.code).toBe(
      "VALIDATION_ERROR",
    );
  });

  it("requires reconciliation after an ambiguous transport failure", async () => {
    addRows.mockRejectedValue(new Error("socket closed"));
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await program().parseAsync([
      "node",
      "smartsheet",
      "rows",
      "add",
      "123",
      "--input",
      "[{}]",
    ]);

    expect(addRows).toHaveBeenCalledOnce();
    expect(JSON.parse(String(stderr.mock.calls[0][0])).error).toMatchObject({
      retryable: false,
      next_steps: [
        "Check the current sheet state before deciding whether to retry.",
      ],
    });
  });
});
