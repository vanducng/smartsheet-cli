import type { Command } from "commander";
import {
  CliFailure,
  outputJson,
  reportWriteError,
} from "../core/cli-response.js";
import { loadJsonArg } from "../core/json-arg.js";
import { getSmartsheetClient } from "../smartsheet.js";

interface WriteOptions {
  input: string;
}

export function registerRowCommands(program: Command): void {
  const rows = program.command("rows").description("Write Smartsheet rows");

  rows
    .command("add")
    .description("Add rows in one bulk request")
    .argument("<sheet-id>", "Sheet ID")
    .requiredOption("--input <json|@path>", "Non-empty JSON array of rows")
    .action(async (sheetId: string, options: WriteOptions) => {
      try {
        const result = await getSmartsheetClient().sheets.addRows({
          sheetId: id(sheetId),
          body: body(options.input, false),
        });
        outputJson(result);
      } catch (error) {
        reportWriteError(error);
      }
    });

  rows
    .command("update")
    .description("Update rows in one bulk request")
    .argument("<sheet-id>", "Sheet ID")
    .requiredOption(
      "--input <json|@path>",
      "Non-empty JSON array of rows with IDs",
    )
    .action(async (sheetId: string, options: WriteOptions) => {
      try {
        const result = await getSmartsheetClient().sheets.updateRow({
          sheetId: id(sheetId),
          body: body(options.input, true),
        });
        outputJson(result);
      } catch (error) {
        reportWriteError(error);
      }
    });
}

function body(value: string, requireIds: boolean): Record<string, unknown>[] {
  const parsed = loadJsonArg(value, "--input");
  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new CliFailure(
      "--input must contain a non-empty JSON array of rows.",
    );
  }
  if (parsed.length > 500) {
    throw new CliFailure("--input cannot contain more than 500 rows.");
  }

  for (const [index, row] of parsed.entries()) {
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      throw new CliFailure(`--input row ${index} must be a JSON object.`);
    }
    if (requireIds) {
      const rowId = (row as Record<string, unknown>).id;
      if (!Number.isSafeInteger(rowId) || Number(rowId) < 1) {
        throw new CliFailure(
          `--input row ${index}.id must be a positive safe integer.`,
        );
      }
    }
  }

  return parsed as Record<string, unknown>[];
}

function id(value: string): number {
  if (!/^\d+$/.test(value)) {
    throw new CliFailure("sheet-id must be a positive decimal ID.");
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new CliFailure("sheet-id must be a positive safe integer.");
  }
  return parsed;
}
