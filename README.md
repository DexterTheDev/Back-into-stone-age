# Dino Horror

A 1 to 4 player co-op survival horror game in the browser. A 1969 research team is thrown 66 million years into the past.
This repo implements the whole story of the proposal: three chapters, 48 main missions, the side missions and all five endings, on three maps.

## Run it

Needs Node 22 and a desktop browser with WebGPU (WebGL2 fallback works). All baked assets are already in `packages/client/public/assets`.

```sh
npm install
npm run dev        # solo: open http://localhost:5180
npm run server     # co-op: game server on :8787, then use Host co-op / Join in the menu
npm test           # simulation tests, including a bot walking the real collision world
```

Other devices on your network can join co-op by opening `http://<your-ip>:5180` and setting Server to `ws://<your-ip>:8787`.

Controls: WASD move, Shift run, C crouch, Space jump, E use, left click strike or use what you hold, F flashlight, Tab pack, J journal, H show the way, 1-6 hold, T chat, Q/Z/X/V ping, F3 stats. The menu and pause screen have full How to Play and Controls pages, and a mouse sensitivity slider.

The game saves itself in the browser at every new objective, on sleeping and on reaching a new map. Continue on the menu picks it up, alone or as a co-op host.

## The item bar

The bar at the bottom left shows up to six kinds of item, in the order the player chooses, and keys 1 to 6 follow that order. In the pack (Tab), drag anything onto the bar, drag along the bar to reorder or swap, and drag off it to clear a place. Dragging onto the strip above the pack leaves an item behind, except story items. The order is kept in the browser. A kind of tool seen for the first time takes the next free place, and after that the player is in charge.

## Fighting back

The Sharpened stick is the first weapon: one branch and the pocketknife, available from the first branch you pick up. It is meant to be weak. It takes ten hits to kill a raptor and four a Pectinodon, each hit knocks the animal off its bite for a moment, and a badly hurt pack member takes the pack back into the dark for a while. It breaks after twelve blows and does nothing to Old Scar. The hand axe and blade also work as weapons. The fire-hardened spear, sling and rifle come in Chapter 2.

## Guidance

`packages/client/src/engine/Guide.ts` is the tutorial. It follows three rules: speak only when relevant, stop as soon as the player has done it, and never repeat. Seen tips are remembered in the browser.

- Each new objective appears mid-screen with one line on what to do, then settles at the top left with any checklist.
- Faint glints mark what the current step needs. The way-marker shows briefly on a new objective, on H, or after 40 seconds without progress.
- Everything can be turned off with Show tips and markers, in the menu or the pause screen.

## Pacing

One full day lasts 20 real minutes, 14 of daylight and 6 from dusk to sunrise. This is deliberately shorter than the 40 minutes in the proposal. All the numbers live in `packages/shared/src/sim/time.ts`.

- Lighting the first fire brings the sun down in about 40 seconds. The objective stays on Prepare for the night until the sky has visibly changed, then becomes Survive until morning.
- A player who has not reached the fire mission by mid afternoon gets a slower sun, so the shorter day does not catch first-timers without tools. Dusk still comes.
- `tools/scripts/sunset.mjs` and `tools/scripts/duskview.mjs` stage this in the real game. `tools/sens-test.mjs` covers the sensitivity slider.
- `tools/scripts/belt.mjs`, `save.mjs`, `chapters.mjs`, `finale.mjs` and `zoo.mjs` drive the item bar, saves, the set pieces, the endings and the animals in the real game.

## How it fits together

| Package | Job |
|---|---|
| `packages/shared` | Rules that must never disagree: movement, simulation, AI, missions, wire protocol |
| `packages/client` | Vue 3 menus and HUD, Three.js renderer (WebGPU, WebGL2 fallback), prediction, audio |
| `packages/server` | Node WebSocket server running one authoritative `GameSim` per party |
| `tools` | Offline asset pipeline |

Solo runs the same `GameSim` in a Web Worker, so there is one code path and no server cost. The client predicts its own movement and reconciles against 20 Hz binary snapshots.

## The asset pipeline

`npm run bake` rebuilds everything. Raw downloads live in `tools/.raw` (git-ignored). `npm run assets:fetch` restores the Poly Haven files with checksum checks and the field recordings. The Quaternius and OpenGameArt packs are manual downloads, listed in [docs/ASSET-LICENSES.md](docs/ASSET-LICENSES.md).

