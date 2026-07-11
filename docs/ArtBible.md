# Endless Chase — Art Bible (Retro NES / 8-bit)

**Style lock:** Classic **NES-like** chase — limited palette, chunky pixels, unlit flat shading, CRT scanlines. Not GTA photoreal. Not modern PBR.

## Why this works on mobile WebGL

- **320×180** internal render, nearest-neighbor upscale (`image-rendering: pixelated`)
- **MeshBasicMaterial** (unlit) + pixel atlases — no realtime shadows, no PBR
- Procedural CC0 textures in [`docs/assets/nes/`](assets/nes/) (regenerate with `node scripts/gen-nes-textures.mjs`)

## Palette (8-bit constrained)

| Token | Hex |
|-------|-----|
| Navy / sky | `#1D2B53` |
| White | `#FFF1E8` |
| Red | `#FF004D` |
| Orange | `#FFA300` |
| Yellow | `#FFEC27` |
| Green | `#00E436` |
| Forest | `#008751` |
| Asphalt | `#292A32` |
| Gray | `#83769C` |

## Assets

| File | Use |
|------|-----|
| `road.png` | Lane asphalt + dashes |
| `building.png` | City blocks |
| `house.png` | Suburb |
| `car_*.png` | Player / police / civ / truck sprites |
| `coin.png` / `traffic_light.png` | Props |
| `sky.png` | Dome |

**Filters:** `NearestFilter` only. No mipmaps.

## Unity note

For a later Unity NES tier, use Unlit/Texture with point filter and the same PNGs. Prefer `EndlessChase/ToonUnlit` or a simple Unlit over Mobile PBR for this art direction.

## Negatives (AI tools, if regenerating)

photoreal, GTA, PBR, ray tracing, smooth gradients, high-poly, cinematic bloom, muddy brown

## Attribution

Procedural textures: CC0 (see `assets/nes/ATTRIBUTION.txt`). Press Start 2P via Google Fonts.
