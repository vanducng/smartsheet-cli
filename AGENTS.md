# Smartsheet CLI agent guide

## Project

This repository builds the `@vanducng/smartsheet-cli` package and the `smartsheet` binary. Use [skills/smartsheet/SKILL.md](skills/smartsheet/SKILL.md) when operating the CLI or building automation around it.

## Repository map

- `src/commands/` - Commander command registration and validation
- `src/core/` - JSON argument and response contracts
- `src/smartsheet.ts` - official SDK configuration
- `scripts/` - isolated package and authorized live smoke tests
- `docs/` - durable agent operating guidance
- `skills/` - packaged agent skill
- `.github/workflows/` - CI and release automation

## Development contract

- Require Node.js 22.12 or newer and use `npm ci` for reproducible installs.
- Keep the Smartsheet SDK behind `src/smartsheet.ts` and pin it exactly.
- Validate every argument before a provider request.
- Keep data-command stdout to one JSON value and failures to one redacted JSON value on stderr.
- Keep reads bounded and writes sequential, with no automatic write retry.
- Use generated `--help` as the exact command and flag reference.
- Do not add importable library exports; this package is a CLI.
- Add no code comments unless a hidden constraint would surprise a future reader.
- Never manually edit generated files or `CHANGELOG.md`.

## Validation

```bash
npm ci
npm run format:check
npm run typecheck
npm test
npm audit --audit-level=low
npm run test:package
```

Run `npm run test:live` only when `.env` contains an explicitly designated writable `SMARTSHEET_SHEET_ID`. The smoke may create, update, verify, and delete only its uniquely marked row. Never print or commit `.env` values.

## Release

Use Conventional Commits. Release Please owns version, changelog, tag, and GitHub Release creation. Do not edit package versions or `CHANGELOG.md` manually. npm publication must use the exact tarball built and tested by the release workflow.
