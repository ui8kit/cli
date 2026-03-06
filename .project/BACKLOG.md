# Backlog — Next Iteration

## Priority Checklist

## Technical debt to close
- [ ] Restore reliability for the skipped E2E scenario: `tests/commands/cli.test.ts` — `supports init -> add -> reset -> init cycle`.
- [ ] This test currently times out in some environments during `init`; root cause is still under investigation.
- [ ] Decision target: move to a dedicated slow/integration profile or stabilize the command path and bring it back into the standard suite.
- [ ] Add documentation in test notes about required conditions if test is kept out of smoke path (network + timeout guarantees).

