# Endless Chase — UI Test Checklist

## Local (`npx serve docs`)

- [ ] Page loads; canvas visible; no blank hang
- [ ] **Play** starts run; HUD shows distance/coins
- [ ] A/D or swipe changes lanes; page does not scroll / pull-to-refresh
- [ ] Collision shows Game Over; **Retry** works
- [ ] Collect coins; open Upgrades; buy a tier; refresh page — coins/levels persist
- [ ] Red light shows BOOST hint and may spawn cross traffic; green shows clear
- [ ] No hard console errors stopping the loop

## Live GitHub Pages

Re-run the same checklist against the Pages URL after each deploy.
