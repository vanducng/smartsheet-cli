import { randomUUID } from "node:crypto";
import { withPackedCli } from "./smoke-package.mjs";

class SmokeFailure extends Error {}

async function main() {
  const token = required("SMARTSHEET_API_TOKEN");
  const sheetId = required("SMARTSHEET_SHEET_ID");
  if (
    !/^\d+$/.test(sheetId) ||
    !Number.isSafeInteger(Number(sheetId)) ||
    Number(sheetId) < 1
  ) {
    fail("SMARTSHEET_SHEET_ID must be a positive safe decimal ID.");
  }
  const baseUrl = apiBase(process.env.SMARTSHEET_BASE_URL);
  const marker = `smartsheet-cli-smoke-${randomUUID()}`;
  let rowId;
  let operationError;

  try {
    await withPackedCli(
      async ({ cli }) => {
        const sheet = invoke(cli, [
          "sheets",
          "get",
          sheetId,
          "--page-size",
          "1",
        ]);
        const primaryColumn = sheet.columns?.find((column) => column.primary);
        if (!Number.isSafeInteger(primaryColumn?.id)) {
          fail("The test sheet has no usable primary column.");
        }

        const added = invoke(cli, [
          "rows",
          "add",
          sheetId,
          "--input",
          JSON.stringify([
            {
              toBottom: true,
              cells: [{ columnId: primaryColumn.id, value: marker }],
            },
          ]),
        ]);
        rowId = added.result?.[0]?.id;
        if (!Number.isSafeInteger(rowId)) {
          fail("The add response did not contain a row ID.");
        }

        const updatedMarker = `${marker}-updated`;
        invoke(cli, [
          "rows",
          "update",
          sheetId,
          "--input",
          JSON.stringify([
            {
              id: rowId,
              cells: [{ columnId: primaryColumn.id, value: updatedMarker }],
            },
          ]),
        ]);
        const readBack = invoke(cli, [
          "sheets",
          "get",
          sheetId,
          "--page-size",
          "1",
          "--row-ids",
          String(rowId),
          "--column-ids",
          String(primaryColumn.id),
        ]);
        const value = readBack.rows?.[0]?.cells?.find(
          (cell) => cell.columnId === primaryColumn.id,
        )?.value;
        if (value !== updatedMarker) {
          fail("The updated row could not be verified.");
        }
      },
      {
        SMARTSHEET_API_TOKEN: token,
        ...(process.env.SMARTSHEET_BASE_URL
          ? { SMARTSHEET_BASE_URL: process.env.SMARTSHEET_BASE_URL }
          : {}),
      },
    );
  } catch (error) {
    operationError = error;
  }

  const cleanupError = await cleanup({
    baseUrl,
    marker,
    rowId,
    sheetId,
    token,
    recover: operationError !== undefined && rowId === undefined,
  });
  if (cleanupError) fail(cleanupError);
  if (operationError) throw operationError;

  console.log("Live smoke: PASS (read, add, update, read-back, cleanup)");
}

function invoke(cli, args) {
  const result = cli(args);
  if (result.status !== 0 || result.stderr !== "") {
    fail(`Installed CLI command failed: ${args.slice(0, 2).join(" ")}.`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`Installed CLI returned invalid JSON: ${args.slice(0, 2).join(" ")}.`);
  }
}

async function cleanup({ baseUrl, marker, recover, rowId, sheetId, token }) {
  let rowIds = rowId === undefined ? [] : [rowId];
  if (recover) {
    try {
      rowIds = await findMarkerRows(baseUrl, marker, sheetId, token);
    } catch {
      return `Cleanup could not locate marker ${marker} in sheet ${sheetId}. Delete any row with that exact marker before rerunning.`;
    }
  }
  if (rowIds.length === 0) return;

  try {
    const response = await fetch(
      `${baseUrl}/sheets/${sheetId}/rows?ids=${rowIds.join(",")}&ignoreRowsNotFound=true`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (response.ok) return;
  } catch {}

  return `Cleanup failed for created row ${rowIds.join(",")} in sheet ${sheetId}. Delete only those rows before rerunning.`;
}

async function findMarkerRows(baseUrl, marker, sheetId, token) {
  const rowIds = [];
  const pageSize = 500;
  for (let page = 1; ; page += 1) {
    const response = await fetch(
      `${baseUrl}/sheets/${sheetId}?page=${page}&pageSize=${pageSize}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (!response.ok) throw new Error("Sheet recovery read failed.");
    const sheet = await response.json();
    if (!Array.isArray(sheet.rows)) {
      throw new Error("Sheet recovery response was invalid.");
    }
    if (!Number.isSafeInteger(sheet.totalRowCount) || sheet.totalRowCount < 0) {
      throw new Error("Sheet recovery row count was invalid.");
    }
    for (const row of sheet.rows) {
      if (
        Number.isSafeInteger(row.id) &&
        row.cells?.some(
          (cell) => cell.value === marker || cell.value === `${marker}-updated`,
        )
      ) {
        rowIds.push(row.id);
      }
    }
    if (page * pageSize >= sheet.totalRowCount) return rowIds;
  }
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`${name} is required.`);
  return value;
}

function apiBase(value) {
  let url;
  try {
    url = new URL(value ?? "https://api.smartsheet.com/2.0");
  } catch {
    fail("SMARTSHEET_BASE_URL must be an approved Smartsheet API v2 endpoint.");
  }
  const hosts = new Set([
    "api.smartsheet.com",
    "api.smartsheet.eu",
    "api.smartsheet.au",
    "api.smartsheetgov.com",
  ]);
  if (
    url.protocol !== "https:" ||
    !hosts.has(url.hostname) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/2\.0\/?$/.test(url.pathname)
  ) {
    fail("SMARTSHEET_BASE_URL must be an approved Smartsheet API v2 endpoint.");
  }
  return url.href.replace(/\/$/, "");
}

function fail(message) {
  throw new SmokeFailure(message);
}

await main().catch((error) => {
  console.error(
    error instanceof SmokeFailure ? error.message : "Live smoke failed.",
  );
  process.exitCode = 1;
});
