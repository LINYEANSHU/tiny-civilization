import { DAYS_PER_YEAR } from '../core/config.js';
import { decodeWorldSave, MANUAL_SLOTS } from '../save.js';
import { SpaceSimulation } from './simulation.js';

export const SAVE_SLOTS = ['autosave', ...MANUAL_SLOTS];

export function playMode(value) {
  return value === 'space' || value === 'campaign' ? value : 'ground';
}

export function worldSlot(mode, slot) {
  return playMode(mode) === 'ground' ? slot : `${mode}:${slot}`;
}

export function worldURL(mode, seed, slot, pathname = location.pathname) {
  const search = new URLSearchParams();
  if (mode !== 'ground') search.set('mode', mode);
  if (seed) search.set('seed', seed);
  if (slot) search.set('load', slot);
  return `${pathname}${search.size ? `?${search}` : ''}`;
}

export function campaignReadiness(sim) {
  const settlements = sim.settlements;
  const age = Math.floor((sim.clock.day - 1) / DAYS_PER_YEAR);
  const population = settlements.reduce((best, settlement) => Math.max(best, settlement.peakPop || 0, settlement.pop || 0), 0);
  const industry = settlements.filter(settlement => settlement.quarry || settlement.market || settlement.granary).length;
  const goals = [{ id: 'age', progress: age, target: 2 }, { id: 'pop', progress: population, target: 12 }, { id: 'industry', progress: industry, target: 1 }];
  return { ready: goals.every(goal => goal.progress >= goal.target), goals };
}

export function spaceSave(sim, mode, ground = null, savedAt = Date.now()) {
  return { v: 4, type: 'interstellar', mode, seed: sim.galaxy.seed, space: structuredClone(sim.state), ground, savedAt };
}

export function restoreSpaceSave(save) {
  if (!isSpaceSave(save) || typeof save.seed !== 'string' || !save.seed.length || save.seed.length > 512
    || !['space', 'campaign'].includes(save.mode) || save.mode !== save.space?.mode || !Number.isFinite(save.savedAt)) {
    throw new Error('Invalid interstellar checkpoint');
  }
  let ground = null;
  if (save.mode === 'campaign') {
    ground = decodeWorldSave(save.ground);
    if (ground.seed !== save.seed || !campaignReadiness(ground.sim).ready) throw new Error('Invalid orbital campaign archive');
  } else if (save.ground != null) {
    throw new Error('Unexpected planetary archive');
  }
  return { sim: SpaceSimulation.restore(save.seed, save.space), ground };
}

export function isSpaceSave(save) {
  return save?.v === 4 && save.type === 'interstellar';
}

export function launchCampaign(save) {
  const ground = decodeWorldSave(save);
  if (!campaignReadiness(ground.sim).ready) throw new Error('The civilization has not qualified for orbit');
  const settlements = ground.sim.settlements;
  const capital = settlements.reduce((best, settlement) => settlement.pop > best.pop ? settlement : best, settlements[0]);
  const legacy = { name: capital.name, population: settlements.reduce((total, town) => total + town.pop, 0), stock: capital.wood + capital.stone };
  return spaceSave(SpaceSimulation.create(ground.seed, 'campaign', legacy), 'campaign', structuredClone(ground));
}
