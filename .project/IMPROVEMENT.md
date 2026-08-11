# Improvement roadmap (superseded pointer)

> Older long-form testing/quality roadmap lived here. It remains useful for harness polish but is **not** the active plan after the 2026-08-11 CDN smoke.

**Active sources of truth:**

| Need | Doc |
|------|-----|
| Current ship state | [status.md](./status.md) |
| How the system fits together | [architecture.md](./architecture.md) |
| Bugs found on TestApp | [known-issues.md](./known-issues.md) |
| What to discuss / implement next | [refactor-backlog.md](./refactor-backlog.md) |
| Avoid scope creep | [anti-overengineering.md](./anti-overengineering.md) |
| ADRs | [decisions.md](./decisions.md) |

## Still-relevant improvement themes (parked under P0 fixes)

1. Shared test helpers (`tests/helpers/cli.ts`) and less brittle assertions  
2. Deterministic CDN/cache unit tests  
3. Machine-readable JSON contracts for CI (`info`, `list`)  
4. Opt-in live-registry e2e (after utils/paths hotfix)

Do not expand feature volume until P0 consumer path is honest.
