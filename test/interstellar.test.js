import assert from 'node:assert/strict';
import test from 'node:test';
import { createGalaxy, orbitPosition, stellarState, travelPlan } from '../src/space/galaxy.js';
import { TECHS, getResearchStatus } from '../src/space/technology.js';
import { SpaceSimulation } from '../src/space/simulation.js';
import { campaignReadiness, launchCampaign, restoreSpaceSave, spaceSave, worldSlot } from '../src/space/modes.js';

test('a seed reproducibly generates a large stellar atlas and physical orbital periods', () => {
  const galaxy = createGalaxy('archive');
  assert.deepEqual(galaxy.systems, createGalaxy('archive').systems);
  assert.notDeepEqual(galaxy.systems, createGalaxy('another').systems);
  assert.equal(galaxy.systems.length, 192);
  assert.equal(new Set(galaxy.planets.keys()).size, [...galaxy.planets.values()].length);
  assert.equal(orbitPosition({ axis: 1, eccentricity: 0, phase: 0 }, 1, 0).period, 1);
  assert.ok(Math.abs(orbitPosition({ axis: 1, eccentricity: 0.2, phase: 0 }, 1, 0).radius - 0.8) < 1e-8);
  assert.equal(stellarState(galaxy.systems[4], 0).phase, 'black-hole');
  assert.equal(stellarState(galaxy.systems[5], 100).phase, 'supergiant');
  assert.equal(stellarState(galaxy.systems[5], 300).phase, 'black-hole');
});

test('planet orbits, local detail, and communication remain distinct from sublight transit', () => {
  const sim = SpaceSimulation.create('signals');
  const origin = sim.galaxy.home;
  const target = sim.galaxy.systems[1].planets[0];
  const plan = travelPlan(sim.galaxy, origin, target.id, 0.25, sim.state.year);
  assert.ok(plan.departure >= sim.state.year && plan.signalYears >= plan.distance);
  assert.ok(plan.flightYears >= 4 * plan.distance - 0.001);
  const rival = sim.galaxy.systems[2].planets[0];
  assert.notEqual(sim.state.worlds[rival.id].polity, sim.state.worlds[origin].polity);
  assert.equal(sim.describe(origin).resolution, 'detailed');
  assert.equal(sim.describe(sim.galaxy.systems[20].planets[0].id).resolution, 'aggregate');
});

test('colonization, commerce, conquest and planetary identities survive a save mid-flight', () => {
  const sim = SpaceSimulation.create('convoy');
  const target = sim.galaxy.systems[1].planets[0].id;
  const started = sim.issue('colonize', sim.galaxy.home, target);
  assert.ok(started.ok);
  assert.equal(sim.issue('colonize', sim.galaxy.home, target).code, 'duplicate');
  sim.advance(2);
  const restored = restoreSpaceSave(JSON.parse(JSON.stringify(spaceSave(sim, 'space')))).sim;
  assert.deepEqual(restored.state, sim.state);
  restored.advance(Math.ceil(started.mission.arrives - restored.state.year) + 1);
  assert.equal(restored.state.worlds[target].owner, 'player');
  assert.notEqual(restored.state.worlds[target].polity, restored.state.worlds[restored.galaxy.home].polity);
  const rival = restored.galaxy.systems[2].planets[0].id;
  const resident = restored.state.worlds[rival].polity;
  restored.advance(15);
  const trade = restored.issue('trade', restored.galaxy.home, rival);
  assert.ok(trade.ok);
  restored.advance(Math.ceil(trade.mission.arrives - restored.state.year));
  assert.ok(restored.state.worlds[rival].standing > -20);
  for (let index = 0; index < 3; index++) assert.ok(restored.build(restored.galaxy.home, 'fleet').ok);
  const attack = restored.issue('attack', restored.galaxy.home, rival);
  assert.ok(attack.ok);
  restored.advance(Math.ceil(attack.mission.arrives - restored.state.year) + 1);
  assert.equal(restored.state.worlds[rival].owner, 'player');
  assert.equal(restored.state.worlds[rival].polity, resident);
  assert.equal(restored.state.worlds[rival].standing, -100);
});

test('technology has a large acyclic catalog and planet-specific alternatives', () => {
  const sim = SpaceSimulation.create('research');
  assert.ok(TECHS.length >= 90);
  const known = new Set();
  for (const tech of TECHS) {
    tech.requires.forEach(id => assert.ok(known.has(id)));
    known.add(tech.id);
  }
  assert.equal(getResearchStatus('cryo-1', sim.state.research, new Set(['terran'])), 'environment');
  assert.equal(getResearchStatus('cryo-1', sim.state.research, new Set(['ice'])), 'available');
  assert.ok(sim.startResearch('power-2').ok);
  assert.equal(sim.startResearch('power-2').code, 'researching');
  sim.advance(10);
  assert.ok(sim.state.research.complete.includes('power-2'));
});

test('campaign unlock refuses a new ground save and restores an eligible legacy save intact', () => {
  const ground = {
    v: 2, seed: 'old-continent', sim: {
      clock: { day: 1, min: 420, speed: 1, paused: true },
      nations: { list: [] }, history: [], settlements: [{
        id: 0, name: 'Estuary', x: 0, z: 0, g: 20, pop: 16, peakPop: 16, food: 50, wood: 40,
        stone: 15, wealth: 10, morale: 80, houses: [{}, {}], farms: [], pads: [], watchtowers: [], buildQueue: [], market: {}, quarry: {},
      }],
    },
  };
  assert.equal(worldSlot('ground', 'autosave'), 'autosave');
  assert.notEqual(worldSlot('space', 'autosave'), worldSlot('campaign', 'autosave'));
  assert.equal(campaignReadiness(ground.sim).ready, false);
  assert.throws(() => launchCampaign(ground), /orbit/i);
  ground.sim.clock.day = 1 + 48 * 3;
  const save = launchCampaign(ground);
  assert.equal(campaignReadiness(ground.sim).ready, true);
  const restored = restoreSpaceSave(save);
  assert.deepEqual(restored.ground, ground);
  assert.equal(restored.sim.state.mode, 'campaign');
  assert.equal(restored.sim.state.homeName, 'Estuary');
  assert.ok(!restored.sim.state.research.complete.includes('drive-1'));
  assert.throws(() => restoreSpaceSave({ ...save, ground: null }));
  assert.throws(() => restoreSpaceSave({ ...save, space: { ...save.space, year: -1 } }));
});
