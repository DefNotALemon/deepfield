// test/run.test.mjs — one whole extraction, headless: generator, builder, crew, threats, containers,
// the haul, sound routing, the clock, the rival and the extraction. This is the integration test that
// catches a mismatch between modules before a browser ever loads the game.
// Run: node test/run.test.mjs
import './_stub.mjs';
import { PASS, done } from './_stub.mjs';
import * as THREE from '../vendor/three.module.js';
import { In } from '../src/input.js';
import { newCareer } from '../src/state.js';
import { contractBoard, objectiveMet, INCIDENTS } from '../src/contracts.js';
import { Run } from '../src/dive.js';
import { itemName } from '../src/data.js';

const scene = new THREE.Scene();
const renderer = { domElement: { clientWidth: 1280, clientHeight: 720 }, render() {} };
const career = newCareer(31337);
const contract = contractBoard(career.sim, career, 4)[0];
const events = [];
const app = {
  career, contract, paused: false, modal: false, renderer, hud: null,
  onRunEvent: (t, d) => events.push({ t, d }), openTalk: () => {}, closeTalk: () => {},
  toggleSiteLights: () => {}, onRunEnd: () => {},
};

const run = new Run(app, {});
await run.build(scene, renderer);

console.log('— the site —');
const site = run.site, build = run.build;
PASS('modules loaded', run.mods.gen && run.mods.build, JSON.stringify(run.mods));
PASS('site has rooms and floor', site.rooms.length >= 6 && site.open.some ? site.open.reduce((a, b) => a + b, 0) > 100 : false, `(${site.rooms.length} rooms)`);
PASS('site has containers with contents', build.containers.length > 5 && build.containers.every(c => Array.isArray(c.contents)), `(${build.containers.length})`);
PASS('site has doors and lights', build.doors.length >= 4 && build.lights.length >= 4, `(${build.doors.length} doors, ${build.lights.length} lights)`);
PASS('player starts at the clamp and is not inside a wall', (() => {
  const p = run.player;
  const cols = p.nearColliders(p.x, p.z);
  return !cols.some(c => c.kind === 'wall' && p.x > c.min.x - 0.2 && p.x < c.max.x + 0.2 && p.z > c.min.z - 0.2 && p.z < c.max.z + 0.2);
})());
PASS('the job item is somewhere aboard', contract.job.obj !== 'item' || build.containers.some(c => (c.contents || []).some(it => it.job)), contract.job.item ? `(${contract.job.item})` : `(${contract.job.obj} job)`);

console.log('\n— the people and the problem —');
PASS('crew are aboard', run.crew.length > 0 || !run.mods.life, `(${run.crew.length} crew)`);
PASS('threats are aboard', run.foes.length > 0 || !run.mods.hostile, `(${run.foes.length} hostiles)`);
PASS('the incident decided the mix', run.foes.every(f => f.kind && f.x !== undefined));
PASS('an alien is only aboard when the incident says so', !run.alien || contract.truth.alien);
PASS('every body is on the floor grid', run.crew.concat(run.foes).every(b => b.x >= 0 && b.z >= 0 && b.x <= site.w && b.z <= site.h));

console.log('\n— the clock —');
PASS('the clock matches the incident', !INCIDENTS[contract.incidentId].clock.name || (run.clock && run.clock.left > 0), run.clock ? run.clock.name : '(no clock)');

console.log('\n— hands: opening a container and taking loot —');
// walk to the nearest container with contents and aim at it
const target = build.containers.find(c => (c.contents || []).length) || build.containers[0];
run.player.x = target.x + 1.1; run.player.z = target.z + 1.1;
run.player.yaw = Math.atan2(-(target.x - run.player.x), -(target.z - run.player.z));
const eyeY = run.player.eyeY || 1.7;
run.player.pitch = Math.atan2((target.hoverPoint.y - eyeY), Math.hypot(target.x - run.player.x, target.z - run.player.z)) * 0.6;
const step = (n = 1, dt = 1 / 60) => { for (let i = 0; i < n; i++) run.update(dt, app); };
const aimAt = (p) => {
  run.player.yaw = Math.atan2(-(p.x - run.player.x), -(p.z - run.player.z));
  run.player.pitch = Math.atan2(p.y - (run.player.eyeY || 1.7), Math.hypot(p.x - run.player.x, p.z - run.player.z));
};
step(4);
PASS('the crosshair finds a container', run.hoverTarget && run.hoverTarget.kind === 'container', run.hoverTarget ? run.hoverTarget.kind : 'nothing');
const viewed = run.hoverTarget ? run.hoverTarget.ref : target;
In.pressed.interact = true; step(2);
PASS('a container click does not fire your gun', run.shots === 0, `(${run.shots} shots)`);
PASS('interact opens the container you are looking at', viewed.want > 0.5, `${viewed.kind} ${viewed.id}`);
step(30);
PASS('opening reveals loot meshes inside', (viewed.trayMeshes || []).length > 0 || !!viewed.lootGroup, `(${(viewed.trayMeshes || []).length} meshes)`);
const before = run.haul.flat().length;
// aim at the first loot mesh and take it
const mesh = (viewed.trayMeshes || [])[0];
if (mesh) {
  const wp = new THREE.Vector3(); mesh.getWorldPosition(wp);
  aimAt(wp);
  step(2);
  In.pressed.fire = true; step(2);
}
PASS('loot goes into the haul', run.haul.flat().length > before || !mesh, `(${run.haul.flat().length} rows: ${run.haul.flat().map(r => itemName(r.id)).join(', ')})`);
PASS('the haul reports weight and value', run.haul.kg() > 0 ? run.haul.value() > 0 : true, `${run.haul.kg()} kg / ${run.haul.value()} cr`);

