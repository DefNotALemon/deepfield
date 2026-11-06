// data.js — the content table: factions, commodities, loot, tools, guns, room styles, names.
// Pure data + text, no three.js and no DOM, so the sim, the generator and the tests can all import it.

// ── Factions ────────────────────────────────────────────────────────────────────────────────
// Every system is owned by one. They trade, ban, fight and lose ground while you're away.
export const FACTIONS = {
  charter: { name: 'the Charter', short: 'Charter', tint: '#8fb6d8', law: 1.0, kind: 'gov', blurb: 'the old compact. They keep the lanes, the ledgers and the paperwork.' },
  wardens: { name: 'the Wardens', short: 'Wardens', tint: '#7fd0ff', law: 1.2, kind: 'law', blurb: 'Charter enforcement. Cutters, inspections and a long memory.' },
  syndicate: { name: 'the Rimward Syndicate', short: 'Syndicate', tint: '#ff6b6b', law: 0.1, kind: 'crime', blurb: 'Runs what the Charter outlaws: people, spice, weapons, debts.' },
  tallow: { name: 'Tallow & Ward', short: 'Tallow & Ward', tint: '#d8c48f', law: 0.5, kind: 'corp', blurb: 'Industrial corp. Refineries, bulk haulage, and a fondness for write-offs.' },
  halcyon: { name: 'Halcyon', short: 'Halcyon', tint: '#a8e6a0', law: 0.6, kind: 'corp', blurb: 'Bio-research and pharma. Buys silence by the tonne.' },
  freehaul: { name: 'the Freehaul Union', short: 'Union', tint: '#e0a45a', law: 0.7, kind: 'union', blurb: 'Independent crews. They own their hulls and their opinions.' },
  quorum: { name: 'the Quorum', short: 'Quorum', tint: '#c9a0ff', law: 0.3, kind: 'cult', blurb: 'Believers in the quiet worlds. They listen to things nobody else hears.' },
  dead: { name: 'nobody', short: 'unclaimed', tint: '#8a8a8a', law: 0.0, kind: 'none', blurb: 'No flag flies here. That is the whole attraction.' },
};
export const FACTIONS_PLAYABLE = ['charter', 'wardens', 'syndicate', 'tallow', 'halcyon', 'freehaul', 'quorum'];

// ── Commodities (the market: prices move per station, per happening) ───────────────────────
export const COMMODITIES = {
  scrap: { name: 'scrap alloy', base: 18, unit: 'kg' },
  parts: { name: 'machine parts', base: 62, unit: 'u' },
  electronics: { name: 'electronics', base: 120, unit: 'u' },
  optics: { name: 'optics', base: 210, unit: 'u' },
  spice: { name: 'spice', base: 340, unit: 'kg' },
  meds: { name: 'medical stock', base: 160, unit: 'u' },
  data: { name: 'data cores', base: 260, unit: 'u' },
  crystal: { name: 'hymn crystal', base: 480, unit: 'kg' },
  water: { name: 'potable ice', base: 12, unit: 't' },
  fuel: { name: 'drive mass', base: 44, unit: 't' },
};