- **World** (`tools/bake/world.ts`, `tools/bake/maps.ts`): erosion-simulated terrain, river, material splats, flora scatter. `tsx tools/bake/world.ts valley` bakes one map.
- **Cave** (`tools/bake/cave.ts`): limestone chambers as a signed field, meshed with surface nets. Terrain near it is a triangle patch with a real hole.
- **Dinosaurs** (`tools/bake/dino`): keeps the CC0 Quaternius skeleton and clips, then rebuilds the animal around them: sculpted anatomy, a new jaw bone, teeth, claws, eyes, feathers, UV unwrap, and baked normal, colour and roughness maps. The plant-eaters (`species-herbivores.ts`) start from the source body, voxelised and smoothed by `remesh.ts`, then reworked.
- **Trees** (`tools/bake/trees.ts`): procedural trunks with scanned bark, foliage cards cut from photographed atlases.
- **Forest sound** (`tools/fetch-audio.mjs`): CC0 field recordings from Freesound, each licence re-checked on its own page at download, long ones trimmed to frame boundaries. At runtime they become seamless layered beds, single footfalls and bird calls placed around the listener.

## Promo video

`promo/Dino-Horror-Promo.mp4` tells the whole story across all three chapters, from the cave to the rift, without giving away the endings. Not every mission gets a shot: the captions number the missions shown. `tools/promo` rebuilds it from the real game.

- `shots.mjs` drives the game shot by shot and writes frames. The page and the simulation worker share one virtual clock (`harness.mjs`), so the footage is smooth at Ultra whatever the capture speed. It needs the dev server running.
- `voices.py` speaks the narration locally with Kokoro (Apache-2.0). macOS system voices are not used: their licence rules out public or commercial use.
- `fetch-sounds.mjs` downloads the extra sound effects and confirms on each sound's own page that it is CC0. `sounds.json` lists them with their authors.
- `edit.py` cuts the frames, sets the titles and subtitles, and mixes the sound. It needs the game's audio and the fetched sounds decoded to 48 kHz stereo WAV, plus numpy, scipy, pillow and imageio-ffmpeg.

## The story in code

| File | Job |
|---|---|
| `packages/shared/src/data/story.ts` | All 48 missions, the side missions, every clue and the endings |
| `packages/shared/src/data/props.ts` | Every story object: label, model, clue, what it gives |
| `packages/shared/src/sim/Story.ts` | Mission logic from the pot onward, everything players build, who lives on each map, the storm and the endings |
| `tools/bake/maps.ts` | The three maps: land, plant life and where each story place sits |

A mission reports a checklist. When every line is done, the story moves on. Missions 1 to 10 keep their original logic in `GameSim.ts` and `Guide.ts`.

Nothing the story waits on may depend on a timer alone, because timers do not survive a saved game. `Story.restore` and `stepPlaces` pick up anything left mid-way.

Lights are never added during play, because a change in light count rebuilds every shader and stalls the game for many seconds. Reuse a light or use an emissive surface.

## Status against the proposal

Built and verified:

- All 48 main missions, in order, across The Hollow, The Drowned Valley and The Second Sun. `packages/shared/test/story.test.ts` has a bot play them from the first drink to the end through the same messages a client sends.
- All side missions, including the solo-only ones, the twelve caches and the fifteen Polaroids.
- All five endings: Home, Closed forever, The last one, The record and Too late. Each is walked, not watched.
- The hidden door, the side tunnel seal, the raptor assault, the raft, the forward camp, Calloway's treehouse, the furnace, the mast, the array, the storm and the rift.
- Pachycephalosaurus, Triceratops, Ankylosaurus, Edmontosaurus, Thescelosaurus, the giant crocodilian, the azhdarchid, Dakotaraptor, the Widow and Didelphodon, each with its own behaviour.
- Saves and Continue, solo and for a co-op host. Map changes for everyone at once.
- Day and night cycle, survival stats including fever and fractures, real-time crafting, knapping mini-game, fire, noise-based hearing, character specialties, flash rain that floods the tunnels.
- Co-op over WebSocket with prediction, reconciliation and interpolation, plus chat, pings, downed and revive.
- Death sequence and the last Polaroid, 18+ gate, HRTF audio with cave reverb, adaptive ambience.

Different from the proposal, on purpose:

- All three maps are 1536 m a side, not 2, 4 and 3 km. They join at passes, with a short load between them.
- The Chapter 3 storm lasts about 6 minutes at best rather than 20, in step with the shorter day. Unrepaired coils add to that.

Not built yet:

- Radio voices are subtitles with a burst of static. Nothing is spoken aloud.
- The crocodilian and pterosaur are simple models moved by code, as the source pack has no rig for them. The Ankylosaurus is rebuilt on a Stegosaurus rig, and survivors and 1969 NPCs still read as mannequins up close.
- The other seven death sequences, dismemberment, moon phases, injuries beyond bleeding, fever and fractures, the spyglass, hide spots with size classes, recovering your pack from your body.
- Difficulty modes, accounts, friends, leaderboards, skins (roadmap Phase 3).
- WebTransport (WebSocket is the proposal's fallback), KTX2 textures (WebP and JPEG for now), adaptive music stems, far-tree impostors.