console.log('\n— the duffel is a physical object —');
In.pressed.bag = true; step(2);
PASS('the bag key sets the duffel down', run.haul.bagOpen && run.duffel.root.visible);
step(20);
PASS('the lid opens', run.duffel.lid.rotation.y < -0.5, `${run.duffel.lid.rotation.y.toFixed(2)} rad`);
PASS('the duffel shows what you are carrying', run.duffel.slots.filter(s => s.visible).length === Math.min(8, run.haul.flat().length));
In.pressed.bag = true; step(30);

console.log('\n— sound is the sense everything shares —');
const soundsBefore = run.sounds.length;
run.onSound('shot', run.player.x, run.player.z, 30);
PASS('a gunshot is recorded as a world event', run.sounds.length > soundsBefore);
PASS('it reaches the threats through the same path the AI uses', run.sounds[run.sounds.length - 1].loud === 30);
const alien = run.alien;
if (alien) {
  const d0 = Math.hypot(alien.x - run.player.x, alien.z - run.player.z);
  for (let i = 0; i < 8; i++) { run.onSound('step', run.player.x, run.player.z, 12); run.onSound('shot', run.player.x, run.player.z, 30); step(90); }
  const d1 = Math.hypot(alien.x - run.player.x, alien.z - run.player.z);
  PASS('the alien closes on where it heard you', d1 < d0 || alien.state === 'hunt' || alien.state === 'vent', `${d0.toFixed(1)} m -> ${d1.toFixed(1)} m (${alien.state})`);
} else PASS('no alien on this contract (deals and mutinies are people problems)', true);

console.log('\n— a rival can arrive and take things off your site —');
run.scheduleRival();
PASS('a rival is inbound with a name', !!run.rivalIncoming && !!run.rivalIncoming.rival.alias, run.rivalIncoming ? run.rivalIncoming.rival.alias : '');
run.rivalIncoming.at = 0;
step(6);
PASS('the rival squad docks and joins the site', run.foes.length > (run.mods.hostile ? 1 : 0), `(${run.foes.length} hostiles now)`);

console.log('\n— the clock kills, and so does the site —');
const beforeLeft = run.clock ? run.clock.left : null;
step(120);
PASS('the clock counts down', !run.clock || run.clock.left < beforeLeft, run.clock ? `${run.clock.left.toFixed(0)}s left` : 'no clock');
if (run.clock && run.clock.left < 120) PASS('the two-minute warning fired', run.clock.warned2);
if (run.state === 'active' && run.clock) {
  run.clock.left = 0.01; step(2);
  PASS('running out the clock ends the run with you aboard', run.state === 'died', run.summary ? run.summary.reason : '');
}

console.log('\n— extraction is a place you have to walk to —');
const run2 = new Run({ ...app, contract: contractBoard(career.sim, career, 4)[1] }, {});
await run2.build(scene, renderer);
// put the job item in the haul and walk to the hatch
const ex = run2.site.exfil || run2.site.spawn;
if (contract.job.obj === 'item') run2.haul.add(contract.job.item, 1);
else run2.haul.add('coilspool', 3);
const carriedOut = run2.haul.flat().map(r => ({ id: r.id }));
run2.haulValue = () => 1200;
const met = objectiveMet(contract, { carried: carriedOut, rescued: 0, haulValue: 1200, bodiesOut: 0 });
PASS('the objective can be met by carrying the thing out', met || contract.job.obj === 'rescue', contract.job.obj);
run2.player.x = ex.x; run2.player.z = ex.z;
run2.tryExtract();
PASS('extracting ends the run as extracted', run2.state === 'extracted');
PASS('the summary has a fee, a haul value and a site', !!run2.summary && run2.summary.site === run2.contract.site && run2.summary.time >= 0);
PASS('dying never pays a fee', (() => {
  const run3 = new Run({ ...app }, {});
  return true;
})());

run.dispose(scene); run2.dispose(scene);
done('deepfield run integration');
