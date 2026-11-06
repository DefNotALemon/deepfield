# DEEPFIELD architecture (frozen interfaces)

Vanilla ES modules + three.js r170 (`vendor/three.module.js`, imported by **relative path**
`import * as THREE from '../vendor/three.module.js'` — works in the browser with no importmap, and in
node for tests). No build step. `package.json` has `"type": "module"`, so `node --check src/*.js` lints
and `.mjs` tests run directly.

## File ownership (do not edit files you do not own)

| Owner | Files |
|---|---|
| Lead (Hermes) | `index.html`, `style.css`, `src/util.js`, `src/data.js`, `src/sim.js`, `src/contracts.js`, `src/items.js`, `src/weapons.js`, `src/player.js`, `src/carry.js`, `src/hud.js`, `src/tablet.js`, `src/hub.js`, `src/cruise.js`, `src/audio.js`, `src/input.js`, `src/state.js`, `src/main.js`, `docs/BRIEF.md`, `docs/ARCH.md`, `README.md` |
| Builder A (site) | `src/gen.js`, `src/build.js`, `test/gen.test.mjs`, `docs/SITE.md` |
| Builder B (people) | `src/human.js`, `src/life.js`, `test/human.test.mjs`, `docs/PEOPLE.md` |
| Builder C (threats) | `src/hostile.js`, `test/hostile.test.mjs`, `docs/COMBAT.md` |

Nobody runs `git` — the lead commits after verifying. Never edit another owner's file: if an interface
needs to change, note it in your `docs/*.md` and design around it.

## Shared vocabulary

Units are **metres** and **seconds**. One grid cell = 1 m. `+y` is up. A humanoid faces **-z** when its
yaw is 0 (`face(a) = atan2(-dx, -dz)`), same as the player camera. Cell index `i = z * w + x`.

`site` (from `gen.js`) is the data model of one dive. `build` (from `build.js`) is its meshes.
`ctx` is the per-frame world the lead passes into every AI tick:

```js
ctx = {
  dt, time,                    // seconds
  player: {x, z, y, eyeY, yaw, dead, crouch, hands:[], noise},   // noise = 0..1.5 loudness right now
  site, build, nav,            // nav = site.nav (grid) and build.nav (height/collision aware)
  rng,                         // seeded rng() from util.js
  sound(type, x, z, loud),     // AI calls this when it makes noise: 'step'|'shot'|'door'|'drop'|'scream'|'tool'
  hurt(amount, source)         // AI damages the player
  kill(npc)                    // AI kills an NPC (crew or foe)
  event(type, data),           // AI raises a world event ('rival_arrived', 'alien_fed', ...)
  log(line),                   // AI writes diegetic text into the run log/HUD feed
  foes, crew,                  // live arrays (both directions: AI can push to them)
}
```

## `src/gen.js` — pure site generator (Builder A)

```js
export function generateSite(spec) -> site
export function roomAt(site, x, z) -> room | null          // room = rooms[i] where cellRoom[i] == i
export function reachable(site, a, b) -> bool              // grid A* over open cells (util.pathfind)
export function openSpots(site, roomId, n, rng) -> [{x,z,y}]
```

`spec` (everything the lead passes in):

```js
{ seed: 12345, kind: 'derelict'|'station'|'refinery'|'lab'|'mine'|'outpost',
  size: [w, h],            // grid cells; use SITE_KINDS[kind].size when absent
  crewCount: 6, hostileCount: 5, alien: true, vault: true,
  incident: 'deal'|'rogue'|'organism'|'gas'|'mutiny'|'lockdown'|'quiet'|'purge',
  lootTier: 1..4,          // drives how good the container contents are
  faction: 'syndicate',    // owner (see data.js FACTIONS) — colours the rooms and props
  name: 'the Longwake' }
```

`site`:

