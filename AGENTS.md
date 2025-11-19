# Agent Guidance

This file applies to the entire repository (`/workspace/Test1`) and all nested paths unless a more specific `AGENTS.md` overrides it.

## Coding Standards
- Follow idiomatic Go style (Go fmt and lint guidelines). Use clear naming and keep functions focused.
- Avoid unnecessary complexity; prefer straightforward control flow and small, testable units.
- Keep imports organized; do not wrap imports in try/catch blocks.
- Document non-obvious logic with brief comments. Favor GoDoc-style comments for exported identifiers.

## Testing Expectations
- Add or update unit tests alongside code changes when feasible.
- Run `go test ./...` before committing and report results in the PR message.
- If tests are not run, explain why in the PR message.

## PR Message Format
- Summary bullet list of notable changes.
- Testing section listing commands executed and outcomes.
- Mention any known limitations or follow-ups.

## Go Development Notes
- Ensure modules stay tidy; run `go mod tidy` when dependencies change.
- Prefer standard library solutions before adding new dependencies. If adding dependencies, justify the need in the PR message.
- Keep `main` package focused on wiring; place reusable logic in separate packages when possible.

## Scope
These instructions cover all files and directories within this repository unless superseded by a nested `AGENTS.md`.
