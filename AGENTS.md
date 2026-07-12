# Phantasy Codex Adventure

## Project contract

- Keep the game keyboard-first and immediately playable in a desktop browser.
- Preserve deterministic generation: identical seeds must create identical terrain and upgrade drafts.
- Keep server and client progression on the shared functions in `src/game/progression.ts`; the Worker remains authoritative for leaderboard level.
- Keep the D1 binding named `DB` in both `wrangler.jsonc` and `.openai/hosting.json`.
- Never trust a client-provided level, duration, or seed when publishing a run.
- Do not add copyrighted game characters, names, sprites, music, or extracted assets.
- Preserve crisp Canvas rendering and respect `prefers-reduced-motion` in the surrounding UI.

## Required checks

```bash
npm test
npm run build
npx wrangler deploy --dry-run
```

For gameplay or layout changes, also validate the title screen and a live run in a real browser.
