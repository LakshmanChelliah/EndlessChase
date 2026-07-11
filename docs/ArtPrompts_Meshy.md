# Meshy / Luma Genie — Copy-Paste Prompts

Suffix every prompt with: `ultra low poly, mobile game asset, flat colors, no PBR, clean topology, under [BUDGET] triangles, centered origin, +Z forward`

Shared negatives: `photorealistic, ray tracing, subsurface, chrome reflections, dense foliage, high poly, muddy brown, purple neon cyberpunk`

---

## Vehicles

### car_player (≤1500)
```
ultra low poly arcade sports coupe, 3/4 chase-game hero, bright mango yellow body #FFB703, tangerine hard-edge stripes #FB8500, chunky black wheels, short aggressive nose, single cabin glass as dark flat #1B1B2F quad, no logos, hard faceted bevels, toy-like proportions, mobile game asset, under 1500 triangles, clean topology, centered origin, +Z forward, scale ~4.2m length
```

### car_civ_sedan (≤1200)
```
ultra low poly civilian 4-door sedan, muted teal #4A90A4 body, light grey roof, chunky black wheels, bland readable silhouette, arcade endless runner traffic, under 1200 triangles, centered origin, +Z forward
```

### car_civ_hatch (≤1200)
```
ultra low poly compact hatchback, coral #FF6B6B body, dark grey windows as flat planes, chunky wheels, toy arcade style, under 1200 triangles, centered origin, +Z forward
```

### car_civ_van (≤1200)
```
ultra low poly boxy delivery van, cream #F4F1DE body, simple flat panels, chunky black wheels, arcade mobile game, under 1200 triangles, centered origin, +Z forward
```

### car_police (≤1500)
```
ultra low poly police interceptor coupe, deep blue #1D4ED8 body, white door panel blocks #F8FAFC, low-poly light bar as simple red and blue box lamps, black bumper slabs, menacing but toy-like, under 1500 triangles, same scale as sports car, centered origin, +Z forward
```

### car_cross (≤1000)
```
short ultra low poly delivery truck cab and box, mustard #E9C46A, wider footprint, chunky wheels, arcade hazard vehicle, under 1000 triangles, centered origin, +Z forward
```

---

## Road tiles (shell ≤800)

Tile template — replace `[BIOME]`:
```
modular endless-runner road segment 20m long 12m wide, three lanes, ultra low poly mobile game, vibrant arcade colors [BIOME], flat shaded atlas-ready UVs, no PBR, buildings as simple extrusions outside playable lanes, clean box collision friendly, origin at front centerline, under 800 triangles for road and curb shell
```

### tile_city_straight
`[BIOME]` = asphalt #2B2F3A, yellow lane dashes #F5E6A8, concrete curb #C4C8D0, pink-red city signage slabs #FF4D6D, 2-4 storey box buildings with window color rectangles, simple street lamps

### tile_city_intersection
Same as city + cross street cut, zebra crosswalk UVs, sockets for traffic lights left and right

### tile_suburb_straight
`[BIOME]` = asphalt, lawn strips #3DDC97, ranch house blocks set back, mailbox, low poly cone trees with box trunks, warmer tint

### tile_suburb_intersection
Suburb + quieter light pole sockets, crosswalk

### tile_highway_straight
`[BIOME]` = asphalt, brighter dashes, thin guardrail quads #C4C8D0, overhead sign gantry with #4CC9F0 panels, fewer near props

### tile_highway_merge
Highway + on-ramp wedge, warning chevrons, still 20m module

---

## Props

### prop_traffic_light (≤300)
```
ultra low poly traffic light pole, three stacked box lamps red yellow green, simple armature, mobile game prop, under 300 triangles
```

### prop_coin (≤80)
```
ultra low poly faceted gold coin diamond, #FFE66D, very few triangles under 80, arcade collectible
```

### prop_cone / prop_barrier (≤100)
```
ultra low poly traffic cone orange and white bands, under 100 triangles
```

### prop_building_city_A/B (≤400)
```
ultra low poly city building block 2-4 storeys, window rectangles painted, accent #FF4D6D trim, under 400 triangles
```

### prop_house_suburb_A (≤400)
```
ultra low poly suburban ranch house, soft colors, lawn-friendly, under 400 triangles
```

### prop_gantry_sign (≤200)
```
ultra low poly highway overhead gantry with blue #4CC9F0 panels, under 200 triangles
```

### fx_boost_streak (≤50)
```
simple low poly wedge speed streak ribbon, bright yellow orange, under 50 triangles
```

### fx_crash_burst (≤120)
```
low poly star burst explosion mesh, flat colors, under 120 triangles
```

## Export rules

- Freeze transforms; one material slot `M_Atlas`
- Delete interior faces; wheels 8–12 side cylinders
- Unity: Y-up import; gameplay forward +Z
