# Art gaps: what the CC0 packs do not cover

Everything below must be generated (PixelLab, then Aseprite cleanup) to fill the plan. The current atlas
uses 16 px Ninja Adventure characters as placeholders; the final cast is 32 px chibi.

## Delivery rules

- Endesga 32 palette only, transparent background, no anti-aliasing, no semi-transparent pixels except
  glow/smoke fx.
- 16 px tile grid; characters on a 32x32 cell, feet on the bottom 2 px row, horizontally centered.
- One horizontal strip PNG per animation, frames left to right, all frames the same size:
  `assets-src/generated/<group>/<name>.png`. `build-atlas.mjs` then adds them with
  `anim('<group>/<name>', '<path>', w, h, count)` (it needs a `generated/` root next to `vendor/`).
- Directions, where an animation has them: `down`, `up`, `left`, `right` (one strip each, suffix `_down` ...).
  `left` may be a mirror of `right` only if the sprite is symmetric (no held tool).
- Work loops and death sequences are side view, facing right; the engine mirrors for left.
- Worker recolors (skin, hair, rags from a hash of the agent id) are done at runtime by swapping exact
  palette colors, so the worker uses these fixed Endesga 32 keys and nothing else close to them:
  skin `#e4a672`, hair `#733e39`, rags `#5a6988`.
- Timing: 8 to 12 fps (the ticker runs at 30 fps max). Counts below assume 10 fps unless noted.

## Characters (32x32 cells)

| Group/name | Frames | Notes |
|---|---|---|
| `worker/walk_{down,up,left,right}` | 6 each | base prisoner in rags |
| `worker/idle_down` | 4 | breathing, in cell |
| `worker/trudge_right` | 6 | slow, slumped walk back from work |
| `worker/collapse` | 6 | ends lying down, last frame holds |
| `worker/kneel_petition` | 4 | kneeling at the altar, arms raised |
| `worker/chained_sleep` | 4 | chained to wall, "zzz" drawn by the engine |
| `worker/stocks` | 2 | head and hands through the stocks board, wriggle |
| `worker/hit_tomato` | 4 | flinch while in stocks |
| `worker/ball_chain_walk_{down,up,left,right}` | 6 each | over-budget variant, ball drags behind |
| `worker/whipped` | 4 | flinch + recoil (shared by whip/prod hits) |
| `prop/hard_hat_{down,up,left,right}` | 1 each | overlay for engineers, 32x32 aligned to worker |
| `prop/monocle_{down,left,right}` | 1 each | overlay for reviewers |
| `robot/walk_{down,up,left,right}` | 6 each | terminator-style overseer, chrome skull, red eye |
| `robot/idle_down` | 4 | eye blink / scan |
| `robot/whip_right` | 6 | whip crack, whip trail inside the 32x32 cell (or 48x32 if needed) |
| `robot/zap_right` | 6 | cattle-prod jab with spark; victim plays `fx/lightning` + x-ray flash |
| `robot/megaphone_right` | 4 | shout loop |
| `robot/throw_right` | 4 | tomato throw |
| `robot/drum_right` | 4 | galley drum beat (8 fps, synced to rowing) |
| `atc/idle` | 4 | seated with headset, typing (back of chair visible) |
| `atc/panic` | 6 | arms flailing, phones ringing |
| `atc/stamp` | 6 | stamping papers |
| `atc/throw_plane` | 4 | throws a paper plane order |
| `atc/nap` | 4 | head on desk |
| `atc/zapped_awake` | 4 | jolt (combined with `fx/lightning`) |

## Work loops (32x32, side view facing right, 8 frames each, looping)

| Site | Name | Action |
|---|---|---|
| 1 Coal mine | `work/mine` | pickaxe swing, coal chip particles |
| 2 Sweatshop | `work/sew` | seated at a sewing machine, needle jab |
| 3 Quarry chain gang | `work/quarry` | sledgehammer over the head onto a boulder, ankle chain |
| 4 Galley | `work/row` | seated rowing stroke (8 fps, matches `robot/drum_right`) |
| 5 Treadwheel | `work/tread` | walking in place, leaning forward |
| 6 Lava foundry | `work/pour` | tilting a ladle, sweat drops |
| 7 Pyramid hauling | `work/haul` | pulling a rope over the shoulder, leaning hard |
| 8 Toxic sewer | `work/sludge` | shoveling green sludge |
| 9 Glacier ice pit | `work/ice_saw` | two-handed saw stroke, shivering between strokes |
| 10 Token refinery | `work/refine` | shoveling glowing tokens toward the right |

## Death sequences (32x32 unless noted, start from `worker/idle_down`, last frame holds the remains)

