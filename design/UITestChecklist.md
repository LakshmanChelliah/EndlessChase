# Endless Chase — UI Test Checklist

## Local (`npm run serve`)

- [ ] Page loads; NES CRT look; no blank hang
- [ ] **Play** starts run; HUD shows distance/coins/heat/**gas**
- [ ] A/D or swipe across **4 city lanes**; page does not scroll
- [ ] Slow deliberate swipes (drag longer than 0.5s) still change lanes / brake
- [ ] Caps Lock on: A/D still steer
- [ ] Oncoming lanes show **WRONG WAY**; collision wrecks
- [ ] Swipe down / S brakes; heat rises → pursuit → **Busted!**
- [ ] Swipe up / W / Space resumes after sticky brake
- [ ] Collision shows **Wrecked!**; **Retry** works
- [ ] Turn cue; swipe L/R switches biome via on-ramp
- [ ] Gas station flickering sign visible early; must be in matching outer lane or see "Move closer to enter"
- [ ] Swipe toward station to pull in (tap does not enter); hold to fill; cops approach; release or full tank pulls out
- [ ] Holding until heat 100 → Busted
- [ ] Empty tank forces coast → heat / bust; gas text/bar turns red below 15%
- [ ] Coins + Garage upgrades persist across reload
- [ ] Red fast → BOOST + heat; red while braking → RED SLOW
- [ ] Modules load (`docs/js/*.js` via `game.js`) with no console errors
- [ ] Smoke: with server up, `npm run smoke` prints `SMOKE_OK`

## Live GitHub Pages

Re-run the same checklist against https://lakshmanchelliah.github.io/EndlessChase/
