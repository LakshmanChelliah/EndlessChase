# Endless Chase

8-bit endless-runner driving game. See `README.md` for gameplay/controls and repo layout.

## Cursor Cloud specific instructions

The runnable, testable product is the **static WebGL/JS client in `docs/`** (plain ES modules, no build step). The `Assets/` folder is Unity C# source for a future iOS port and is **not** built or run here (no Unity Editor installed).

### Services / commands
- Dev server: `npm run serve` (runs `npx serve docs -p 4173`). This is a static file server; edits under `docs/` are picked up on browser reload (no hot-reload/watch).
- Smoke test (the project's automated test): `npm run smoke` (runs `node scripts/smoke.mjs http://localhost:4173`). The dev server must already be running on port 4173. Prints `SMOKE_OK ...` on success. `npm run smoke:live` targets the deployed GitHub Pages URL instead.
- There is no linter and no build step for the JS client.

### Non-obvious notes
- The smoke test uses Playwright's Chromium; the browser binary is required (installed via `npx playwright install chromium`). This is separate from `npm install` and is not automatically refreshed by installing node deps.
- `package-lock.json` is git-ignored, so `npm install` (not `npm ci`) is the correct install command.
- The game exposes a debug handle on `window.__endlessChase` and persists progress to `localStorage` under `EndlessChase.Save.v1`.
- Texture regeneration (`node scripts/gen-nes-textures.mjs`) needs `pngjs` (`npm i pngjs`) and is only for regenerating the procedural NES PNG atlas, not for normal development.