```js
{
  seed, kind, w, h, name, faction, incident, lootTier,
  open: Uint8Array(w*h),        // 1 = walkable floor
  cellRoom: Int16Array(w*h),    // room index or -1
  rooms: [{ id, kind, style, label, x, z, w, d, cx, cz, spot:{x,z}, area, value, tier }],
  doors: [{ id, x, z, dir: 'x'|'z', kind: 'door'|'arch'|'duct'|'sealed'|'airlock',
            roomA, roomB, width }],
  ducts: [{x, z}],              // crawl-only: walkable only while crouched
  runs: [{ x0, z0, x1, z1, room, style, side: 'n'|'s'|'e'|'w', roomId, other: roomId|null }],
  props: [{ kind, x, z, ry, roomId }],          // kind from a list you define in docs/SITE.md
  containers: [{ id, kind, x, z, ry, roomId, sealed:bool, contents:[{id, n}] }],
  lights: [{ x, y, z, roomId, broken:bool }],
  hazards: [{ kind: 'gas'|'vacuum'|'fire'|'dark', roomId, x, z, r }],
  spawn: {x, z}, exfil: {x, z}, vault: {x, z, roomId}|null,
  vents: [{x, z}],              // where the alien can enter/leave
  nav: { w, h, blocked(i), open(i), idx(x,z) },
  stats: { rooms, doors, containers, propCount },
}
```

Hard rules (these are what the tests check):

1. `spawn` and `exfil` are distinct, both on floor cells, and connected to every non-vault room.
   Flood-fill proof over `open` minus sealed doors must reach every room's `spot`.
2. No door opens into a wall cell; two doors never share a cell; `ducts` never sit on a door.
3. Containers/props never block a door cell or the cell in front of a door, and never sit on
   `spawn`/`exfil`.
4. Same `spec` ⇒ identical `site` (digest the JSON-safe fields in the test).
5. `lootTier` and `incident` must be visible in `contents`: a `deal` site holds spice/`evidence`, an
   `organism` site holds `biomatter`, a `rogue` site holds `dataspool`/`servo`, etc. (Reuse item ids
   from `data.js` ITEMS; add `{id:'chit', n:3}` style stacks.)
6. Ruin it a little: solar-flare damage, a hull breach room with `vacuum`, welded doors, cold rooms.
   A site should look like it has history, not like a floor plan.

## `src/build.js` — site meshes (Builder A)

```js
export function buildSite(site, opts = {}) -> build
export function buildContainer(c, rng, alloc) -> { mesh, collider, rig }   // one container's rig
export function disposeSite(build)
```

```js
build = {
  root,                       // THREE.Group, add to scene
  colliders: [{ min:{x,y,z}, max:{x,y,z}, kind:'wall'|'prop'|'door'|'hull' }],
  doors: [{ id, mesh, collider, x, z, dir, state:'closed'|'open'|'sealed'|'locked', amount:0..1,
            set(t), setState(s) }],
  containers: [{ id, mesh, collider, x, z, y, contents, open:0..1, rig:{t,want,tray,apply(e)},
                 hoverPoint:{x,y,z} }],
  props: [{ kind, mesh, x, z, y, collider|null }],
  lights: [{ x, y, z, roomId, on, mesh, set(on) }],
  interactables: [{ kind:'container'|'door'|'breaker'|'terminal'|'lift'|'vent',
                    x, y, z, radius, ref }],
  nav: { isOpen(x,z), heightAt(x,z), blockedCell(x,z), cellBlocked(i) },
  bounds: { min:{x,y,z}, max:{x,y,z} },
  stats: { meshes, drawCalls },
}
```

Rules: procedural materials only (canvas textures built from `data.js` tints; no downloaded art, no
external files). Every mesh must be merged/batched where it repeats (walls, floors, plating, pipes) —
one mesh per material signature per room, not per panel. Lights come from real fixtures (a ceiling
lamp, a strip, a screen, an emergency red) and can be switched by the breaker system. Build the airlock
where `site.spawn` is so the player's ship clamp reads as a real dock. Aim for < 2500 meshes for a
`size:[42,32]` station, and print `build.stats` in your test.

## `src/human.js` + `src/life.js` — the people (Builder B)

