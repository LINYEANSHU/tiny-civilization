# Tiny Civilization

[简体中文](README.md) · **English** · [CI](https://github.com/LINYEANSHU/tiny-civilization/actions/workflows/ci.yml)

<img src="assets/readme/hero-en.svg" width="100%" alt="Tiny Civilization: a browser voxel civilization that develops on its own; illustrated village, fields and villagers">

**Give the world a seed. Watch villages turn into history.**
Villagers gather, farm and build on a procedural voxel continent. Settlements form nations; trade and war enter the chronicle.
Watch quietly, or change the weather, plant a forest or found a settlement.

<img src="assets/readme/current-desktop.png" width="100%" alt="Current interface, November 6, 2026: a coastal voxel settlement, world information, bottom time controls and a corner map">

<details>
<summary>View the narrow layout (390 × 844)</summary>

<img src="assets/readme/current-mobile.png" width="390" alt="Narrow civilization layout: the settlement stays central, tools collapse at the top and time controls wrap at the bottom">

</details>

Captured during the November 6, 2026 desktop Chromium review with SwiftShader CPU WebGL rendering. Physical phone hardware was not tested.

## How the world develops

- **Seeded terrain.** The logical world spans 10,000 × 10,000 blocks and generates in chunks. A seed reproduces its initial terrain.
- **Settlements have needs.** Residents gather and farm; settlements expand around food, housing, storage and other demands.
- **Distance changes simulation detail.** Nearby villagers run individual behaviors; remote settlements use aggregate simulation over the same population and resource state.
- **The environment has consequences.** Seasons, weather, floods, wildfires and disease affect the evolving world.
- **History is traceable.** Nations, trade routes, wars and conquest appear on the full map and in a filterable chronicle.

There are no victory conditions or quests. Time controls and god tools let you compare long-term changes and return to ordinary observation anytime.

## Getting started

Requires Node.js 22+, npm and a modern desktop browser supporting WebGL 2.

```bash
git clone https://github.com/LINYEANSHU/tiny-civilization.git
cd tiny-civilization
npm ci
npm run dev
```

Open `http://127.0.0.1:8138` and wait for world generation.
Choose a settlement under “Tools & settlements”, or open the map to jump elsewhere.

```text
http://127.0.0.1:8138/?seed=my-world
```

The URL's `seed` sets the initial world. Generated seeds are written back to the URL so reloading can find the matching autosave.

```bash
npm run build       # output: dist/
npm run preview     # preview the production build
```

If Windows PowerShell blocks npm scripts, use `npm.cmd` for the same commands.

## Observe and intervene

| Action | Input |
| --- | --- |
| Pan / orbit / zoom | Left-drag or WASD / middle-drag / scroll |
| Inspect a resident or settlement | Click a villager, building or ground |
| Pause / change speed | `Space` / bottom 1×–256× buttons |
| Long-term evolution | +1, +10 and +100 year buttons |
| Full map / close panels | `M` / `Escape` |
| Chronicle / saves | Corresponding bottom buttons |
| Weather, disasters, food gifts | God tools under “Tools & settlements” |
| Performance details | `F3` |

Use sunlight lock during accelerated simulation to reduce day/night flicker. The language button switches Chinese and English.

## Save, export and restore

IndexedDB autosaves every 3 minutes and provides 3 manual slots.
The bottom save panel supports saving, loading, deleting and JSON export/import.
Saves include the seed, clock, settlements, nations, voxel-edit journal, history and camera state.

Loading a slot reloads the page with that save's seed. A refresh restores the autosave only when its seed matches the URL.
A seed preserves the initial world; an evolved world also needs its save. Export backups before clearing site data.

## Verification and limits

Re-run on November 6, 2026:

```bash
node _verify_optim.mjs check
npm run build
```

- Every `src/**/*.js` file passed `node --check`; the production build passed.
- The existing CPU behavior verifier matched baseline **`92fb878f`**, covering terrain, noise, claims, blocks and mesh-clipping equivalence.
- The same-day browser review covered desktop/narrow layouts, settlement selection, Chronicle, manual slots, map, language switching and seed persistence on reload.
- The game uses Three.js / WebGL 2. The review used SwiftShader CPU rendering; normal startup does not force CPU rendering.
- There is no npm unit-test suite. Long-term population/war balance, other browser engines and real touch hardware were not verified; nested save fields do not yet have a complete security validator.

## Development entry points

`src/world/` handles terrain, chunks and Worker meshing; `src/sim/` handles residents, settlements, nations and time; `src/save.js` handles persistence.
See [DESIGN.md](DESIGN.md) for the design notes (Chinese).

## Contributors

[LINYEANSHU](https://github.com/LINYEANSHU)

## License and sources

[MIT](LICENSE) © 2026 LINYEANSHU. Runtime rendering uses [Three.js](https://threejs.org/); development and builds use [Vite](https://vite.dev/).
Terrain, meshing and textures continue the author's WorldForge work. Chunked voxel world management draws inspiration from [Minecraft](https://www.minecraft.net/).