// ── Loot ──────────────────────────────────────────────────────────────────────────────────
// kind: small (pocket, unlimited) | loot (one bag slot) | heavy (both hands: no gun, slow, loud)
// hands: 0 = bag only, 1 = one hand, 2 = both hands. noise: how loud it is when carried/moved.
export const ITEMS = {
  chit: { name: 'credit chit', kind: 'small', kg: 0.1, value: 45, tint: '#d8c48f', desc: 'A dead crewman\'s chit. Still good — nobody cancels a wage account this far out.' },
  trinket: { name: 'personal effects', kind: 'small', kg: 0.3, value: 60, tint: '#c9a0ff', desc: 'A tin of photographs, a ring, a child\'s drawing. Sells for almost nothing. You take it anyway.' },
  tag: { name: 'crew tag', kind: 'small', kg: 0.05, value: 90, tint: '#8fb6d8', desc: 'Identity tag. The union pays a finder\'s fee so families get told.' },
  carchip: { name: 'cartridge chip', kind: 'small', kg: 0.1, value: 110, tint: '#a8e6a0', desc: 'Ammo feedstock in raw form. Printers eat these.' },
  dataspool: { name: 'data spool', kind: 'small', kg: 0.5, value: 300, tint: '#7fd0ff', desc: 'Not your data. Somebody will pay well to know what is on it, and somebody else will pay more to see it burned.' },
  medkit: { name: 'trauma kit', kind: 'loot', kg: 1.4, value: 140, tint: '#ff9a9a', desc: 'Sealed, in date. Hold one and you can get yourself up off the deck.', use: 'heal' },
  respirator: { name: 'respirator', kind: 'loot', kg: 1.0, value: 180, tint: '#e6d84a', desc: 'Filter mask. Without one, gas moves you from the inside.', use: 'mask' },
  coilspool: { name: 'coil spool', kind: 'loot', kg: 2.6, value: 130, tint: '#c9a0ff', desc: 'Superconductor windings, still cold. Heavy for what you get.' },
  servo: { name: 'servo pack', kind: 'loot', kg: 3.4, value: 190, tint: '#8fb6d8', desc: 'Robot actuator assembly. The legs of something that used to walk.' },
  optic: { name: 'survey optic', kind: 'loot', kg: 1.2, value: 240, tint: '#a8e6a0', desc: 'Ship-grade lens barrel. Fragile, valuable, and exactly the shape that breaks when you fall.' },
  bergson: { name: 'Bergson coil', kind: 'loot', kg: 5.0, value: 420, tint: '#7fd0ff', desc: 'Contraband drive component. The Charter has opinions about who owns these.' },
  guncase: { name: 'weapon case', kind: 'heavy', kg: 13, value: 380, tint: '#d8c48f', hands: 2, noise: 0.5, desc: 'Long case, military stencils. Both hands, no gun of your own, and it clangs on every corner.' },
  cryocase: { name: 'cryo case', kind: 'heavy', kg: 19, value: 560, tint: '#a8e6a0', hands: 2, noise: 0.4, desc: 'Radiating cold through the handles. Something in it is still on ice, and still due somewhere.' },
  reactorcore: { name: 'reactor core', kind: 'heavy', kg: 28, value: 980, tint: '#ffd27f', hands: 2, noise: 0.7, desc: 'The heart of the site. Both hands, slow feet, loud on the deck plate, and worth more than you are.' },
  spicebrick: { name: 'spice brick', kind: 'loot', kg: 2.0, value: 360, tint: '#ffb26b', desc: 'Vacuum-wrapped, stamped with a Syndicate mark. This is why there are men with guns in the port decks.' },
  evidence: { name: 'the case', kind: 'loot', kg: 6.5, value: 700, tint: '#ff6b6b', desc: 'A hard case with a chain-of-custody tag, mid-deal. Whoever was holding it when you walked in wants it back.' },
  hymncrystal: { name: 'hymn crystal', kind: 'loot', kg: 2.2, value: 520, tint: '#c9a0ff', desc: 'Sings faintly when the hull flexes. The Quorum say it is a voice. Buyers say it is a price.' },
  whisperstone: { name: 'whisperstone', kind: 'loot', kg: 1.8, value: 640, tint: '#8fb6d8', desc: 'Cold, dense, and it holds a note. People who carry them sleep badly afterward.' },
  biomatter: { name: 'sample jar', kind: 'loot', kg: 3.0, value: 450, tint: '#c7ff5a', desc: 'Sealed specimen. Whatever is in it grew, so keep it level and keep it closed.' },
  blackbox: { name: 'flight recorder', kind: 'loot', kg: 2.4, value: 480, tint: '#ff9a3a', desc: 'The last eleven minutes of this hull, at 240 frames a second. Somebody wants it destroyed.' },
  corpse: { name: 'body bag', kind: 'heavy', kg: 24, value: 200, tint: '#cccccc', hands: 2, noise: 0.2, desc: 'The union pays a recovery fee. Both hands, and the whole way back you know exactly what you are carrying.' },
};

// Tools: take a hand, do one job, and some of them are loud.
export const TOOLS = {
  flashlight: { name: 'helmet lamp', kg: 0.4, value: 120, tint: '#fff3c4', desc: 'Battery-hungry beam. Light is safety and light is a beacon; pick which.' },
  welder: { name: 'cutting torch', kg: 3.2, value: 260, tint: '#ff9a3a', desc: 'Opens doors that are welded shut and vaults that are not meant to open. Very loud, very bright.' },
  scanner: { name: 'proximity pinger', kg: 1.2, value: 340, tint: '#7fd0ff', desc: 'Hears moving life through walls and gives you a direction. Cannot tell you what it is.' },
  spike: { name: 'door spike', kg: 1.0, value: 90, tint: '#8a8a8a', desc: 'Pins a door shut from your side. Whatever is on the other side will knock politely, then not.' },
  sling: { name: 'loader sling', kg: 1.6, value: 420, tint: '#e0a45a', desc: 'Harness that takes one heavy item on your back. You still cannot shoot with it up, but you can walk.' },
};

