# BADASS APOCALYPSE

A 3D driving-survivors roguelite with a **side-on bunker** underneath it. Walk your bunker,
dig new rooms, put crew to work turning wood into planks and ore into metal, then take the
truck up the ramp and go get more.

The truck starts slow, weak, unarmed and unable to jump. **There is no levelling.** Nothing
is handed to you mid-run — every single upgrade is hardware you built in a room you dug.

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

**In the bunker** (side-scroller):

| Input | Action |
| --- | --- |
| `A` `D` / `←` `→` | Walk |
| `W` `S` / `↑` `↓` | Up and down the stairwell (stand in the shaft) |
| `E` | Use whatever you're standing in front of — a room, an empty bay, bare rock |
| `Q` | Deploy on a run |

**On the road:**

| Input | Action |
| --- | --- |
| `W` / `↑` | Throttle |
| `A` `D` / `←` `→` | Steer |
| `S` / `↓` | Brake / reverse |
| `SHIFT` (hold) | Drift — release for a mini-turbo |
| `SPACE` | Jump — press again in the air to slam down (needs Hydraulic Rams) |
| `X` / `CTRL` | Nitrous — burns gas for a held speed boost (needs the NOS Injector) |
| `P` / `ESC` | Pause · `M` Mute · `T` Toggle the touch pad |

**Gamepad**: left stick steers, RT/LT throttle and brake, A jumps, B/RB drifts, X/LB nitrous.

**Touch**: a full on-screen rig appears automatically on any touch device (or press `T`).
Driving gets a real steering wheel you grab and rotate — self-centring when you let go —
plus GAS, BRAKE, NOS, DRIFT and JUMP under your right thumb. The bunker swaps that out for
a walk pad and a USE button.

## The bunker

The whole base is a **cutaway you walk around in**. Six floors deep, eight bays wide, with a
stairwell down the left edge. Everything except the stairwell starts as solid rock.

- **Excavate** a bay by standing at the rock face and pressing `E`. Deeper rock costs more,
  and past floor 3 it needs concrete to shore up.
- **Sink the stairwell** one floor at a time to reach the depth below.
- **Build** a room in any excavated bay, **expand** it sideways into the bay next door (up to
  three wide, which is what raises its crew cap), and **upgrade** its level.

### Three kinds of room

**PRODUCTION** — pulls raw material out of the ground on its own:
Timber Shaft (wood) · Mine Shaft (ore) · Stone Quarry (stone) · Salvage Bay (scrap) ·
Hydroponics (food) · Fuel Derrick (fuel)

**PROCESSING** — refines one tier into the next:
Sawmill (wood → planks) · Smelter (ore + fuel → metal) · Nail Press (metal → nails) ·
Machine Shop (metal → bolts) · Concrete Mixer (stone + scrap → concrete) ·
Assembly Line (planks + bolts + nails → parts)

**SPECIAL** — everything that isn't a rate:
**Garage** (fit truck components) · **Research Lab** (parts → tech, unlocks perks) ·
**Armory** (builds every weapon, makes ammo) · Crew Quarters (bunks) ·
Generator (burns fuel for power)

A processing room with nothing to eat goes **STARVED** and its status lamp turns red. Run
short on power and the whole bunker slows down rather than stopping dead. Let the generator
run dry and you have no power at all.

### Fourteen resources, three tiers

Raw — **wood, ore, stone, scrap, fuel, food** — comes off the road and out of production rooms.
Refined — **planks, metal, nails, bolts, concrete** — only from processing rooms.
Crafted — **parts, ammo, tech** — from the assembly line, the armory and the lab.

Almost nothing worth having is buyable with what you can pick up directly. Armour wants
nails, an engine wants parts, a railgun wants tech. The chain is the game.

### Crew

Survivors you pull off the road come home with a **profession** and a **trait**, and both
are real numbers. A Miner in the Mine Shaft contributes 1.00; a Miner in the Sawmill
contributes 0.50. **Tireless** multiplies output by 1.35, **Green** by 0.75, **Strong** only
helps in production rooms. Assign them per-room from the room panel, which shows you every
idle body and exactly what each would be worth in *that* room.

Assigned crew stand in their room working. Idle crew wander the corridors.

## The run

**Bunker → ramp → sortie → extraction → bunker.** A run has three plainly-stated objectives:

1. **RESCUE** stranded survivors — they stand by the road under a signal flare, and your
   Cargo Bed decides how many fit.
2. **CLEAR WAVES** — three of them, each a kill quota that grows as you go.
3. **EXTRACT NORTH** — the gate is barred until the first two are done.

Halfway up the road there is a **roadside workshop** where you can fit parts mid-run with
what you have hauled so far. Reach the extraction and everything banks. Die and you lose
every passenger and half the haul.

Four stages, each with its own ground shader, fog, prop mix and loot bias: **Pinewood Estate**
(streets, houses, a supermarket at the end), **Crestview Mall**, **Blackpine Woods** (pays in
wood and food), **The Outer Waste** (pays in fuel).

**Friendlies.** Every survivor you rescue grabs a rifle and fights alongside you for the rest
of the run. Stray dogs join up and charge the horde; cats bolt from everything.

## Upgrading, and watching it happen

Buy something in the garage and **the driver climbs down out of the cab**, walks to the part
of the truck that changed — nose for the engine, wheels for the hydraulics, bed for the cargo
rig, roof for a gun — kneels, and works on it with a spanner and then a torch, throwing
sparks, before climbing back in. Roof-mounted hardware gets both hands up in the machine
instead. Then the shop reopens where you left it.

