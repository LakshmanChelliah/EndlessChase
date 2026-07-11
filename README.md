# Endless Chase

3D endless runner — getaway car vs police through procedural City / Suburb / Highway biomes.  
**WebGL-first** for mobile browsers; Unity C# systems included for later iOS port.

**Art direction:** Fake GTA V — gritty Los Santos golden-hour look via **Mobile PBR**, baked AO in atlases, and one directional sun (no heavy realtime shadows).

## Play

**Live:** https://lakshmanchelliah.github.io/EndlessChase/

Local preview:

```bash
npx --yes serve docs -p 4173
```

Open `http://localhost:4173` — swipe / A·D to change lanes.

## Repo layout

| Path | Purpose |
|------|---------|
| `Assets/Scripts/` | Production Unity C# (input, player, pool, level, traffic, risk/reward, save, UI) |
| `Assets/Shaders/EndlessChaseMobilePBR.shader` | Mobile PBR (Fake GTA) |
| `Assets/Shaders/EndlessChaseToonUnlit.shader` | Deprecated arcade cel path |
| `Assets/WebGLTemplates/EndlessChase/` | Browser-safe touch template |
| `docs/` | Playable Three.js client + art bible / build docs (GitHub Pages `/docs`) |

> Unity 2022.3 LTS + URP for a native Unity WebGL binary. Until Hub/GameCI builds it, `docs/` is the shippable Pages client.

## Controls

- **Swipe** left/right (touch) or **A/D** / arrows — lanes  
- **Play / Retry / Garage** — UI  
- Run a **red light** for NOS boost (cross-traffic risk)

## Save data

Versioned JSON in `localStorage` / Unity `PlayerPrefs` key `EndlessChase.Save.v1` (WebGL → IndexedDB).

## Art

Fake GTA V pipeline: [docs/ArtBible.md](docs/ArtBible.md), [docs/ArtPrompts_Meshy.md](docs/ArtPrompts_Meshy.md), [docs/ArtPrompts_ImageGen.md](docs/ArtPrompts_ImageGen.md).

## Unity WebGL settings

See [docs/WebGLBuildSettings.md](docs/WebGLBuildSettings.md) — **Linear** color space, Gzip + Decompression Fallback, shadows off.
