# ui8kit CLI — project hub (`.project`)

**Status as of 2026-08-11:** CLI **`ui8kit@2.0.1`** published on npm. Registry **`@ui8kit/registry@2.0.0`** published with digest under `/r`. Consumer smoke done on `@TestApp` (Vite + Bun + Svelte).

**Decision:** further CLI refactoring is **deferred** until the next brainstorm. We already have a usable CDN of primitives + utils and can work against it with documented workarounds.

| Doc | Purpose |
|-----|---------|
| [status.md](./status.md) | What works today, versions, smoke results |
| [architecture.md](./architecture.md) | Product model, layers, data flow |
| [ecosystem.md](./ecosystem.md) | Sibling repos, CDN URLs, local paths |
| [known-issues.md](./known-issues.md) | Confirmed consumer bugs (P0–P2) with code pointers |
| [refactor-backlog.md](./refactor-backlog.md) | Deferred refactor agenda for next brainstorm |
| [decisions.md](./decisions.md) | Design decisions to avoid overengineering |
| [journal.md](./journal.md) | Chronological log of what happened |
| [anti-overengineering.md](./anti-overengineering.md) | Wall between primitives and the rest |

If chat context is lost: start with **status → known-issues → architecture → refactor-backlog**.
