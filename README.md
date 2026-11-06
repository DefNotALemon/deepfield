# DEEPFIELD

A space extraction shooter on the Rim. Browser game, vanilla ES modules + three.js r170, no build step.

**The pitch.** You work for a buyer you never meet, on a quota you cannot miss, with a hold that only
carries so much. Every site you board is somebody else's bad day, and the reason there is one is that
the galaxy has been having one without you. Bring the haul out before the clock ends, or stay in there
with it. And when you are big enough — become the one who boards other people's runs.

Design brief (canon): [`docs/BRIEF.md`](docs/BRIEF.md). Module contracts: [`docs/ARCH.md`](docs/ARCH.md).

## Run it

```sh
python3 -m http.server 8770      # from the repo root
open http://localhost:8770/            # title screen
open http://localhost:8770/?autostart  # straight into the yard (skips the title)
open http://localhost:8770/?dive       # straight into a site (debug)
open http://localhost:8770/?cruise     # straight into a transit leg (debug)
```

Controls follow whatever you pick up — keyboard + mouse, any gamepad (brand-aware button names), or
touch — and switch live. Everything on screen is generated from `In.label(action)`, so you only ever see
the controls for the thing in your hands. The tablet (`M` / View / TABLET) has a Controls page.

## What is in it

- **A living galaxy** (`src/sim.js`): 8 systems, 8 factions, happenings that start and resolve on their
  own clock, drifting prices per station, a wire written from what actually happened, and named people
  with faces, tempers, ships and a memory of you.
- **Contracts that are missions** (`src/contracts.js`): every offer is an incident (what is happening to
  the people aboard, generated from live world state) plus a job (what somebody is paying you to do
  about it), a payer with a voice, a guessed risk rating and a clock that means something physical.
- **Sites with people in them** (`src/gen.js`, `src/build.js`, `src/human.js`, `src/life.js`): procedural
  hulls and stations packed from a 1 m cell map, dressed by room type, with crew who work, hide, panic,
  deal, argue, shoot at each other or beg you for a ride — behaviour derived from the incident.
- **Something in there with you** (`src/hostile.js`): crew gone wrong, corporate security, security
  robots, rival operators with an exit plan, and an alien that cannot be killed and hunts by sound.
- **A haul you have to carry** (`src/carry.js`): a physical duffel you set down and open, looted with your
  hands; heavy items take both hands (no gun, slower feet, louder boots); noise is the currency.
- **Rivals and the ladder** (`src/state.js`): ranks Nobody → Name. Below Operator you are prey; at
  Operator the hunter's book opens and you can board *their* run for their cargo and their standing.
- **Clocks that kill** (`src/dive.js`): vent, burn, housing, scuttle, security — when the clock runs out
  the site ends with you in it, and everything you were carrying stays for whoever finds it first.

## Layout

```
index.html  style.css
src/util.js       seeded rng, math, A*/flood helpers
src/data.js       factions, commodities, loot, tools, guns, room kinds, names
src/sim.js        the living galaxy (pure)
src/contracts.js  incidents, jobs, payers, the board (pure)
src/state.js      the career, the Office, the ladder, save/load
src/gen.js        procedural site generator (pure)
src/build.js      site meshes, containers, doors, lights
src/human.js      procedural clothed humans + animation
src/life.js       the living crew: routines, panic, talk, per-incident behaviour
src/hostile.js    threats: guns, robots, the alien, rival squads
src/items.js      real meshes for loot and guns
src/carry.js      the haul and the duffel
src/weapons.js    one ballistics path for everyone
src/player.js     movement (Space Ranger constants), camera, hands
src/dive.js       one extraction, start to finish
src/hub.js        the Waystop
src/cruise.js     transit legs: hails, beacons, cutters, wreckage
src/tablet.js     contracts, market, Office, wire, people, hunter's book
src/hud.js        in-dive HUD
src/audio.js      procedural sound (no files)
src/input.js      keyboard/pad/touch auto-detect + brand-aware prompts
src/main.js       mode machine
test/             headless node suites
```

## Tests

No frameworks. `PASS`/`FAIL` lines, non-zero exit on failure.

```sh
node test/sim.test.mjs      # galaxy, contracts, career, Office, saves
node test/gen.test.mjs      # site generator + build (40 seeds x every kind)
node test/human.test.mjs    # rigs: foot grounding, head look, per-incident crew behaviour
node test/hostile.test.mjs  # sound-tracking, vent retreat, rival looting, wall safety
```

Headless three.js needs the canvas stubs in `test/_stub.mjs` (import it first).

## Standing rules this follows

- Input is auto-detected and swaps live; prompts and the title screen come from one lookup, brand-aware
  for pads. Never keyboard-only hints.
- Inventory is a world object, not a menu: the duffel is set down on the deck and the loot is real meshes
  in real slots, grabbed by aiming at them.
- Movement constants come from Space Ranger (`Walk.cs` / `Character.Stance.cs`): walk 4.38, sprint 5.04,
  crouch ×0.5, jump 3.8, g 9.8, ease 14/s.
- Everything procedural: no downloaded art, no external models, sound synthesised at runtime.
- Commit and push to `main`.
