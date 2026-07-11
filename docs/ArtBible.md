# Endless Chase — Art Bible (Fake GTA V / Mobile PBR)

**Style lock:** Los Santos–inspired **late-afternoon golden-hour grit**. Weathered paint, chrome trim, cracked asphalt, concrete dust, warm sun haze. Reads like GTA V from a chase cam — **not** cartoon, **not** full AAA deferred photoreal.

True GTA V uses deferred rendering, dense LODs, and realtime shadows. Mobile WebGL cannot. We fake the *read* with **Mobile PBR**, **baked AO / contact shadows in maps**, **texture atlases**, and **one directional sun** (realtime shadows OFF).

## Mood & palette (gritty SoCal)

| Token | Hex | Use |
|-------|-----|-----|
| Asphalt | `#1C1F24` | Road surface (charcoal, dusty) |
| LanePaint | `#C9B896` | Faded lane dashes |
| Concrete | `#8A8580` | Curbs, sidewalks, barriers |
| Dust | `#A89070` | Dirt overlays / haze tint |
| HeroBody | `#2A2E33` | Getaway car — dark metallic graphite |
| HeroAccent | `#6B1D1D` | Optional deep red stripe / calipers |
| PoliceBlack | `#0E0E10` | Cruiser body |
| PoliceWhite | `#E8E6E1` | Door panels |
| Chrome | `#B8BCC2` | Trim, bumpers (metallic high) |
| SkyHazeA | `#C4A574` | Horizon warm haze |
| SkyHazeB | `#6B8CAE` | Upper sky cool |
| Sun | `#FFC98A` | Golden-hour key |
| RedLight | `#C62828` | Signal |
| GreenLight | `#2E7D32` | Signal |
| Coin | `#D4AF37` | Collectible (subtle, not arcade candy) |

## Poly budgets (WebGL-safe)

| Asset | Max tris | Notes |
|-------|----------|--------|
| Hero sports / muscle | ≤8,000 | Clean exterior only, no interior |
| Police / civilian cars | ≤6,000 | Same wheel style for atlas reuse |
| Cross-traffic truck | ≤5,000 | Wider silhouette |
| Road tile shell | ≤2,000 | 20 m × 12 m module |
| Buildings / props | 800–1,500 | Box LODs OK if silhouette reads |
| Traffic light | ≤500 | |

## Maps (Mobile PBR, atlas-first)

| Map | Space | Notes |
|-----|-------|--------|
| Albedo | sRGB | Dirt, wear, fake contact shadows painted in |
| Normal | linear | Optional; one shared vehicle normal preferred |
| ORM mask | linear | **R**=AO (or packed unused), **G**=Roughness, **B**=Metallic |
| Emission | sRGB | Rare — window strips / lightbar only, very dim |

**Do not use:** height/displacement, realtime reflection probes, SSR, SSAO, volumetric fog.

**Car paint gloss:** roughness + tiny env cubemap (64–128) or matcap-lite — not planar reflections.

### Atlas layout

**Vehicles** — `Atlas_Vehicles_Albedo.png` + `Atlas_Vehicles_ORM.png` (+ optional shared normal), **2048²** (fallback 1024²).

**Environment** — `Atlas_Env_Albedo.png` + `Atlas_Env_ORM.png`, **2048²**.

Import: mipmaps ON, anisotropic 2–4, ASTC 6×6 / ETC2, max 2048.

## Fake lighting rules

1. Bake soft ground contact and panel AO into albedo / ORM.R  
2. One URP directional light (golden-hour sun); **shadows Off** on WebGL quality  
3. Hemisphere / ambient ≈ sky haze colors; keep exposure conservative in Linear  
4. Building windows: emission strips baked into albedo (cheap “lit interior” read)  
5. No additional realtime lights on mobile WebGL tier  

## Tile contract (unchanged gameplay)

- Length **20 m** (+Z), width **12 m**  
- Lane centers X = **−3.2, 0, 3.2**  
- Origin at tile start centerline; road Y = 0  
- Materials: `M_Env_PBR` / `EndlessChase/MobilePBR`

## Shader

Primary: [`Assets/Shaders/EndlessChaseMobilePBR.shader`](../Assets/Shaders/EndlessChaseMobilePBR.shader)

- Albedo + ORM (+ optional normal)  
- Single main light; no extra lights; no realtime shadows  
- Fog-compatible; GPU instancing ON  

**Deprecated:** `EndlessChase/ToonUnlit` — arcade cel path; do not use for new assets.

Materials: `M_Vehicle_PBR`, `M_Env_PBR`, tint instances for hero/police if needed.

## Negative prompts (all AI tools)

cartoon, low-poly toy, cel shading, vibrant arcade, pastel sky, candy colors, purple neon cyberpunk, ray tracing showcase, 8K photoreal skin pores, dense foliage cards, interior cockpit, high-poly subdivision cage, muddy brown sludge, Inter/Roboto UI chrome

## Pipeline checklist

1. Generate / sculpt → decimate to budget → delete interiors  
2. Unwrap for atlas → paint albedo wear + fake AO → author ORM  
3. Assign `EndlessChase/MobilePBR` → prefab → pool register  
4. Screenshot at mobile resolution under golden-hour sun → adjust roughness/metal  

See: [ArtPrompts_Meshy.md](ArtPrompts_Meshy.md), [ArtPrompts_ImageGen.md](ArtPrompts_ImageGen.md), [WebGLBuildSettings.md](WebGLBuildSettings.md).
