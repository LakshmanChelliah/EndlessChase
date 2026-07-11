# Endless Chase — Art Bible

**Style lock:** Vibrant low-poly arcade. Hard-edge faceting, saturated controlled palette, **no PBR**, painted lighting in atlas. Readable from chase cam ~15–25 m on mobile WebGL.

## Master palette

| Token | Hex | Use |
|-------|-----|-----|
| Asphalt | `#2B2F3A` | Road surface |
| Lane | `#F5E6A8` | Lane dashes / markings |
| Curb | `#C4C8D0` | Curbs, rails |
| CityAccent | `#FF4D6D` | City signage / trim |
| SuburbGreen | `#3DDC97` | Lawns, trees |
| HighwayBlue | `#4CC9F0` | Gantries / signs |
| Police | `#1D4ED8` + `#F8FAFC` | Cruiser |
| Player | `#FFB703` + `#FB8500` | Hero car |
| Coin | `#FFE66D` | Collectibles |
| RedLight | `#EF233C` | Signal red |
| GreenLight | `#06D6A0` | Signal green |
| SkyBandA | `#7BDFF2` | Sky top |
| SkyBandB | `#FFCAD4` | Sky horizon |

## Poly budgets

| Asset class | Max tris |
|-------------|----------|
| Vehicles | ≤1,500 each |
| Road tile shell | ≤800 |
| Roadside prop | 200–400 |
| Traffic light | ≤300 |
| Coin / VFX | ≤120 |

## UV / atlas

- Single 0–1 unwrap per mesh; 4–8 px padding
- One shared **1024²** atlas `Atlas_EndlessChase.png` (fallback 512²)
- Base color only (optional 1-bit opacity). No normal/metal/rough/AO

### Packing

```
[0–512, 512–1024]   vehicles
[512–1024, 512–1024] road / lane / curb / crosswalk
[0–512, 0–512]      biome props + lights + coins
[512–1024, 0–512]   UI icons + fx colors
```

Import: Bilinear or Point, sRGB, max 1024, ASTC 6×6 / ETC2.

## Tile contract

- Length **20 m** (+Z), width **12 m**
- Lane centers X = **−3.2, 0, 3.2**
- Origin at tile start centerline; road Y = 0
- One material: `M_Atlas` / `EndlessChase/ToonUnlit`

## Shader

Use `Assets/Shaders/EndlessChaseToonUnlit.shader`:

- Atlas `_BaseMap` + `_BaseColor`
- Constant fake light dir → 2–3 cel bands (`floor(N·L * bands) / bands`)
- Vertex color multiply
- GPU Instancing on
- Materials: `M_Atlas_Master`, `M_Atlas_Player`, `M_Atlas_Police`

### Shader Graph mirror (URP Unlit)

1. Sample Texture 2D → Multiply Color → Multiply Vertex Color  
2. Normalize Normal WS · Normalize LightDir → Saturate  
3. Multiply by Bands → Floor → Divide by Bands → Lerp(0.55, 1)  
4. Multiply into albedo → Fragment Base Color  

## Negative prompts (all tools)

photorealistic, ray tracing, subsurface, chrome reflections, dense foliage cards, high-poly Bezier curves, muddy brown, purple neon cyberpunk default, Inter/Roboto UI look

## Pipeline checklist

1. Generate mesh → decimate to budget → validate lane clearance  
2. Unwrap → pack into atlas slot → paint flat colors  
3. Assign `EndlessChase/ToonUnlit` → prefab → register in `ObjectPool`  
4. Screenshot at mobile resolution → adjust silhouette if unreadable  

See also: [ArtPrompts_Meshy.md](ArtPrompts_Meshy.md), [ArtPrompts_ImageGen.md](ArtPrompts_ImageGen.md).
