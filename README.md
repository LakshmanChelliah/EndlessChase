# Endless Chase

8-bit getaway endless runner — **City / Rural / Highway** biomes.  
City is **4 lanes** (2 opposing); rural is **2-way**; highway is **2 one-way**.  
**WebGL-first** for mobile browsers; Unity C# systems included for later iOS.

**Art direction:** Retro **NES-like** — limited palette, pixel textures, CRT scanlines, 320×180 nearest-neighbor upscale.

## Play

**Live:** https://lakshmanchelliah.github.io/EndlessChase/

```bash
npx --yes serve docs -p 4173
```

Swipe / A·D for lanes (inverted); swipe down to brake, swipe up to speed up.

## Repo layout

| Path | Purpose |
|------|---------|
| `Assets/Scripts/` | Unity C# gameplay systems |
| `docs/` | Playable NES WebGL client + art docs (GitHub Pages) |
| `docs/js/` | Modular client (constants, save, pool, NES meshes) |
| `docs/assets/nes/` | Procedural CC0 pixel textures |
| `scripts/gen-nes-textures.mjs` | Regenerate NES PNG atlas set |

## Controls

- **Swipe** left/right / **A·D** — lanes (inverted: swipe left steers right)  
- **Swipe down** / **S** — brake and stay slow until **swipe up** / **W** / Space  
- Turn cues — swipe L/R onto an on-ramp to switch biomes  
- Red light fast — NOS + heat + cross traffic; brake through red to stay cooler  
- Play / Retry / Garage — UI  

## Art

See [docs/ArtBible.md](docs/ArtBible.md). Regenerate textures:

```bash
npm i pngjs
node scripts/gen-nes-textures.mjs
```
