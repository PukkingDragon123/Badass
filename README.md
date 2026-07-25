# BADASS APOCALYPSE

A 3D roguelike driving survivors game. You have a monster truck. There are a lot of
zombies. Drive through them, jump over them, ram them, and collect upgrades until the
screen is more gore than road.

Runs in any browser with WebGL2. **No engine, no libraries, no assets** — every mesh,
texture, sound and note is generated procedurally at runtime.

## Play

```bash
npm start          # serves on http://localhost:8080
```

Or build the single-file version and just double-click it:

```bash
npm run build      # -> dist/badass-apocalypse.html (opens straight off the filesystem)
```

## Controls

| Input | Action |
| --- | --- |
| `W` / `↑` | Throttle |
| `A` `D` / `←` `→` | Steer |
| `S` / `↓` | Brake / reverse |
| `SHIFT` (hold) | Drift — release for a mini-turbo |
| `SPACE` | Jump — press again in the air to slam down |
| `X` / `CTRL` | Nitrous — burns gas for a held speed boost |
| `1` `2` `3` | Pick an upgrade |
| `P` / `ESC` | Pause · `M` Mute · `T` Toggle the touch pad |

**Gamepad**: left stick steers, RT/LT throttle and brake, A jumps, B/RB drifts, X/LB nitrous.

**Touch**: a full on-screen rig appears automatically on any touch device (or press `T`).
A real steering wheel you grab and rotate — self-centring when you let go, with a
straight left/right drag as a fallback if you grab the hub — plus GAS, BRAKE, NOS, DRIFT
and JUMP buttons under your right thumb. The HUD reflows out of the thumbs' way while
the pad is up.

## How it plays

**Ramming is your primary weapon.** Damage scales with impact speed, so the game is
about keeping momentum through the horde instead of picking fights standing still.
Get slow inside a crowd and they start clawing the paint off.

**Drift → turbo.** Hold `SHIFT` through a corner and the charge builds through three
stages — blue, orange, purple. Release for a speed surge, and rammed zombies take
60% extra damage while it lasts. Sliding sideways through a pack at full charge is
the whole game in one move.

**Gas is a resource.** The nitrous bottles in the bed hold your gas. Hold `X` to burn it
for a sustained boost — top speed climbs from ~43 to ~60 and the exhaust stacks light up.
It trickles back when you're off the throttle, and red jerry cans are scattered across the
wasteland: drive over one for a big refill. The bottles on the truck visibly empty as you
burn through it.

**Air is free damage.** Ramps are scattered everywhere. Hit one at speed for a launch,
spin for style points, and press `SPACE` again mid-air to slam down into a shockwave.
Long airtime pays out bonus scrap.

**Level up, get weirder.** Kills drop scrap. Fill the bar and the game pauses for three
cards. Weapons stack and fire on their own:

Ram Spikes · Rocket Launcher · Buzz Spin · Flame Exhaust
Roof Minigun · Tesla Coil · Drop Mines · Shock Slam

…plus eleven passives (engine, tires, armour, magnet, overdrive, hydraulics, big tank, …).
Everything maxes at level 5, so a run is about which six things you commit to. Each one
gets its own hand-drawn pixel-art icon on the card and in the HUD.

**The wasteland fights back too.** Explosive barrels chain-react, wrecks and lampposts
break under a hard enough hit, and crates drop repairs, gas or scrap. A behemoth shows up
roughly every two minutes and does not care about your build.

**The horde is not one zombie repeated.** Every walker rolls a cosmetic variant — skin
tone, shirt, trousers, build, stoop, and headgear from caps to hard hats to riot helmets —
and some spawn already missing an arm or with their ribs showing. Runners are lean and
hunched, bombers are bloated and glowing, brutes wear riot armour. The boss is its own
model: a hunched slab of meat with a prised-open ribcage around a burning core, spiked
pauldrons, one grotesquely oversized clawed arm and swinging chains. Its armour plates
shed as you take it apart, and the core burns brighter the closer it is to death.

**Gore.** Kills hand the body to a verlet ragdoll — head, chest, hip, hands and feet
bound by distance constraints — that folds over the bumper, tumbles, bleeds a trail while
it slides, and settles into a pool. Hit hard enough and limbs tear off at the joint;
hit *very* hard and heads come off. Explosions fling every corpse in range, and the truck
punts them around long after they've stopped moving.

## Under the hood

Everything is hand-rolled — a good chunk of the work here is the renderer, not the game.

```
src/math.js        vectors, mat4, springs, damping helpers
src/geometry.js    procedural meshes (box, sphere, cylinder, cone, disc, ring, saw)
src/pixelart.js    16x16 pixel-art icons, drawn as character grids and rasterised
src/shaders.js     GLSL: toon scene shader, ground, sky, decals, blob shadows, post
src/render.js      WebGL2 instanced renderer, MRT emissive buffer, bloom + composite
src/audio.js       WebAudio synth: engine, tyres, impacts, and a procedural soundtrack
src/particles.js   pooled particles, shockwaves, blood decals, floating combat text
src/ragdoll.js     verlet ragdolls, dismemberment, blood trails and pooling
src/car.js         monster truck: arcade physics, per-corner suspension, nitrous
src/world.js       endless chunked wasteland, ramps and destructible props
src/enemies.js     the horde: spatial hash, separation, animation, ragdolls
src/weapons.js     the auto-firing arsenal
src/upgrades.js    the roguelite card pool
src/mobile.js      on-screen steering wheel, pedals and buttons
src/hud.js         DOM HUD, level-up cards, results screen
src/game.js        loop, director, camera, hitstop / shake / slow-mo
```

**Rendering.** One instanced draw call per mesh type per layer. The whole horde —
several thousand boxes — is a handful of `drawElementsInstanced` calls. Fragments write
albedo and emissive to two render targets; the emissive target gets blurred and added
back for bloom. Post does chromatic aberration, radial speed streaks, vignette and a
filmic knee. Shadows are darkening blobs, blood is a ring buffer of procedurally-shaped
ground decals.

**Feel.** The bounce is deliberate. Body pitch and roll are under-damped springs driven
by acceleration, so the truck wallows into a corner and overshoots coming
out. Each of the four wheels runs its own spring that chases the ground beneath it, so the
chassis articulates over ramps and debris and the tyres visibly rebound on landing.
Landings drive a squash/stretch spring, kills trigger a few frames of hitstop, and the
camera runs a trauma-squared shake with FOV that opens up with speed. Physics is
per-second everywhere, so it behaves identically at 30 or 144 Hz.

**Icons.** Every upgrade icon is pixel art authored as a 16x16 character grid with a
per-icon palette (`src/pixelart.js`), rasterised into an ImageData at load and upscaled
with smoothing off. No emoji, no sprite sheet, no font dependency — they look the same
on every platform.

**No assets.** Meshes are generated from code, ground and sky are noise in a fragment
shader, icons are hand-authored pixel grids, and the audio is oscillators and filtered
noise — including the soundtrack, which scales its tempo and intensity with how much
trouble you are in.
