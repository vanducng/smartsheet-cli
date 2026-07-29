# Smartsheet CLI

Agent-friendly CLI for deterministic Smartsheet reads and row writes. It returns one JSON value on successful data commands and one structured JSON error on failure.

## Install

Requires Node.js 22.12 or newer.

```bash
npm install --global @vanducng/smartsheet-cli
smartsheet --version
```

## Configure

```bash
export SMARTSHEET_API_TOKEN=your_api_token
```

`SMARTSHEET_BASE_URL` is optional for official regional API endpoints. The CLI does not store credentials or load `.env` automatically.

## Quick start

```bash
smartsheet sheets list --page-size 25
smartsheet sheets get 1234567890123456 --page-size 100
smartsheet rows add 1234567890123456 --input @rows-to-add.json
smartsheet rows update 1234567890123456 --input @rows-to-update.json
```

Use `smartsheet <command> --help` as the exact command reference. Read [agent usage](docs/agent-usage.md) for schemas, output handling, pagination, safe writes, and troubleshooting. Automated agents should follow the packaged [Smartsheet skill](skills/smartsheet/SKILL.md).

## Develop

```bash
npm ci
npm run format:check
npm run typecheck
npm test
npm run test:package
```

Run `npm run test:live` only with an explicitly designated writable test sheet in `.env`.

MIT. See [LICENSE](LICENSE).