// ── Guns ──────────────────────────────────────────────────────────────────────────────────
// dmg per pellet, rpm, mag, spread (rad), noise 0..1.5 (how far it carries), kg.
export const GUNS = {
  pistol: { name: 'Kestrel 9 sidearm', dmg: 22, rpm: 380, mag: 12, spread: 0.016, recoil: 0.9, noise: 1.1, kg: 1.1, mode: 'semi', value: 320, tint: '#8a8a8a', desc: 'Standard dock-side sidearm. Cheap to feed, honest at nine metres.' },
  smg: { name: 'Tael & Sons compact', dmg: 15, rpm: 780, mag: 30, spread: 0.03, recoil: 0.7, noise: 1.05, kg: 2.5, mode: 'auto', value: 640, tint: '#5a5a5a', desc: 'Brass out of the side, everywhere out of the front. Misses more than it should.' },
  shotgun: { name: 'Ward break-action', dmg: 17, pellets: 8, rpm: 90, mag: 2, spread: 0.09, recoil: 2.4, noise: 1.4, kg: 3.6, mode: 'semi', value: 520, tint: '#6b4a2a', desc: 'Two shells, both of them an argument. In a corridor it ends conversations.' },
  rifle: { name: 'Halcyon pattern rifle', dmg: 42, rpm: 110, mag: 10, spread: 0.008, recoil: 1.6, noise: 1.5, kg: 4.4, mode: 'semi', value: 1100, tint: '#4a4a4a', desc: 'Corporate issue, corporate range. Every shot says exactly where you are.' },
  rivetgun: { name: 'salvage rivet gun', dmg: 11, rpm: 320, mag: 24, spread: 0.026, recoil: 0.6, noise: 0.9, kg: 2.0, mode: 'semi', value: 240, tint: '#c9a040', desc: 'A tool that turned out to be a weapon. Industrial rivets, industrial opinion.' },
};

// ── Room kinds + look styles (the generator picks kinds; the builder dresses by style) ─────
export const ROOMS = ['airlock', 'spine', 'promenade', 'plaza', 'canteen', 'barracks', 'office', 'control', 'medical', 'server', 'engineering', 'storage', 'workshop', 'galley', 'brig', 'vault', 'research', 'reactor', 'portside', 'freight', 'ductjunction'];
export const ROOM_LABEL = {
  airlock: 'clamp deck', spine: 'spine corridor', promenade: 'promenade', plaza: 'plaza', canteen: 'canteen',
  barracks: 'crew quarters', office: 'administrative office', control: 'control room', medical: 'medical bay',
  server: 'data core hall', engineering: 'engineering', storage: 'store room', workshop: 'workshop',
  galley: 'galley', brig: 'holding cells', vault: 'sealed vault', research: 'research deck',
  reactor: 'reactor housing', portside: 'port decks', freight: 'freight hold', ductjunction: 'vent junction',
};
export const STYLE_OF_ROOM = {
  airlock: 'industrial', spine: 'corp', promenade: 'lite', plaza: 'corp', canteen: 'home', barracks: 'home',
  office: 'corp', control: 'server', medical: 'medical', server: 'server', engineering: 'engineering',
  storage: 'industrial', workshop: 'industrial', galley: 'home', brig: 'industrial', vault: 'engineering',
  research: 'medical', reactor: 'engineering', portside: 'derelict', freight: 'industrial', ductjunction: 'duct',
};
export const STYLES = ['corp', 'industrial', 'server', 'engineering', 'medical', 'duct', 'home', 'derelict', 'lite'];

// ── Names ─────────────────────────────────────────────────────────────────────────────────
export const FIRST = ['Iva', 'Rok', 'Neve', 'Juno', 'Sable', 'Otto', 'Wren', 'Kesh', 'Dane', 'Mira', 'Cal', 'Tob', 'Verse', 'Hale', 'Ines', 'Faro', 'Skate', 'Bel', 'Orin', 'Peta', 'Rune', 'Sela', 'Tam', 'Vex', 'Yara', 'Zed', 'Cass', 'Doro', 'Emil', 'Fen', 'Gita', 'Hugo', 'Ida', 'Jonas', 'Kira', 'Lars'];
export const LAST = ['Vale', 'Ashby', 'Corvane', 'Dunmore', 'Eseka', 'Farrow', 'Grieve', 'Halsey', 'Ilsa', 'Jarrow', 'Kade', 'Lund', 'Marchetti', 'Nova', 'Okonjo', 'Pryce', 'Quill', 'Rask', 'Sambor', 'Tully', 'Ustari', 'Voss', 'Wex', 'Yland', 'Zorn'];
export const NICKNAME = ['Grinder', 'the Ledger', 'Sixteen', 'Halflight', 'Rusthand', 'the Clerk', 'Coldwash', 'Two-Knives', 'the Antenna', 'Slowburn', 'Patch', 'Roanoke', 'Softspoken', 'Nine', 'the Undertaker', 'Bramble'];
export const SHIPS = ['Facet', 'Longwake', 'Tessellate', 'GrimHarbour', 'Ashfall', 'Ninepin', 'Saltire', 'Vantage', 'Lowlight', 'Cormorant', 'Profit Margin', 'Second Draft', 'Harrowline', 'Blue Hour'];

