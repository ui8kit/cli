# Backlog (pointer)

> This file previously held mixed test-debt notes. **Authoritative deferred work** for CLI consumer fixes lives in:

- [refactor-backlog.md](./refactor-backlog.md) — next brainstorm agenda (utils/deps, paths, e2e)
- [known-issues.md](./known-issues.md) — confirmed defects with code pointers
- [status.md](./status.md) — what is shipped / paused

## Legacy test debt (still valid, lower priority than P0 consumer bugs)

- [ ] Stabilize or quarantine skipped e2e: `tests/commands/cli.test.ts` init→add→reset cycle timeout
- [ ] Document network/timeout assumptions if kept out of default smoke
- [ ] Clarify `registry clean` messaging when only installed app files exist (no generated author artifacts)

Do **not** treat this file as the refactor plan.
