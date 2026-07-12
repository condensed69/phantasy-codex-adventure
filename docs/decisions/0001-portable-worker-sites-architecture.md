# ADR 0001: Portable Worker and Sites architecture

## Status

Accepted — 2026-07-11

## Context

The game needs a compact browser runtime, shared scores, GitHub-controlled Cloudflare publication, and a supported ChatGPT Sites path. Maintaining separate game implementations would cause combat, progression, score validation, and art presentation to drift.

## Decision

Use a modular TypeScript application with three layers:

1. A Vite-built browser client using the Canvas 2D and Web Audio platform APIs.
2. A small Worker request handler for run sessions and leaderboard operations.
3. D1 as the single structured storage contract, always exposed as binding `DB`.

Cloudflare serves the Vite output through Worker static assets and routes `/api/*` through the Worker first. ChatGPT Sites uses `.openai/hosting.json` to request its own D1-backed hosted project with the same binding name.

Gameplay rules that the server must verify—especially XP-to-level conversion—live in framework-neutral shared TypeScript modules.

## Consequences

- The browser bundle stays small and avoids a game-engine dependency.
- The same source can be reviewed, tested, and versioned before either hosting surface publishes it.
- Cloudflare and Sites have separate D1 instances unless a future supported integration explicitly connects them. They share a schema and API contract, not implicit data replication.
- The Sites deployment must be created or managed from ChatGPT Work or the desktop app because Sites has no standalone CLI management surface.