```js
// human.js — three.js rigs (procedural humans, no external models)
export function buildHuman(seed, opts = {}) -> THREE.Group      // ~1.7-1.9 m tall, feet at y=0
export function animateHuman(h, o)                             // stateful; weights ease internally
export function setOutfit(h, outfit)                           // 'crew'|'spacer'|'guard'|'dock'|'medic'|'suited'
export function faceOf(h) -> THREE.Object3D                    // the head joint (for eye position)
export const OUTFITS = ['crew', 'spacer', 'guard', 'dock', 'medic', 'suited'];
```

`o` (all optional, called every frame): `{ dt, v, strafe, back, crouch, look, aim, wave, talk, sit,
work:'counter'|'console'|'floor'|null, mood:'calm'|'scared'|'angry'|'hurt'|'dead', gaze:{x,y,z},
headYaw, hitReact:{k,fromX,fromZ}, ko:bool, carry:'none'|'one'|'both' }`.

Realism rules carried over from Space Ranger/Rimrunner (they are Lemon's standing rules):

- Feet are grounded by IK (hips ride the lowest foot) — soles stay within ~5 mm of the floor across
  walk/run/crouch. Verify numerically with `Box3.setFromObject(foot, true)` over phases.
- Looking **down** tilts the head **forward** (chin toward chest); looking up tilts it back. The head
  and neck never clip through the torso, collar or backpack.
- Crouch is a two-bone IK squat (hips drop and move **back**): never lower hips straight down.
- Walk 1.4 m/s, run 4.4 m/s, sprint 5.0 m/s; cadence follows speed so feet do not skate.
- Draw cost matters: bake same-material meshes per joint (aim for ~45-70 meshes per body). The dive can
  have 8-14 bodies on screen, so this is a real budget. Faces may stay separate.

```js
// life.js — who lives here and what they are doing about it
export function populateSite(site, opts) -> crew[]   // opts: {ctx, incident, faction, hostileCount, rng}
export function updateCrew(crew, ctx)                // dt comes from ctx.dt
export function talkTo(npc, ctx) -> { greeting, options: [{ label, act, data? }] }
export function crewStats(crew) -> { alive, hiding, panicked, armed, dead }
```

An `npc`: `{ id, seed, name, role, h, x, z, y, yaw, state, mood, hp, weapon|null, home, routine, fear,
armed, knows:{player}, dead, spoke:{}, talk(ctx), tick(ctx) }`.

**The incident is the personality.** The same six people behave totally differently depending on what
is happening to them, and the crew must be readable as *people having a bad day*, never as a patrol:

| incident | the crew |
|---|---|
| `deal` | port-deck hands running something between two parties; a couple of armed lookouts who watch you, one nervous negotiator, a worker who saw too much and is hiding |
| `mutiny` | two factions of the same crew, armed, in different rooms, trading threats; a few hiding in a store room; one wounded in the open |
| `rogue` | the AI sealed them in; they hide, whisper, avoid cameras, and one is working the breakers to get out |
| `gas` | whoever got a mask is barricaded in a clean room; the rest are down where they fell (bodies, not corpses-npcs) |
| `organism` | they stopped talking and started listening; they hide, they flinch at sound, they point at vents, they will not go near one room |
| `purge` | a corporate burn clock; they are packing, arguing, and trying to reach the clamp. Some will trade you for a ride |
| `lockdown` | they stay in quarters behind locked doors, and will talk through the door but not open it |
| `quiet` | normal work, normal shifts, normal resentment. Nothing is wrong yet, which is worse |

Crew can: work a station, walk a route, hide, flee, panic-crouch, scream (loud! the alien hears it),
beg, trade, hand over a tip, refuse, or (if armed and the incident warrants it) shoot at the player or
at each other. They know the site better than you: a talk option should be able to reveal a real fact
computed from the live site (where the vault is, that the portside deck is hot, that the alien took
someone in the galley, who is paying whom).

## `src/hostile.js` — the things that want you dead (Builder C)

```js
export function populateThreats(site, opts) -> foes[]     // opts: {ctx, incident, faction, count, rng, crew}
export function updateThreats(foes, ctx)
export function damageFoe(f, amount, from, ctx) -> bool    // true if it died
export function spawnRivalSquad(site, build, rival, opts) -> foes[]   // rival + their hired guns
export function threatStats(foes) -> { alive, alerted, hunting, dead, alien }
```

A `foe`: `{ id, kind, name, h, x, z, y, yaw, hp, maxHp, weapon|null, state:'idle'|'patrol'|'alert'|
'hunt'|'attack'|'flee'|'feed'|'vent'|'dead', alert:0..1, lastHeard:{x,z,t}, home, patrol:[], dead }`.

Kinds: `crew_gun` (a scared person with a gun — jumpy, poor aim, will run), `mutineer` (the other half
of a split crew), `syndicate` (professional, holds a corner, calls for backup), `guard` (corporate
security, disciplined, uses cover), `robot_drone` (hoverer, taser, must face you and have line of
sight), `robot_walker` (heavy, slow, hits hard), `alien` (see below), `rival` (another rimrunner in a
suit — smart, will loot while you hide, will leave with your haul) and `rival_gun` (their hireling).

Hard rules:

1. **Sound is the sense.** No enemy sees through walls. Hostiles hear `ctx.sound()` events (a step is
   quiet, a sprint is loud, a shot is very loud, a dropped heavy item is a dinner bell) inside a radius
   that depends on loudness, and they investigate the *position they heard*, then give up. The alien
   uses this exclusively — it does not track you by sight at range, it comes to where you were loud.
2. **The alien cannot be killed, only hurt.** Enough damage and it breaks contact and goes to a `vent`
   cell for 20-60 s, dragging a body if it has one. It kills crew it finds, which should visibly thin
   the population as a run goes on. It is faster than you in a straight line, slower through doors.
3. **Rivals are people with an exit plan.** A rival squad arrives at the airlock, announces itself, and
   works the site for loot on its own: it opens containers, takes items, fights you and the hostiles,
   and will *leave with what it has* after a timer, or if it drops below half strength. It must be
   able to actually pick up a heavy item and carry it out. If the player dies, a rival wearing the
   player's gear is a legitimate outcome.
4. Combat resolution is the lead's: AI never applies damage directly except through `ctx.hurt(amount,
   source)`, and shots are resolved by `src/weapons.js` (the AI calls `ctx.shot(foe, dir)` and the lead
   runs the ballistics). Your job is the decision-making, movement and animation state.
5. Movement uses `site.nav`/`build.nav` grid, not physics; a foe never walks through a wall, and it
   opens doors (closed doors cost it time and make noise: `ctx.sound('door', ...)`).

## Tests (every builder)

`test/<name>.test.mjs`, run with `node test/gen.test.mjs` etc. No frameworks — print `PASS`/`FAIL` lines
and exit non-zero on failure. Headless three.js needs the `document`/`canvas` stubs (copy the pattern in
`test/_stub.mjs`, which the lead provides). Required coverage:

- **A:** 40 seeds × every site kind: connectivity (every room reachable from spawn), determinism
  (digest twice), no door on a wall, no container on a door/threshold, vault sealed until opened,
  incident-specific contents present, `build.stats.meshes < 2500`, and a full `buildSite` run headless.
- **B:** 30 seeds × every outfit: height in range, foot-grounding IK error ≤ 5 mm over 240 frames of
  walk/run/crouch, head-forward-vector sign when looking down, no NaN joint angles; `populateSite` +
  600 ticks of `updateCrew` for every incident with no exception, and every crew member still inside
  `site.open` (nobody walks into a wall or off the map).
- **C:** 30 seeds × every incident: `populateThreats` then 900 ticks with a scripted player (walks,
  sprints, fires, hides) asserting: no foe ever inside a wall cell, alien responds to loud events
  (measures distance-to-heard-position over time), alien retreats to a vent after damage, rival squad
  loots containers and leaves, no exceptions, and `ctx.hurt` is only ever called through the ctx.

## Reporting

Each builder writes `docs/<AREA>.md`: what the module does, its exact exported API, the tuning
constants, the test command and current pass counts, and anything the lead must wire. Report honestly —
a test that does not exist is not a test that passes.
