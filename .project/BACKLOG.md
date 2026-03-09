# Backlog — Next Iteration

## Priority Checklist

## Variants

## Technical debt to close
- [ ] Restore reliability for the skipped E2E scenario: `tests/commands/cli.test.ts` — `supports init -> add -> reset -> init cycle`.
- [ ] This test currently times out in some environments during `init`; root cause is still under investigation.
- [ ] Decision target: move to a dedicated slow/integration profile or stabilize the command path and bring it back into the standard suite.
- [ ] Add documentation in test notes about required conditions if test is kept out of smoke path (network + timeout guarantees).
- [ ] `bun run build` can fail in environments where `bun` is available but toolchain dependencies are not installed; keep `npm install` as prerequisite step before local dist build in the runbook.
- [ ] `registry clean --all --dry-run` reports `No generated registry artifacts found` in app repos where only component/library files were installed; decide whether this should be downgraded from "informational" or clarified in docs.

.workflow\registry\ui8kit.map.json