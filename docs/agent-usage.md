# Agent usage

## Runtime contract

- Data commands write exactly one compact JSON value to stdout and keep stderr empty on success.
- Failures write exactly one JSON object to stderr, set a nonzero exit status, and keep stdout empty.
- `--help` and `--version` are human-readable discovery output.
- Provider responses are returned without a CLI envelope. Parse their current Smartsheet shape.
- Errors use `{ "ok": false, "error": { "code", "message", "retryable", "next_steps" } }`.

Parse stdout only after a zero exit status. On failure, follow `next_steps` in order and retry only when `retryable` is `true`.

## Configuration

`SMARTSHEET_API_TOKEN` is required. `SMARTSHEET_BASE_URL` is optional and accepts only these HTTPS API v2 endpoints:

- `https://api.smartsheet.com/2.0`
- `https://api.smartsheet.eu/2.0`
- `https://api.smartsheet.au/2.0`
- `https://api.smartsheetgov.com/2.0`

The CLI reads the process environment only. It does not persist credentials or load `.env`. Never print, log, commit, or place a token in command arguments.

## Discover commands

```bash
smartsheet --help
smartsheet sheets --help
smartsheet sheets get --help
smartsheet rows add --help
smartsheet rows update --help
```

Generated help is the exact flag reference.

## Read sheets

List accessible sheets with an explicit page size:

```bash
smartsheet sheets list --page 1 --page-size 25
```

Read a bounded sheet page:

```bash
smartsheet sheets get 1234567890123456 --page 1 --page-size 100
```

Limit the returned rows or columns when their IDs are known:

```bash
smartsheet sheets get 1234567890123456 \
  --page-size 25 \
  --row-ids 1111111111111111,2222222222222222 \
  --column-ids 3333333333333333,4444444444444444
```

`--include` and `--exclude` accept non-empty comma-separated Smartsheet flags. Page numbers start at 1 and page size is limited to 1000. Pagination is explicit so an agent controls request count and context size.

## Add rows

Writes require a non-empty JSON array with at most 500 row objects. Prefer `@file` input so quoting and review are predictable.

```json
[
  {
    "toBottom": true,
    "cells": [
      { "columnId": 3333333333333333, "value": "New row" },
      { "columnId": 4444444444444444, "value": "Ready" }
    ]
  }
]
```

```bash
smartsheet rows add 1234567890123456 --input @rows-to-add.json
```

Inline JSON is also accepted:

```bash
smartsheet rows add 1234567890123456 \
  --input '[{"toBottom":true,"cells":[{"columnId":3333333333333333,"value":"New row"}]}]'
```

## Update rows

Each update object must contain a positive row `id`. The same 500-row maximum applies.

```json
[
  {
    "id": 1111111111111111,
    "cells": [{ "columnId": 4444444444444444, "value": "Complete" }]
  }
]
```

```bash
smartsheet rows update 1234567890123456 --input @rows-to-update.json
```

The CLI performs one bulk API request per add or update command. It does not parallelize writes, retry writes automatically, expose deletion, or provide a dry run.

## Safe mutation workflow

1. Obtain explicit authorization for the target sheet and requested write.
2. Read the target rows and columns with the smallest useful page or ID filters.
3. Build and inspect a non-empty JSON array of no more than 500 rows.
4. Apply one add or update command.
5. Capture row IDs from the provider result.
6. Read those rows back with `--row-ids` and `--column-ids` and compare the requested values.

If a write reports that its result could not be confirmed, inspect current sheet state before retrying. A network failure can occur after Smartsheet committed the write, so a blind retry can duplicate rows.

## Troubleshooting

- `CONFIG_ERROR`: follow `next_steps` to set the token or correct an unsupported `SMARTSHEET_BASE_URL`.
- `AUTHENTICATION_FAILED`: replace the configured token without displaying it.
- `PERMISSION_DENIED`: verify the account can access and edit the target sheet.
- `NOT_FOUND`: verify the sheet, row, and column IDs.
- `RATE_LIMITED`: wait for the ordered `next_steps` interval before retrying.
- `VALIDATION_ERROR`: correct the local input before making another request.
- `PROVIDER_ERROR` or `UNEXPECTED_ERROR` after a write: reconcile the sheet first.

Smartsheet IDs must be positive decimal JavaScript safe integers. Use generated help to correct command or flag errors.
