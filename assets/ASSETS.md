# Asset license ledger

Every third-party file in `assets/` comes from a pack vendored unmodified under `assets-src/vendor/<folder>/`.
Each license was checked on the pack's own download page on 2026-11-07. Allowed: CC0 and OFL (fonts).
Not allowed: CC-BY-SA, GPL, LPC, anything paid (for example LimeZu).

| Pack | Vendor folder | Source | License | What we use |
|---|---|---|---|---|
| Ninja Adventure Asset Pack (Pixel-boy, AAA) | `ninja-adventure` | https://pixel-boy.itch.io/ninja-adventure-asset-pack ("Ninja Adventure - Asset Pack.zip") | CC0 1.0 (page + bundled `LICENSE.txt`) | FX: explosion, flame, lightning, ice, ice shards, smoke, small fire, soul, sparkle, fireball. Mine pit tiles (`TilesetHole`). Whip and pickaxe items. Placeholder 16 px characters: Boy (worker), RobotGrey (overseer), Skeleton, Inspector (ATC) |
| Tiny Dungeon (Kenney) | `kenney-tiny-dungeon` | https://kenney.nl/assets/tiny-dungeon | CC0 1.0 (page + bundled `License.txt`) | Cell floors, walls, wall frame, doors, prison bars, mine rails, tombstones, anvil, furniture, chests, barrel, toxic cauldron and acid skull, ghost, bat, spider, rat, tools |
| Tiny Town (Kenney) | `kenney-tiny-town` | https://kenney.nl/assets/tiny-town | CC0 1.0 (page + bundled `License.txt`) | Grass, dirt, cobble, stone plaza, castle wall and gate arches, house walls/doors/windows (ATC office), fences (stocks), cart, tools, buckets, well, bomb, log, pot, hay, target |
| Robot Lab Asset Pack (Murphy's Dad) | `robot-lab` | https://murphysdad.itch.io/robot-lab-asset-pack (`robot-lab_v1.0.zip`) | CC0 (page text: "CC0 License (TL; DR use it however you'd like!)"; the zip has no license file) | Computer (ATC radar desk), drone, radioactive barrel, lab table, spare robot parts |
| Explosions - Pixel Art (Aim Studios) | `aim-explosions` | https://aim-studios.itch.io/explosions-pixel-art (files: Blast_default 32x32, Explosion_default 32x32, Realistic Explosion_default 64x64) | CC0 1.0 (page: "CC0 License ... without credit or mention") | `fx/blast`, `fx/burst`, `fx/explosion_big` |
| m5x7 (Daniel Linssen) | `m5x7` | https://managore.itch.io/m5x7 | CC0 1.0 | `assets/fonts/m5x7.ttf`: speech bubbles, ticker |
| Press Start 2P (CodeMan38) | `press-start-2p` | https://github.com/google/fonts/tree/main/ofl/pressstart2p | SIL OFL 1.1 (`assets/fonts/PressStart2P-OFL.txt`, must ship with the font) | `assets/fonts/PressStart2P-Regular.ttf`: headings |

Rejected or not used: Kenney All-in-1 bundle (paid), LimeZu packs (paid), LPC-based sprites (CC-BY-SA / GPL).

CC0 does not require attribution, but each author asks for it. Credit Pixel-boy, Kenney, Murphy's Dad,
Aim Studios and Daniel Linssen in the plugin's README or about text.

## Generated art

Sprites made for this project (PixelLab, then Aseprite cleanup) are our own work and will be listed here
as they land. The open list is `assets-src/GAPS.md`.

## Rebuilding

```bash
npm --prefix assets-src run atlas
```

Writes `assets/atlas.png`, `assets/atlas.json` (Pixi v8 spritesheet with `animations`), `assets/fonts/*`,
and the review contact sheet `assets-src/build/contact-sheet.png`. The frame list lives in
`assets-src/build-atlas.mjs`. Ninja Adventure's `Audio/` folder (96 MB, unused) is kept out of git.
