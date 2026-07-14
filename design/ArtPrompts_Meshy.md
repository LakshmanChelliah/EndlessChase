# Meshy / Luma — Fake GTA V Mobile PBR Prompts

Suffix every prompt with:

`game-ready mobile LOD, triangulated under [BUDGET] triangles, clean exterior only no interior, PBR atlas UVs, realistic panel gaps and worn paint, golden-hour Los Santos urban grit, centered origin, +Z forward`

**Shared negatives:** `cartoon, low-poly toy, cel shading, vibrant arcade, pastel, purple neon cyberpunk, ray tracing, dense foliage, interior cockpit, subdivision cage, candy colors`

---

## Vehicles

### car_player (≤8000)
```
realistic getaway sports coupe for mobile chase game, dark metallic graphite body #2A2E33, subtle deep red accent #6B1D1D, dirty worn clearcoat, chrome trim, chunky performance wheels, short aggressive nose, black tinted glass as simple dark planes, no logos, Los Santos late afternoon grit, game-ready mobile LOD, triangulated under 8000 triangles, clean exterior only no interior, PBR atlas UVs, centered origin, +Z forward, scale ~4.5m length
```

### car_civ_sedan (≤6000)
```
realistic civilian 4-door sedan, faded silver-grey paint with dust and door dings, everyday Los Santos traffic, simple dark windows, game-ready mobile LOD under 6000 triangles, PBR atlas UVs, no interior, centered origin, +Z forward
```

### car_civ_hatch (≤6000)
```
realistic compact hatchback, dusty muted blue-grey body, worn bumpers, mobile game traffic prop, under 6000 triangles, PBR atlas UVs, no interior, centered origin, +Z forward
```

### car_civ_van (≤6000)
```
realistic boxy work van, dirty cream-white panels, commercial Los Santos look, under 6000 triangles, PBR atlas UVs, no interior, centered origin, +Z forward
```

### car_police (≤6000)
```
realistic police interceptor sedan, black and white door panels #0E0E10 and #E8E6E1, low-poly light bar as simple red blue boxes, black push bumper, gritty modern patrol car, under 6000 triangles, PBR atlas UVs, no interior, centered origin, +Z forward
```

### car_cross (≤5000)
```
realistic short delivery truck cab and box, mustard-tan dirty paint, wider footprint hazard vehicle, under 5000 triangles, PBR atlas UVs, no interior, centered origin, +Z forward
```

---

## Road tiles (shell ≤2000)

Template — replace `[BIOME]`:
```
modular endless-runner road segment 20m long 12m wide, three lanes, cracked dusty asphalt #1C1F24, faded lane paint #C9B896, concrete curb #8A8580, [BIOME], game-ready mobile LOD under 2000 triangles for road and curb shell, PBR atlas UVs, buildings as simple extrusions outside playable lanes, baked AO in textures, golden-hour Los Santos grit, origin at front centerline
```

### tile_city_straight
`[BIOME]` = mid-rise concrete and stucco buildings, dusty storefronts, street lamps, graffiti-free but worn urban blocks, warm late-afternoon haze

### tile_city_intersection
Same as city + cross street cut, worn zebra crosswalk, sockets for traffic lights left and right

### tile_suburb_straight
`[BIOME]` = dry SoCal lawns and low ranch houses set back, dusty sidewalks, sparse low-poly trees (solid meshes not alpha cards), warmer suburban grit

### tile_suburb_intersection
Suburb + quieter light poles, crosswalk

### tile_highway_straight
`[BIOME]` = wider shoulders, metal guardrails, overhead sign gantry, fewer near props for speed readability, open golden-hour sky

### tile_highway_merge
Highway + on-ramp wedge, worn chevrons, still 20m module

---

## Props

### prop_traffic_light (≤500)
```
realistic traffic light pole, three stacked signal housings, metal pole, mobile game prop under 500 triangles, PBR atlas UVs, Los Santos street furniture
```

### prop_coin (≤120)
```
small metallic gold coin collectible, subtle not cartoon, under 120 triangles, PBR metal rough
```

### prop_cone / prop_barrier (≤150)
```
dirty orange traffic cone with faded white bands, under 150 triangles, PBR
```

### prop_building_city_A/B (≤1500)
```
mid-rise urban building LOD block, dusty concrete stucco, simple window rectangles with baked warm interior glow in albedo, under 1500 triangles, PBR atlas
```

### prop_house_suburb_A (≤1200)
```
SoCal ranch house LOD, dry lawn colors, under 1200 triangles, PBR atlas
```

### prop_gantry_sign (≤400)
```
highway overhead gantry with faded green directional panels, under 400 triangles, PBR
```

### fx_boost_streak (≤80)
```
subtle heat haze speed streak wedge, desaturated, under 80 triangles
```

### fx_crash_burst (≤150)
```
low poly debris burst, dusty grit colors, under 150 triangles
```

## Export rules

- Freeze transforms; materials `M_Vehicle_PBR` / `M_Env_PBR`
- Delete interiors; wheels 12–16 sides max
- Unity import: generate lightmap UVs off if using atlas only; Mesh Compression Medium
