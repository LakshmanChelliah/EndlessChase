# Endless Chase

8-bit getaway endless runner — swipe lanes, outrun cops, blow red lights for boost.  
**WebGL-first** for mobile browsers; Unity C# systems included for later iOS.

**Art direction:** Retro **NES-like** — limited palette, pixel textures, CRT scanlines, 320×180 nearest-neighbor upscale. (Not Fake GTA / photoreal.)

## Play

**Live:** https://lakshmanchelliah.github.io/EndlessChase/

```bash
npx --yes serve docs -p 4173
```

Swipe or A/D to change lanes.

## Repo layout

| Path | Purpose |
|------|---------|
| `Assets/Scripts/` | Unity C# gameplay systems |
| `docs/` | Playable NES WebGL client + art docs (GitHub Pages) |
| `docs/assets/nes/` | Procedural CC0 pixel textures |
| `scripts/gen-nes-textures.mjs` | Regenerate NES PNG atlas set |

## Controls

- Swipe / A·D — lanes  
- Play / Retry / Garage — UI  
- Red light — boost (cross-traffic risk)

## Art

See [docs/ArtBible.md](docs/ArtBible.md). Regenerate textures:

```bash
npm i pngjs
node scripts/gen-nes-textures.mjs
```