**Eleven chassis components** in the garage: engine, turbo, tires, **hydraulic rams (unlocks
JUMP)**, armour plating, ram plow, fuel cell, cargo bed, salvage rig, weapon mount and the
**NOS injector (unlocks NITROUS)**. Ram spikes too — they bolt to the plow, so they're the
one weapon you can have before you build an armory.

**Ten weapons** in the armory, gated on its level: minigun, buzz spin, flame exhaust, rocket
pod, mine dropper, tesla coil, shock slam, drone swarm, laser array, railgun. Your **weapon
mount** decides how many deploy at once — build more than you can carry and only your best
guns roll out.

**Five perks** in the lab, bought with tech: Overdrive ECU, Coolant Loop, **Blood Pump**
(kills repair the truck), **Chain Charges** (corpses detonate), **Apex Package**.

## How it drives

**Ramming is your primary weapon.** Damage scales with impact speed, so the game is about
keeping momentum through the horde instead of picking fights standing still.

**Drift → turbo.** Hold `SHIFT` through a corner and the charge builds through three stages —
blue, orange, purple. Release for a speed surge, and rammed zombies take 60% extra damage
while it lasts.

**Gas is a resource.** Hold `X` to burn it for a sustained boost — top speed climbs from ~43
to ~60. Red jerry cans are scattered across the wasteland. Your Fuel Derrick decides how full
you roll out.

**Air is free damage.** Ramps everywhere. Hit one at speed, spin for style, press `SPACE`
again mid-air to slam down into a shockwave.

## The horde

Walkers, runners, bombers and brutes, plus **spitters** that lob arcing acid, **snipers** that
hold at 40 metres and paint you with a laser sight, and **screamers** that call a fresh mob
down on your position. Everything scales with both the clock and how far north you've pushed.

**The model.** Every zombie is a jointed rig — hunched spine, visible neck, a skull with a
brow ridge, sunken glowing eye sockets and a jaw hanging open over its teeth. Arms reach with
bent elbows and hooked fingers; each one rolls a limp, so no two shamble the same way. Some
spawn already missing an arm or with their ribs showing through a torn shirt. Runners are
lean, bombers are bloated and glowing, brutes wear riot armour. The boss is its own model.

**Gore.** Kills hand the body to a verlet ragdoll that folds over the bumper, tumbles, bleeds
a trail while it slides, and settles into a pool. Hit hard enough and limbs tear off; hit
*very* hard and heads come off.

## Under the hood

Everything is hand-rolled — a good chunk of the work here is the renderer, not the game.

```
src/math.js        vectors, mat4, springs, damping helpers
src/geometry.js    procedural meshes (box, sphere, cylinder, cone, disc, ring, saw)
src/actor.js       articulated humanoid rig: bones, joints, walk/climb/wrench/weld/drive
src/pixelart.js    16x16 pixel-art icons, drawn as character grids and rasterised
src/shaders.js     GLSL: toon scene shader, ground, sky, decals, blob shadows, post
src/render.js      WebGL2 instanced renderer, MRT emissive buffer, bloom + composite
src/audio.js       WebAudio synth: engine, tyres, impacts, and a procedural soundtrack
src/particles.js   pooled particles, shockwaves, blood decals, floating combat text
src/ragdoll.js     verlet ragdolls, dismemberment, blood trails and pooling
src/car.js         monster truck: arcade physics, per-corner suspension, nitrous
src/world.js       endless chunked wasteland, ramps and destructible props
src/enemies.js     the horde: spatial hash, separation, the jointed zombie model
src/weapons.js     the auto-firing arsenal
src/meta.js        persistent save: the resource chain, rooms, crew, components
src/bunker.js      the side-on bunker: floors, bays, rooms, crew, the fix cinematic
src/garage.js      garage / armory / lab, opened from the matching room
src/stages.js      stage table and the per-stage procedural generators
src/allies.js      armed escorts, stray dogs, and cats
src/mobile.js      on-screen steering wheel, pedals, and the bunker walk pad
src/hud.js         DOM HUD and results screen
src/game.js        loop, director, camera, hitstop / shake / slow-mo
```

**The rig.** `src/actor.js` places bones in an actor's own (forward, up, side) frame and aims
each one into world space, so the same skeleton drives the driver in the cab, the crew working
the bunker, and the horde. Poses are joint angles solved in the sagittal plane — walk, climb,
wrench, weld, reach-up, drive.

**Rendering.** One instanced draw call per mesh type per layer. The whole horde — several
thousand boxes — is a handful of `drawElementsInstanced` calls. Fragments write albedo and
emissive to two render targets; the emissive target gets blurred and added back for bloom.
Post does chromatic aberration, radial speed streaks, vignette and a filmic knee.

**Feel.** Body pitch and roll are under-damped springs driven by acceleration, so the truck
wallows into a corner and overshoots coming out. Each wheel runs its own spring. Landings
drive a squash/stretch spring, kills trigger a few frames of hitstop, and the camera runs a
trauma-squared shake with FOV that opens up with speed. Physics is per-second everywhere, so
it behaves identically at 30 or 144 Hz.

**No assets.** Meshes are generated from code, ground and sky are noise in a fragment shader,
icons are hand-authored 16x16 pixel grids, and the audio is oscillators and filtered noise —
including the soundtrack, which scales its tempo with how much trouble you are in.