// ── Systems (the galaxy the sim runs) ─────────────────────────────────────────────────────
export const SYSTEMS = [
  { id: 'halyard', name: 'Halyard', star: '#fff0c0', planets: ['Halyard IV (settled)', 'Cinder Bar', 'the Docks'], lore: 'the Charter\'s busiest yard. Half the Rim\'s paperwork is filed here and none of it is true.' },
  { id: 'waypost', name: 'Waypost Zero', star: '#ffd9a0', planets: ['Waypost Zero (settled)', 'Rime', 'Waypost Moon'], lore: 'a union port bolted to a dead moon. Everyone drinks here and everyone is owed something.' },
  { id: 'ysolde', name: 'Ysolde', star: '#ffb26b', planets: ['Middle Ysolde (settled)', 'Ysolde Deep', 'Port Ysolde'], lore: 'pharma and freight. Halcyon owns the labs and the Syndicate owns the dock crews.' },
  { id: 'corvane', name: 'Corvane', star: '#cfe4ff', planets: ['Corvane V (rain)', 'Varga', 'the Cryo Belt'], lore: 'ice, rain, and a cryo station that stopped answering seven years ago.' },
  { id: 'tallow', name: 'Tallow Reach', star: '#ffcf8a', planets: ['Tallow Prime', 'Slagfield', 'Refinery Six'], lore: 'Tallow & Ward\'s furnaces never shut down. Neither does the debt.' },
  { id: 'quor', name: 'Quiet Quor', star: '#c9a0ff', planets: ['Quor (Quorum world)', 'Hush', 'the Listening Moon'], lore: 'the Quorum\'s world. Radio silence is a courtesy, not a law, and they will tell you so.' },
  { id: 'fringe', name: 'the Fringe', star: '#a8c8ff', planets: ['Fringe Anchorage', 'Cold Cairn', 'Nobody\'s Rock'], lore: 'beyond the picket. No patrols, no law, no rescue. The work is here.' },
  { id: 'gulf', name: 'the Gulf', star: '#ff9a3a', planets: ['Gulf Station Nine', 'Ash Tide', 'the Long Quiet'], lore: 'a dead corridor between two arms of the Rim. Wrecks drift through it for decades.' },
];

// ── Assigners ─────────────────────────────────────────────────────────────────────────────
export const SITE_KINDS = {
  derelict: { name: 'derelict hull', label: 'wreck', blurb: 'a dead ship, still holding its last cargo', size: [34, 26], decks: 1 },
  station: { name: 'orbital station', label: 'station', blurb: 'lived-in, lit, and full of people with problems', size: [42, 32], decks: 1 },
  refinery: { name: 'refinery platform', label: 'platform', blurb: 'industrial, hot, and never fully shut down', size: [40, 30], decks: 1 },
  lab: { name: 'research deck', label: 'lab', blurb: 'clean rooms, cold storage, and something that got out', size: [36, 28], decks: 1 },
  mine: { name: 'rock mine', label: 'mine', blurb: 'cut into an asteroid, held up by habit', size: [38, 30], decks: 1 },
  outpost: { name: 'frontier outpost', label: 'outpost', blurb: 'six people, one radio, and a long way from anyone', size: [28, 22], decks: 1 },
};

export function itemName(id) { return (ITEMS[id] || TOOLS[id] || GUNS[id] || { name: id }).name; }
export function itemDesc(id) { return (ITEMS[id] || TOOLS[id] || GUNS[id] || {}).desc || ''; }
export function itemValue(id) { return (ITEMS[id] || TOOLS[id] || GUNS[id] || {}).value || 0; }
export function itemKg(id) { return (ITEMS[id] || TOOLS[id] || GUNS[id] || {}).kg || 1; }
export function weightedItems(w) {
  let total = 0; for (const k in w) total += w[k];
  return { t: total, w };
}
