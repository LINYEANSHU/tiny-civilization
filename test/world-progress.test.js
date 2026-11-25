import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Sim } from '../src/sim/sim.js';
import { GameClock } from '../src/sim/time.js';
import { Settlement } from '../src/sim/settlement.js';
import { decodeWorldSave, deserializeJournal } from '../src/save.js';

const cm = { terrain: {}, applyBlockEdits() {}, applyPlantEdits() {} };

test('small frames and a single elapsed interval cross the same hourly boundary', () => {
  const make = () => Object.assign(new GameClock(), { paused: false, min: 23 * 60 + 59 });
  const fine = make();
  const coarse = make();
  let hours = 0;
  for (let i = 0; i < 10; i++) hours += fine.advance(0.01);
  assert.equal(hours, 1);
  assert.equal(coarse.advance(0.1), 1);
  assert.equal(fine.day, 2);
  assert.ok(Math.abs(fine.min - coarse.min) < 1e-9);
});

test('civic projects claim materials and persist construction priority with pause and speed', () => {
  const sim = new Sim('demo', cm);
  const town = new Settlement();
  town.id = 2;
  town.pads = [{ x: 9, z: 9, g: 32 }, { x: 14, z: 10, g: 32 }];
  sim.settlements.push(town);
  assert.equal(town.enqueue('house', sim.world), true);
  const wood = town.wood;
  assert.equal(sim.sponsorProject(2, 'granary').ok, true);
  assert.equal(town.wood, wood - 30);
  assert.deepEqual(town.buildQueue.map(job => job.type), ['granary', 'house']);
  assert.equal(sim.sponsorProject(2, 'granary').ok, false);
  assert.equal(town.wood, wood - 30);

  sim.clock.speed = 16;
  sim.clock.paused = true;
  const saved = decodeWorldSave(JSON.parse(JSON.stringify({ v: 3, seed: 'demo', sim: sim.serialize(), journal: [] })));
  const restored = Sim.deserialize(saved.sim, saved.seed, cm);
  assert.equal(restored.clock.paused, true);
  assert.equal(restored.clock.speed, 16);
  const restoredTown = restored.settleById(2);
  assert.equal(restoredTown.buildQueue[0].type, 'granary');
  restoredTown.nearCamera = true;
  const env = { clock: restored.clock, weather: { stateAt: () => 0 }, history: restored.history, world: restored.world };
  for (let i = 0; i < 55; i++) restoredTown.tickHour(env);
  assert.ok(restoredTown.granary, 'the sponsored project should finish while the settlement is on screen');
  delete saved.sim.clock.paused;
  assert.equal(Sim.deserialize(saved.sim, saved.seed, cm).clock.paused, false);
});

test('malformed save records are rejected and legacy block journals migrate', () => {
  const sim = new Sim('demo', cm);
  const valid = { v: 2, seed: 'demo', sim: sim.serialize(), journal: [[524800, { blocks: [[14, 5]], plants: [] }]] };
  assert.deepEqual(deserializeJournal(decodeWorldSave(valid).journal).get(524800).blocks, [14 | (5 << 15)]);
  assert.throws(() => decodeWorldSave({ ...valid, sim: { ...valid.sim, clock: { day: -1, min: 5000 } } }));
  assert.throws(() => decodeWorldSave({ ...valid, journal: [null] }));
  assert.throws(() => decodeWorldSave({ ...valid, sim: { ...valid.sim, settlements: [null] } }));
});
