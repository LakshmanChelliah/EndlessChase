# Endless Chase — UI Test Checklist

## Local (`npx serve docs`)

- [ ] Page loads; NES CRT look; no blank hang
- [ ] **Play** starts run; HUD shows distance/coins/heat/**gas**
- [ ] A/D or swipe across **4 city lanes**; page does not scroll
- [ ] Oncoming lanes show **WRONG WAY**; collision wrecks
- [ ] Swipe down / S brakes; heat rises → pursuit → **Busted!**
- [ ] Collision shows **Wrecked!**; **Retry** works
- [ ] Turn cue; swipe L/R switches biome via on-ramp
- [ ] Gas station on L or R; must be in matching outer lane or see "Move closer to enter"
- [ ] Pull-in anim → hold to fill; cops approach; release or full tank pulls out
- [ ] Holding until heat 100 → Busted
- [ ] Empty tank forces coast → heat / bust; gas text/bar turns red below 15%
- [ ] Coins + Garage upgrades persist across reload
- [ ] Red fast → BOOST + heat; red while braking → RED SLOW
- [ ] Modules load (`docs/js/*.js`) with no console errors

## Live GitHub Pages

Re-run the same checklist against https://lakshmanchelliah.github.io/EndlessChase/