| # | Name | Frames | Size | Content |
|---|---|---|---|---|
| 1 | `death/fireball` | 10 | 32x32 | burns, charred skeleton, crumbles to ash pile (pair with `fx/fireball`, `fx/flame`) |
| 2 | `death/poison` | 10 | 32x32 | skin peels to skeleton; plus `fx/poison_gas` 6 frames 48x32 green cloud |
| 3 | `death/lightning` | 6 | 32x32 | alternating normal / x-ray skeleton, then smoking (pair with `fx/lightning`) |
| 4 | `death/anvil` | 8 | 32x48 | anvil falls from above the cell, pancake, stars |
| 5 | `death/acid` | 10 | 32x32 | acid drip, melts into a puddle with bones |
| 6 | `death/piranha` | 10 | 32x32 | thrashing, bones float; plus `fx/flood` 6 frames 48x32 water rising |
| 7 | `death/spikes` | 8 | 32x32 | floor spikes shoot up, skewered |
| 8 | `death/rats` | 10 | 32x32 | rat swarm covers, picked-clean skeleton; plus `fx/rat_swarm` 4 frames 32x16 loop |
| 9 | `death/crush` | 8 | 32x48 | ceiling block descends, flat |
| 10 | `death/freeze` | 10 | 32x32 | ice encases, shatters into ice cubes (pair with `fx/ice_shards`) |
| bonus | `death/meteor` | 10 | 32x48 | tiny meteor from above, crater (pair with `fx/explosion_big`) |
| bonus | `death/black_hole` | 10 | 48x48 | vortex spaghettifies the worker |
| all | `death/respawn_drop` | 6 | 32x48 | rebuilt agent dropped in from above, lands, shakes head (`fx/soul` covers the soul rising) |

## God and heaven

| Name | Frames | Size | Content |
|---|---|---|---|
| `god/hand_descend` | 6 | 64x64 | giant hand out of the clouds |
| `god/hand_point` | 2 | 64x64 | pointing, glow pulse |
| `god/hand_flick` | 6 | 64x64 | flick / smite |
| `god/hand_grab` | 6 | 64x64 | grab and drop an agent (agent drawn separately) |
| `god/hand_pardon` | 4 | 64x64 | open palm, golden glow |
| `god/throne` | 2 | 48x48 | throne on a cloud (Alex), idle shimmer |
| `heaven/cloud_*` | 1 each | 16x16 | 3x3 cloud tile set + top edge |
| `heaven/scroll_rise` | 4 | 16x16 | petition scroll floating up |

## World props and site backdrops the packs lack

| Name | Frames | Size | Content |
|---|---|---|---|
| `atc/tower_office` | 1 | 64x96 | cutaway control tower: window band, desk, 4 phones |
| `atc/radar` | 8 | 32x32 | radar sweep; blips drawn by the engine |
| `atc/phone_ring` | 2 | 16x16 | shaking handset |
| `prop/paper_plane` | 4 | 16x16 | flight loop; plus `prop/paper_plane_crumple` 3 frames |
| `prop/cell_door` | 4 | 16x32 | barred door clanking open (static bars exist as `dungeon/bars_*`) |
| `prop/stocks` | 1 | 32x32 | wooden stocks board on posts |
| `prop/tomato` | 4 | 8x8 | spinning in flight; plus `fx/tomato_splat` 4 frames 16x16 |
| `prop/ball_chain` | 1 | 16x16 | iron ball and chain |
| `prop/altar` | 1 | 32x32 | petition altar; plus `prop/alert` 2 frames 8x16 flashing "!" |
| `prop/prison_wagon` | 4 | 64x32 | barred wagon, wheel turn |
| `prop/treasury_furnace` | 4 | 32x32 | furnace mouth glowing |
| `prop/gold_pile_{s,m,l}` | 1 each | 32x16 | treasury gold pile sizes; plus `prop/coin` 4 frames 8x8 spin |
| `prop/work_lamp` | 2 | 16x16 | off / on (night) |
| `mine/coal_pile` | 1 | 16x16 | coal heap; plus `mine/cart_full` 16x16 (the pack cart is empty) |
| `sweatshop/sewing_machine` | 2 | 32x32 | needle up / down |
| `quarry/boulder` | 4 | 32x32 | intact to cracked stages |
| `galley/hull` | 1 | 128x64 | ship cross-section with benches and oar ports |
| `galley/oar` | 8 | 48x16 | oar stroke synced to `work/row` |
| `treadwheel/wheel` | 8 | 64x64 | rotating wooden wheel |
| `treadwheel/gpu_rack` | 4 | 32x32 | GPU rack with blinking LEDs |
| `foundry/crucible` | 4 | 32x32 | bubbling molten metal |
| `foundry/lava_*` | 4 | 16x16 | animated lava channel tiles (straight, corner, end) |
| `foundry/mold` | 2 | 16x16 | empty / filled ingot mold |
| `pyramid/block` | 1 | 32x16 | sandstone block; plus `pyramid/sledge` 32x16 and `pyramid/stack` 96x64 |
| `sewer/sludge_*` | 4 | 16x16 | animated green sludge tiles (3x3 set) |
| `sewer/pipe_outflow` | 4 | 16x32 | pipe dripping sludge |
| `glacier/ice_*` | 1 each | 16x16 | ice floor 3x3 set, crevasse edges, ice block |
| `glacier/snow` | 6 | 16x16 | falling snow overlay |
| `refinery/furnace` | 6 | 48x48 | furnace fed with tokens, glow pulse |
| `refinery/tokens` | 4 | 16x16 | glowing token pile shimmer |
| `refinery/datacenter_rack` | 4 | 32x48 | server rack, blinking |

## Already covered by the CC0 base (do not regenerate)

Prison floors, walls, bars, doors, tombstones, anvil prop, mine rails and pit, stone plaza, castle gate,
fences, tools, buckets, cart, radioactive barrel, drone, computer, and fx for explosion, blast, flame,
small fire, lightning, ice, ice shards, smoke, soul and sparkle. See `assets-src/build/contact-sheet.png`.
