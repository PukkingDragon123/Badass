# BADASS APOCALYPSE

A 3D roguelike driving survivors game. You have a car. There are a lot of zombies.
Drive through them, jump over them, ram them, and collect upgrades until the screen
is more gore than road.

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
| `1` `2` `3` | Pick an upgrade |
| `P` / `ESC` | Pause · `M` Mute |

Gamepad works too (left stick, RT/LT, A to jump, B/RB to drift). On touch: left half
of the screen steers, right half is the gas, two fingers drift, tap right to jump.

## How it plays

**Ramming is your primary weapon.** Damage scales with impact speed, so the game is
about keeping momentum through the horde instead of picking fights standing still.
Get slow inside a crowd and they start clawing the paint off.

**Drift → turbo.** Hold `SHIFT` through a corner and the charge builds through three
stages — blue, orange, purple. Release for a speed surge, and rammed zombies take
60% extra damage while it lasts. Sliding sideways through a pack at full charge is
the whole game in one move.

**Air is free damage.** Ramps are scattered everywhere. Hit one at speed for a launch,
spin for style points, and press `SPACE` again mid-air to slam down into a shockwave.
Long airtime pays out bonus scrap.

**Level up, get weirder.** Kills drop scrap. Fill the bar and the game pauses for three
cards. Weapons stack and fire on their own:

🔱 Ram Spikes · 🚀 Rocket Launcher · ⚙️ Buzz Spin · 🔥 Flame Exhaust
🔫 Roof Minigun · ⚡ Tesla Coil · 💣 Drop Mines · 💥 Shock Slam

…plus ten passives (engine, tires, armour, magnet, overdrive, hydraulics, …). Everything
maxes at level 5, so a run is about which six things you commit to.

**The wasteland fights back too.** Explosive barrels chain-react, wrecks and lampposts
break under a hard enough hit, and crates drop repairs. A behemoth shows up roughly
every two minutes and does not care about your build.

## Under the hood

Everything is hand-rolled — a good chunk of the work here is the renderer, not the game.

```
src/math.js        vectors, mat4, springs, damping helpers
src/geometry.js    procedural meshes (box, sphere, cylinder, cone, disc, ring, saw)
src/shaders.js     GLSL: toon scene shader, ground, sky, decals, blob shadows, post
src/render.js      WebGL2 instanced renderer, MRT emissive buffer, bloom + composite
src/audio.js       WebAudio synth: engine, tyres, impacts, and a procedural soundtrack
src/particles.js   pooled particles, shockwaves, blood decals, floating combat text
src/car.js         arcade vehicle physics, suspension springs, squash & stretch
src/world.js       endless chunked wasteland, ramps and destructible props
src/enemies.js     the horde: spatial hash, separation, animation, ragdolls
src/weapons.js     the auto-firing arsenal
src/upgrades.js    the roguelite card pool
src/hud.js         DOM HUD, level-up cards, results screen
src/game.js        loop, director, camera, hitstop / shake / slow-mo
```

**Rendering.** One instanced draw call per mesh type per layer. The whole horde —
several thousand boxes — is a handful of `drawElementsInstanced` calls. Fragments write
albedo and emissive to two render targets; the emissive target gets blurred and added
back for bloom. Post does chromatic aberration, radial speed streaks, vignette and a
filmic knee. Shadows are darkening blobs, blood is a ring buffer of procedurally-shaped
ground decals.

**Feel.** The bounce is deliberate: body pitch and roll are under-damped springs driven
by acceleration, landings drive a squash/stretch spring that overshoots, kills trigger
a few frames of hitstop, and the camera runs a trauma-squared shake with FOV that opens
up with speed. Physics is per-second everywhere, so it behaves identically at 30 or 144 Hz.

**No assets.** Meshes are generated from code, ground and sky are noise in a fragment
shader, and the audio is oscillators and filtered noise — including the soundtrack, which
scales its tempo and intensity with how much trouble you are in.
