# Torch

A mobile sandbox pixelart fantasy game. Top-down, seed-generated, and playable
in a browser with no build step and no asset files — every sprite, tile
texture, and sound is generated in code when the page loads.

Night is genuinely dark and caves are darker. Carry a torch in your selected
slot and it lights your surroundings; plant torches to keep a route home.
Shades burn in bright light, so a well-lit camp is a weapon rather than a
decoration.

## Running it

There is no toolchain. Serve the directory over HTTP (ES modules will not load
from `file://`) and open it:

```sh
python3 -m http.server 8000
# then open http://localhost:8000
```

Works in any modern browser. On a phone it uses a virtual stick and two thumb
buttons; on desktop, keyboard and mouse.

## Controls

| | Touch | Keyboard |
|---|---|---|
| Move | left stick | `WASD` / arrows, `Shift` to sprint |
| Use held item | ⚔ button | `Space` or click |
| Interact | ✋ button | `E` |
| Hotbar | tap a slot | `1`–`8`, or scroll |
| Inventory · Craft · Map | 🎒 ⚒ 🗺 | `I` · `C` · `M` |
| Drop · Menu | — | `Q` · `Esc` |

"Use" is context-sensitive: it mines what you face, places what you hold, eats
what is edible, plants what is a seed, and swings at what is beside you.

## What's in it

**World.** An infinite chunked world grown from a seed. Ten biomes come out of
warped elevation, moisture, and heat fields; rivers follow a ridged-noise crest
band. Villages, ruins, camps, graveyards, huts, and cave mouths are placed on a
structure grid, and the starting village is sited by searching for flat, dry,
temperate ground near the origin.

**Caves.** A separate dimension reached through any cave mouth — there is one at
the village edge. Ore gets richer the further you travel from the shaft: copper
near, then iron, gold, and moonstone in the deepest dark. Something old lives
down there.

**Light.** Coloured per-tile light propagation with real shadows cast by walls
and trees. The day/night cycle feeds the sky colour straight into the light map,
and weather — rain, storm, snow, fog — dims it further.

**Play.** Mining, building, farming, smelting, a five-tier tool progression,
eight creature types, a boss, villagers who keep a schedule, a six-quest chain,
and a trader.

## Layout

```
index.html          markup shell and DOM HUD
styles.css          chunky pixel UI, mobile-first
src/
  main.js           bootstrap and title screen
  game.js           the game: entities, verbs, spawning
  core/             loop, input, procedural audio, seeded noise, save
  world/            tiles, items, recipes, chunk storage, worldgen, lighting
  gfx/              palette, sprite compiler, tile art, camera, particles, renderer
  entity/           player, mobs, NPCs, drops, projectiles
  systems/          clock and weather, inventory, quests
  ui/               HUD, panels, dialogue, shop, minimap
tools/              development and verification scripts
```

## Development tools

None of these are needed to play; they exist to make the game inspectable.

```sh
node tools/check.mjs                    # parse every module as real ESM
node tools/playtest.mjs                 # 26 gameplay assertions in a real browser
node tools/smoke.mjs desktop torch      # render + FPS + console errors
node tools/smoke.mjs phone torch        # also: phone-landscape
node tools/mapdump.mjs torch surface    # ASCII map of generated terrain
node tools/mapdump.mjs torch cave       # ...and of the cave system
node tools/shot.mjs /tools/artsheet.html out.png   # every sprite, magnified
```

`tools/check.mjs` imports each module rather than running `node --check`: `.js`
files are treated as CommonJS by `--check`, which silently accepts real syntax
errors in ES modules.

`tools/playtest.mjs` drives an actual browser through mining, crafting,
placing, edit persistence across a chunk reload, combat, quests, save/load,
dimension travel, death and respawn, night spawning, the shade-versus-light
mechanic, farming, tool tiers, and durability.

## Notes on the generation

Two findings worth recording, since both look like tuning problems and are not:

*Rivers.* The first threshold put ridged-noise "rivers" across 12.7% of the map,
which reads as wetland, not river. The band is now tuned to roughly 1.7%, with a
sandy margin either side.

*Caves.* Thresholded noise alone sits below the 2D site-percolation threshold at
the density that looks right (~40% open), so it reliably produced sealed-off
pockets — measured at 33% of open floor reachable, and 9% on the worst seed.
Adding wider or extra noise layers only traded that for a featureless cavern.
The fix is explicit structure: a lattice of cave nodes whose edges exist with
p = 0.72, comfortably above the bond-percolation threshold of 0.5 for a square
lattice. Caves now measure ~37% open with 94–97% of that reachable from the
entrance on every seed tested, and the noise still supplies every organic shape.

## License

MIT — see [LICENSE](LICENSE).
