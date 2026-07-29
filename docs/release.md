# Release and npm publication

Release Please is the only version, changelog, tag, and GitHub Release authority. Conventional Commits determine release intent. Before 1.0, breaking changes produce a minor release.

## GitHub prerequisites

Install a GitHub App on `vanducng/smartsheet-cli` with repository contents, issues, and pull-request write access, then configure these Actions secrets:

- `GH_APP_CLIENT_ID`
- `GH_APP_MUNMIU_PRIVATE_KEY`

Create the `npm` GitHub environment. The release workflow uses the App token to open a release PR, waits for the Node 22 and 24 CI checks, and squash-merges only that checked head.

## npm trusted publisher

Configure the npm package `@vanducng/smartsheet-cli` with this trusted publisher:

- Organization or user: `vanducng`
- Repository: `smartsheet-cli`
- Workflow filename: `release-please.yml`
- Environment: `npm`
- Allowed operation: the `publish` job runs `npm publish` only after Release Please reports a created release and the validation job uploads the tested tarball

The workflow requests `id-token: write` only in the environment-protected publish job. It does not use or require a long-lived npm token.

## Initial package publication

If npm requires the scoped package to exist before trusted publishing can be configured, perform one authenticated bootstrap from the exact locally tested artifact:

```bash
npm ci
npm run format:check
npm run typecheck
npm test
npm audit --audit-level=low
npm run build
TARBALL="$(npm pack --ignore-scripts)"
node scripts/smoke-package.mjs "./${TARBALL}"
npm publish --dry-run --ignore-scripts "./${TARBALL}"
npm publish --access public --ignore-scripts "./${TARBALL}"
```

Use interactive `npm login` for that one publication, then log out and configure the trusted publisher before the next release. Never add an npm token to the repository or workflow.

## Automated release flow

1. A conventional commit reaches `main`.
2. Release Please opens or updates its release PR.
3. The workflow waits for both CI matrix jobs and merges the exact green head.
4. The resulting run creates the tag and GitHub Release.
5. The validation job checks tag, version, ancestry, formatting, types, tests, audit, and build.
6. The validation job packs once, smoke-installs and dry-runs that tarball, then uploads it.
7. The environment-protected publish job downloads the same tarball, publishes through OIDC, and verifies the registry version with bounded retries.

Do not edit `package.json` version, `.release-please-manifest.json`, release tags, or `CHANGELOG.md` manually.
