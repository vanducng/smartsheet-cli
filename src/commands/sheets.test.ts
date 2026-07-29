import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerSheetCommands } from "./sheets.js";

const { getSmartsheetClient, listSheets, getSheet } = vi.hoisted(() => ({
  getSmartsheetClient: vi.fn(),
  listSheets: vi.fn(),
  getSheet: vi.fn(),
}));

vi.mock("../providers/smartsheet/client.js", () => ({ getSmartsheetClient }));

afterEach(() => {
  process.exitCode = undefined;
  vi.restoreAllMocks();
  getSmartsheetClient.mockReset();
  listSheets.mockReset();
  getSheet.mockReset();
});

function program() {
  const command = new Command();
  registerSheetCommands(command);
  getSmartsheetClient.mockReturnValue({ sheets: { listSheets, getSheet } });
  return command;
}

describe("sheet commands", () => {
  it("registers list and get commands", () => {
    const sheets = program().commands.find(
      (command) => command.name() === "sheets",
    );

    expect(sheets?.commands.map((command) => command.name())).toEqual([
      "list",
      "get",
    ]);
  });

  it("lists one bounded page", async () => {
    listSheets.mockResolvedValue({ data: [{ id: 1 }], pageNumber: 2 });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await program().parseAsync([
      "node",
      "smartsheet",
      "sheets",
      "list",
      "--page",
      "2",
      "--page-size",
      "25",
    ]);

    expect(listSheets).toHaveBeenCalledWith({
      queryParameters: { page: 2, pageSize: 25 },
    });
    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toEqual({
      data: [{ id: 1 }],
      pageNumber: 2,
    });
  });

  it("gets a filtered page without changing IDs", async () => {
    getSheet.mockResolvedValue({ id: 110345791164292, rows: [] });
    const stdout = vi
      .spyOn(process.stdout, "write")
      .mockImplementation(() => true);

    await program().parseAsync([
      "node",
      "smartsheet",
      "sheets",
      "get",
      "110345791164292",
      "--page",
      "3",
      "--page-size",
      "50",
      "--include",
      "objectValue,format",
      "--exclude",
      "filteredOutRows",
      "--row-ids",
      "123,456",
      "--column-ids",
      "789,1011",
    ]);

    expect(getSheet).toHaveBeenCalledWith({
      sheetId: 110345791164292,
      queryParameters: {
        page: 3,
        pageSize: 50,
        include: "objectValue,format",
        exclude: "filteredOutRows",
        rowIds: "123,456",
        columnIds: "789,1011",
      },
    });
    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toEqual({
      id: 110345791164292,
      rows: [],
    });
  });

  it.each([
    ["sheets get invalid", ["sheets", "get", "invalid"]],
    ["page zero", ["sheets", "list", "--page", "0"]],
    ["page too large", ["sheets", "list", "--page-size", "1001"]],
    ["invalid row IDs", ["sheets", "get", "123", "--row-ids", "456,nope"]],
    ["empty include", ["sheets", "get", "123", "--include", "a,,b"]],
    ["blank include", ["sheets", "get", "123", "--include", ""]],
    ["blank exclude", ["sheets", "get", "123", "--exclude", ""]],
    ["blank row IDs", ["sheets", "get", "123", "--row-ids", ""]],
    ["blank column IDs", ["sheets", "get", "123", "--column-ids", ""]],
  ])("rejects %s before an SDK call", async (_name, args) => {
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await program().parseAsync(["node", "smartsheet", ...args]);

    expect(listSheets).not.toHaveBeenCalled();
    expect(getSheet).not.toHaveBeenCalled();
    expect(JSON.parse(String(stderr.mock.calls[0][0])).error.code).toBe(
      "VALIDATION_ERROR",
    );
    expect(process.exitCode).toBe(1);
  });

  it("maps provider failures", async () => {
    listSheets.mockRejectedValue({ statusCode: 404, message: "Not Found" });
    const stderr = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await program().parseAsync(["node", "smartsheet", "sheets", "list"]);

    expect(JSON.parse(String(stderr.mock.calls[0][0])).error.code).toBe(
      "NOT_FOUND",
    );
    expect(process.exitCode).toBe(1);
  });
});
