# DEEPFIELD — the brief

*The improved prompt. Lemon's ask, sharpened into something buildable, then built.
This document is canon: everything in the game should be traceable to a line here.*

---

## 0. Lemon's ask (verbatim, canon)

> "make me a space extraction shooter using rimrunner and lethal company as inspiration. take all the
> time you need, and make each extraction like a mission and revolve around what's happening in the
> world. is there an alien in there with you? are all the people going crazy on their own, or are they
> shooting each other because you've found a drug deal? a world needs life, playability, and some risk
> of a high level douch coming in to try and merc you and steal all your shit, but you can always
> become him if you try. use all of the prompts I've given you from space ranger to rimrunner, and
> make it a somewhat realistic java game with so much life."

## 1. The one-line pitch

You are a rimrunner with a buyer you never meet, a quota you cannot miss, and a hold that only carries
so much. Every job puts you inside somebody else's bad day — and the reason there's a bad day is that
the galaxy has been having one without you.

## 2. What the ask turns into (the six pillars)

| # | Pillar | Lemon's words | The rule we build to |
|---|---|---|---|
| 1 | **Each extraction is a mission, with a reason** | "make each extraction like a mission and revolve around what's happening in the world" | No contract without an incident. The incident is generated from live galaxy state: a demand spike on Port Ysolde is *why* there's a drug ring dealing out of the station's port decks — and *why* you find men with guns arguing over a case. |
| 2 | **Something is in there with you** | "is there an alien in there with you?" | Every site rolls a living hazard: an organism loose in the ducts that hunts sound, not sight. You can hurt it, drive it off, and never quite kill it. |
| 3 | **People, not props** | "are all the people going crazy on their own, or are they shooting each other because you've found a drug deal?" | The crew live there. They had shifts, they had a boss, they had plans. Their panic is derived from the incident (mutiny, gas, a purge clock, a deal gone loud), not from a script. Some hide, some trade, some beg, some are the ones with the guns. |
| 4 | **A world with a pulse** | "a world needs life, playability" | The sim ticks whether you're there or not: factions take systems, prices move, infestations spread, news is written from what actually happened. You arrive into the aftermath of things you missed and the middle of things you didn't. |
| 5 | **The risk up top** | "some risk of a high level douch coming in to try and merc you and steal all your shit" | Rival operators are named people with faces, ships, crews and money. Above rank 3, one of them can board *your* run, shoot you in the back, and take your haul off your body. Losing is content: your gear, your loot and your spot on the board go to somebody who will remember you. |
| 6 | **…but you can become him** | "but you can always become him if you try" | The same ladder runs upward. Reputation, better gear, a crew of your own, and from rank 3: hunter contracts — you board *their* run, merc them, and take the name. The top of the food chain is a chair you can sit in. |

## 3. Loop

```
   WAYSTOP (hub)                 THE DIVE                    EXTRACT / DIE
   ─────────────                 ────────                    ─────────────
   contract board   ──select──►  your ship clamped to  ──►   airlock, seal, burn
   market / news                 a wreck or station           │
   fixer, bar, crew              │                            ├─ loot sells, quota paid
   gear bench        ◄───────────┴── the world keeps moving ◄─┴─ rank up, gear up
   cruise (in transit: hails, distress beacons, rivals on your tail, sim ticks)
```

A dive is 8–20 minutes. A career is a season. Death costs the haul, not the save.

## 4. The dive, in detail

**Before.** The board gives you a *contract*, not a job description: site, payer, fee, incident in the
payer's own words, the clock and what the clock means, and a rating the payer *guesses* — because
nobody knows what's actually aboard. Risk is priced in, never shown as a number you can trust.

**Arrival.** Your ship clamps on. The site is a procedurally cut hull or station deck: 1 m cells,
packed rooms, real doors, ducts you can crawl, a sealed vault, lit fixtures with breakers, and
containers that open by hand (lid lifts, door swings, drawer slides) — the loot lies inside where you
can see it, not in a menu.

**The three questions you ask every time.**
- *What's in here with me?* Alien in the ducts, a sealed deck of hostiles, gas, vacuum, a rogue AI's
  cameras, nothing at all (the quiet ones are the worst).
