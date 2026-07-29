import type { Command } from "commander";
import { CliFailure, outputJson, reportError } from "../core/cli-response.js";
import { getSmartsheetClient } from "../providers/smartsheet/client.js";

interface PageOptions {
  page: string;
  pageSize: string;
}

interface GetOptions extends PageOptions {
  include?: string;
  exclude?: string;
  rowIds?: string;
  columnIds?: string;
}

export function registerSheetCommands(program: Command): void {
  const sheets = program
    .command("sheets")
    .description("Read Smartsheet sheets");

  sheets
    .command("list")
    .description("List accessible sheets")
    .option("--page <number>", "Page number", "1")
    .option("--page-size <number>", "Rows per page, maximum 1000", "100")
    .action(async (options: PageOptions) => {
      try {
        const result = await getSmartsheetClient().sheets.listSheets({
          queryParameters: pagination(options),
        });
        outputJson(result);
      } catch (error) {
        reportError(error);
      }
    });

  sheets
    .command("get")
    .description("Get one sheet and a bounded page of rows")
    .argument("<sheet-id>", "Sheet ID")
    .option("--page <number>", "Row page number", "1")
    .option("--page-size <number>", "Rows per page, maximum 1000", "100")
    .option("--include <values>", "Comma-separated include flags")
    .option("--exclude <values>", "Comma-separated exclude flags")
    .option("--row-ids <ids>", "Comma-separated row IDs")
    .option("--column-ids <ids>", "Comma-separated column IDs")
    .action(async (sheetId: string, options: GetOptions) => {
      try {
        const result = await getSmartsheetClient().sheets.getSheet({
          sheetId: id(sheetId, "sheet-id"),
          queryParameters: {
            ...pagination(options),
            ...(options.include !== undefined
              ? { include: csv(options.include, "--include") }
              : {}),
            ...(options.exclude !== undefined
              ? { exclude: csv(options.exclude, "--exclude") }
              : {}),
            ...(options.rowIds !== undefined
              ? { rowIds: ids(options.rowIds, "--row-ids") }
              : {}),
            ...(options.columnIds !== undefined
              ? { columnIds: ids(options.columnIds, "--column-ids") }
              : {}),
          },
        });
        outputJson(result);
      } catch (error) {
        reportError(error);
      }
    });
}

function pagination(options: PageOptions) {
  return {
    page: integer(options.page, "--page"),
    pageSize: integer(options.pageSize, "--page-size", 1000),
  };
}

function integer(
  value: string,
  name: string,
  maximum = Number.MAX_SAFE_INTEGER,
): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new CliFailure(`${name} must be an integer from 1 to ${maximum}.`);
  }
  return parsed;
}

function id(value: string, name: string): number {
  if (!/^\d+$/.test(value)) {
    throw new CliFailure(`${name} must be a positive decimal ID.`);
  }
  return integer(value, name);
}

function ids(value: string, name: string): string {
  return value
    .split(",")
    .map((entry) => String(id(entry.trim(), name)))
    .join(",");
}

function csv(value: string, name: string): string {
  const entries = value.split(",").map((entry) => entry.trim());
  if (entries.some((entry) => !entry)) {
    throw new CliFailure(
      `${name} must be a comma-separated list without empty values.`,
    );
  }
  return entries.join(",");
}
