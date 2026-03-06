# UI8KIT CLI Improvement Roadmap

## Scope

This document defines a practical improvement roadmap for the **ui8kit CLI** with focus on long-term maintainability, reliable automation, and realistic adoption by one maintainer.

### Working principles

- Prioritize reliability and predictability over feature volume.
- Keep behavior stable for existing users; avoid breaking changes unless explicitly versioned.
- Keep every new feature covered by tests at command level or integration level.
- Prefer incremental value: each iteration should reduce production risk.

## 1) Testing and Quality Roadmap

### Stage A — Immediate Stabilization (next 1–2 iterations)

1. Test Harness Consolidation
  - Create shared helpers in `tests/helpers/cli.ts` and `tests/helpers/fs.ts`.
  - Standardize temporary project setup, CLI execution, and fixture cleanup.
  - Make environment isolation explicit (`HOME`, `USERPROFILE`, `XDG_CACHE_HOME` if used).
  - Acceptance: all e2e tests use one helper pattern and setup/teardown is consistent.
2. Assertion Hardening
  - Replace brittle full-string assertions with marker-based checks (`Usage:`, command name, exit code, key message fragments).
  - Avoid dependence on exact formatting that may change with Commander updates.
  - Acceptance: low flakiness in help/error tests.
3. Additional e2e Negative Scenarios
  - Add tests for:
    - `build` with malformed `registry.json` (invalid JSON / missing required fields).
    - `build` with invalid or inaccessible output directory.
    - `diff` on empty project (no local components detected).
    - `scan` with empty project root.
    - `info --json` with corrupted cache metadata.
  - Acceptance: each scenario returns predictable status and actionable message.
4. Test Documentation
  - Keep `tests/README.md` aligned with current test intent and assumptions.
  - Each command should list:
    - positive path,
    - negative path,
    - exit-code expectations,
    - JSON contract assumptions.

### Stage B — Deterministic Unit Coverage (2–3 iterations)

1. Registry and Network Layer
  - Add unit tests for:
    - CDN fallback behavior.
    - `--no-cache` semantics.
    - TTL expiration / stale cache handling.
    - Partial CDN failure tolerance.
  - Acceptance: command behavior remains stable under network variability.
2. Cache Layer
  - Add tests for cache key generation, TTL boundaries, missing cache, and repeatable clear behavior.
  - Acceptance: cache clear/list operations are deterministic and safe.
3. Error and Logging Model
  - Add tests for:
    - typed errors (`Ui8kitError`),
    - validation errors (`ZodError`),
    - generic JS errors,
    - verbose mode output shape.
  - Acceptance: one predictable error policy across commands.
4. Transform and Diff Utilities
  - Add edge-case coverage:
    - alias values without `/`*,
    - multiple import rewrites in one file,
    - conflicting alias patterns.
  - Acceptance: no regressions in import rewriting and file comparison.

### Stage C — CI-Ready Integration Reliability (1–2 iterations)

1. CLI Automation Modes
  - Introduce/define JSON contract for commands used in scripts (`info`, `list`, optionally `scan`, `diff`).
  - Add tests in e2e for machine-readable outputs.
  - Acceptance: outputs remain parseable and stable in CI.
2. Runtime Resilience Scenarios
  - Add tests that run commands under constrained environments:
    - missing home dir variable,
    - malformed local config,
    - read-only output directories.
  - Acceptance: failures are clear and actionable, not stack-trace-only.
3. Coverage Policy
  - New CLI behavior must include at least:
    - one unit test,
    - one e2e/integration test,
    - corresponding README entry.
  - Acceptance: no feature shipped without this triad.

## 2) CLI Capability Roadmap

### Stage A — User-Facing Reliability

1. `init`
  - Keep scriptable mode fully predictable (`--yes`).
  - Harden missing/invalid config behavior with explicit recovery hints.
  - Acceptance: non-interactive initialization works in CI and local scripts.
2. `add`
  - Keep progress indicator reliable for batch installs (`[n/total]`).
  - Add `--force` and `--skip-existing` semantics.
  - Acceptance: command is idempotent and predictable in repeated runs.
3. `scan`
  - Keep output deterministic (ordering + stable file discovery).
  - Add optional JSON output for automation.
  - Add explicit ignore patterns in docs and defaults.
  - Acceptance: scan can be used in CI checks.
4. `build`
  - Add pre-validate mode for input registry.
  - Add summary report: total / processed / skipped.
  - Acceptance: users can trust build output and quickly diagnose broken registry files.
5. `diff`
  - Provide machine-readable output (`--json`) for pipeline usage.
  - Add `--fail-on-diff` mode for gating.
  - Acceptance: safe for automated checks.
6. `cache`
  - Add `cache status` (entries count, cache age, estimated size).
  - Keep clear command safe for already-empty cache directories.
  - Acceptance: no ambiguity in cache lifecycle.

### Stage B — Operational Improvements

1. Command Contracts

- For each public command, document:
  - exit codes,
  - JSON schema (if supported),
  - failure classes.

1. Error UX

- Standard message style:
  - action, cause, and next step.
- Acceptance: troubleshooting time reduced by explicit next actions.

1. Compatibility

- Introduce minor version policy and changelog discipline.
- Deprecate flags/features with a warning window.

## 3) Delivery Plan

1. Iteration 1 (next): Stage A of Testing + selected Stage A of CLI reliability.
2. Iteration 2: Stage B of Testing + `diff`/`scan` JSON modes.
3. Iteration 3: Stage B of CLI capabilities + cache/status.
4. Iteration 4+: harden based on production usage and real failure logs.

## 4) Success Criteria

1. Every command path has explicit expected behavior for:
  - normal execution,
  - no-op/empty data,
  - invalid input.
2. e2e test set has predictable runtime and low flake rate.
3. `npm run test` and CLI smoke checks pass on Windows and Unix-like environments.

