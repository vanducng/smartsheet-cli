---
description: Smartsheet CLI runtime, release, and review contracts.
alwaysApply: true
context_files:
  - "AGENTS.md"
---
# Smartsheet CLI review context

- Data commands write one compact JSON value to stdout on success. Failures write one redacted JSON value to stderr, leave stdout empty, and exit nonzero.
- Validate all arguments before any provider request. Smartsheet IDs must be decimal safe integers, reads must stay bounded, and writes must be sequential with no automatic retry.
- Keep the official Smartsheet SDK behind `src/providers/smartsheet/`. API base URL overrides must remain explicitly allowlisted, and secrets must never be logged or committed.
- A write with an ambiguous result requires reconciliation before retrying so agents cannot duplicate mutations.
- Release Please owns package versions, changelog entries, tags, and GitHub releases. npm must publish the exact tarball that passed validation.
- `vanducng/miu-cr@main` is an intentional mutable reference to an owned project. Do not report that reference alone as a supply-chain defect.