- *Who are these people?* Mutineers, a drug ring mid-deal, a crew hiding from their own security,
  scavengers who got here first, a survivor who wants a ride.
- *Who else is coming?* Above rank 3, a rival can arrive with a crew and a purpose. You'll hear the
  clamp hit. Then it's a race to the airlock with your hands full.

**The haul.** Everything you want off is weight and hands. Small things go in the dive bag. Heavy
things (reactor cores, cryo cases, weapon crates) take both hands: no gun, slow walk, loud boots.
Noise is the real currency — the thing in the ducts hunts it, the rival follows it, and a dropped haul
is a dinner bell. Dying puts everything on the floor for the next person.

**The clock.** Every incident has one and every clock means something physical: the corporation's
sterilisation burn, the AI venting decks, gas reaching the reactor housing, security scuttling the
hull, a rival's docking window closing. When it runs out, the site ends with you in it.

**Extraction.** Back to the hatch, seal, burn off. Quota paid, hauls sold, wages paid, injuries
patched. Then the news you missed while you were inside.

## 5. The world that keeps moving (the sim)

- **Systems** (6–9 in the Rim), each owned by a faction, each with a mood: law, prosperity, threat,
  and one or more *happenings* running on a lifetime.
- **Factions**: the Charter, the Wardens, the Rimward Syndicate, Tallow & Ward, Halcyon, the Freehaul
  Union, the Quorum, and independents. They fight, buy, outlaw and lose ground whether you're watching
  or not.
- **Happenings**: a drug corridor, a strike, a plague, an infestation spreading system to system, a
  gold rush, a lockdown, a rogue AI sealing a station, a war front, a ghost ship, a cult revival. Every
  happening *causes* contracts and *changes* what's inside the sites it touches.
- **Market**: commodities with per-station supply and demand, shortages after events, and a buyer
  who pays more the longer the corridor stays hot.
- **News**: written from what actually happened, so the ticker and the contracts and the market all
  agree with each other. If the news says the Syndicate moved into Waypost Zero, the port decks will
  have Syndicate men on them.
- **Known people**: named NPCs with generated faces, tempers, ships and a memory of you — brokers who
  owe you, crew who blame you, and rivals who want your haul and your name.

## 6. Rivals and the ladder (the "douch" system)

Ranks: **0 Nobody → 1 Runner → 2 Hand → 3 Operator → 4 Shot-caller → 5 Name.**

- Below rank 3 you are prey. Rivals are rumours, then strangers, then a clamp hitting your hull.
- At rank 3 the **hunter's book** opens: rival operators with a location, a haul, a crew strength and
  a fee. Take the contract, board their run, take their gear and their standing.
- Rivals remember: the one you killed last week was somebody's brother, and he has a face you'll see
  again across a corridor.
- Everything the top can do to you, you can do to the top. That is the point of the ladder.

## 7. Realism bar (carried over from Space Ranger, per Lemon's standing directive)

Alien: Isolation's interiors, Gray Zone Warfare's fieldcraft and risk, GTA's living streets — inside a
hull. Procedural materials and geometry (no downloaded art), light from real fixtures, decay that
follows use, haze and dust, worn plating, and sound that tells you what's behind the wall. Diegetic
UI: the tablet is a slab you hold, the loot is on the shelf where it fell, and no text label ever says
"MEDICAL BAY" — the room tells you.

## 8. Platform

Vanilla ES modules + three.js r170, no build step, served by `python3 -m http.server`. Keyboard+mouse,
gamepad (brand-aware button names), and touch all auto-detected and swappable live. Career saves to
`localStorage`. Published on GitHub Pages. ("java game" ⇒ JavaScript, in the family of Rimrunner /
Switchback / Voidmaw, so it runs on anything Lemon owns.)

## 9. What "done" means for v1

1. A hub you can walk around, with a board, a market, a fixer, a bar and crew.
2. A living sim that ticks between runs and drives contracts, prices, news and incidents.
3. Dives with procedural sites, living crew, hostiles derived from the incident, an alien that hunts
   by sound, containers that open by hand, and a real extraction.
4. The haul economy: weight, hands, noise, quota, sale, permanent losses.
5. Rivals: the risk of being merced, and the ladder that lets you become the one who does it.
6. Input auto-detection, save/load, and a headless test suite that proves the sim and the generator.
