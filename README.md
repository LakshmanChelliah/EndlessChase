# Endless Chase

3D endless runner (Subway Surfers–style lane switching + Temple Run–style procedural biomes).  
**WebGL-first** for mobile browsers; Unity C# systems included for later iOS port.

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
| `Assets/Shaders/EndlessChaseToonUnlit.shader` | Mobile Unlit cel shader |
| `Assets/WebGLTemplates/EndlessChase/` | Browser-safe touch template |
| `docs/` | Playable Three.js WebGL client **and** art bible / build docs (GitHub Pages `/docs`) |

> Unity 2022.3 LTS + URP is the target for a native Unity WebGL binary. Until you build in Hub/GameCI, `docs/` is the shippable Pages build and mirrors the same gameplay systems.

## Controls

- **Swipe** left/right (touch) or **A/D** / arrows — lanes  
- **Play / Retry / Upgrades** — UI  
- Run a **red light** for a speed boost (cross-traffic risk)

## Save data

Versioned JSON in `localStorage` / Unity `PlayerPrefs` key `EndlessChase.Save.v1` (WebGL → IndexedDB). Same schema for iOS later.

## Art

See [docs/ArtBible.md](docs/ArtBible.md), [docs/ArtPrompts_Meshy.md](docs/ArtPrompts_Meshy.md), [docs/ArtPrompts_ImageGen.md](docs/ArtPrompts_ImageGen.md).

## Unity WebGL settings

See [docs/WebGLBuildSettings.md](docs/WebGLBuildSettings.md) (Gzip + Decompression Fallback for Pages).
