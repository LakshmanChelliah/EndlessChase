# Endless Chase — UI Test Checklist

## Local (`npx serve docs`)

- [ ] Page loads; NES CRT look; no blank hang
- [ ] **Play** starts run; HUD shows distance/coins/heat
- [ ] A/D or swipe across **4 city lanes**; page does not scroll
- [ ] Oncoming lanes show **WRONG WAY**; collision wrecks
- [ ] Swipe down / S brakes; heat rises → pursuit → **Busted!**
- [ ] Collision shows **Wrecked!**; **Retry** works
- [ ] Turn cue; swipe L/R switches biome via on-ramp
- [ ] Coins + Garage upgrades persist across reload
- [ ] Red fast → BOOST + heat; red while braking → RED SLOW
- [ ] Modules load (`docs/js/*.js`) with no console errors

## Live GitHub Pages

Re-run the same checklist against https://lakshmanchelliah.github.io/EndlessChase/
