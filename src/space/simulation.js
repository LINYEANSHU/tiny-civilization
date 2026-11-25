import { BIOMES, createGalaxy, planetEnvironment, stellarState, systemDistance, travelPlan } from './galaxy.js';
import { BIOME_TRACK, getResearchStatus, researchLevels, STARTING_TECH, TECH_BY_ID } from './technology.js';

export const PLAYER = 'player';
const clamp = (number, low, high) => Math.min(high, Math.max(low, number));
const round = number => Math.round(number * 100) / 100;
const FAR_TICK = 8;
const RESOURCES = ['population', 'power', 'materials', 'fleet', 'standing', 'lastYear'];

export const PROJECTS = {
  solar: { label: ['发电阵列', 'Power array'], power: 0, materials: 30 },
  mine: { label: ['资源工场', 'Resource works'], power: 12, materials: 28 },
  lab: { label: ['科研设施', 'Research facilities'], power: 25, materials: 40 },
  habitat: { label: ['居住设施', 'Sealed habitats'], power: 28, materials: 48 },
  fleet: { label: ['新造舰队', 'Build flotilla'], power: 24, materials: 42 },
};

export const MISSIONS = {
  survey: { label: ['勘察', 'Survey'], power: 9, materials: 4, fleet: 0 },
  colonize: { label: ['殖民', 'Settle'], power: 24, materials: 46, fleet: 1 },
  trade: { label: ['贸易', 'Trade'], power: 14, materials: 12, fleet: 0 },
  truce: { label: ['议和', 'Offer truce'], power: 5, materials: 8, fleet: 0 },
  attack: { label: ['出征', 'Dispatch fleet'], power: 28, materials: 30, fleet: 4 },
};

function settlementObstacle(environment, levels) {
  if (environment.radiation > 0.65 && (levels.habitat ?? 0) < 6) return 'shieldRequired';
  if (environment.habitability < 0.36 && (levels.habitat ?? 0) < 2) return 'lifeSupport';
  return null;
}

function makeWorld(planet, owner, year, home = false) {
  const colony = owner === PLAYER && !home;
  return {
    polity: `c-${planet.id}`, owner, population: home ? 185 : colony ? 16 : 39 + (planet.system.slice(1) * 17) % 46,
    power: home ? 170 : colony ? 34 : 58, materials: home ? 140 : colony ? 25 : 64,
    fleet: home ? 7 : colony ? 1 : 2, standing: 0, lastYear: year,
    projects: { solar: home ? 2 : 1, mine: 1, lab: home ? 2 : 1, habitat: home ? 2 : 1 },
  };
}

function isFiniteBetween(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function validateState(galaxy, state) {
  const validPlanet = id => galaxy.planets.has(id);
  const validYear = day => Number.isSafeInteger(day) && day >= 0 && day <= state.year;
  const validOwner = id => id === PLAYER || (typeof id === 'string' && id.startsWith('c-') && Boolean(state.worlds?.[id.slice(2)]));
  if (!state || !['space', 'campaign'].includes(state.mode) || !Number.isSafeInteger(state.year) || state.year < 0
    || typeof state.homeName !== 'string' || !state.homeName || state.homeName.length > 160
    || !state.worlds || Array.isArray(state.worlds) || typeof state.worlds !== 'object' || !state.worlds[galaxy.home]
    || !Array.isArray(state.surveyed) || !state.surveyed.every(validPlanet)
    || new Set(state.surveyed).size !== state.surveyed.length || !state.surveyed.includes(galaxy.home)
    || !Array.isArray(state.missions) || state.missions.length > 100
    || !Number.isSafeInteger(state.nextMission) || state.nextMission < 1
    || !Array.isArray(state.events) || state.events.length > 120) return false;

  for (const [id, world] of Object.entries(state.worlds)) {
    if (!validPlanet(id) || !world || world.polity !== `c-${id}` || !validOwner(world.owner)
      || !RESOURCES.every(key => isFiniteBetween(world[key], key === 'standing' ? -100 : 0, key === 'standing' ? 100 : 1e12))
      || !validYear(world.lastYear) || !world.projects || !['solar', 'mine', 'lab', 'habitat'].every(key => Number.isSafeInteger(world.projects[key]) && isFiniteBetween(world.projects[key], 0, 12))) return false;
  }
  const research = state.research;
  const known = new Set();
  if (!research || !Array.isArray(research.complete) || !isFiniteBetween(research.points, 0, 1e12)
    || !isFiniteBetween(research.progress, 0, 1e12)) return false;
  for (const id of research.complete) {
    const tech = TECH_BY_ID.get(id);
    if (!tech || known.has(id) || !tech.requires.every(parent => known.has(parent))) return false;
    known.add(id);
  }
  if (research.active !== null) {
    const active = TECH_BY_ID.get(research.active);
    if (!active || known.has(active.id) || !active.requires.every(parent => known.has(parent)) || research.progress >= active.cost) return false;
  } else if (research.progress !== 0) return false;

  const missionIds = new Set();
  for (const mission of state.missions) {
    if (!mission || !Object.hasOwn(MISSIONS, mission.kind) || !validPlanet(mission.from) || !validPlanet(mission.to)
      || mission.from === mission.to || !state.worlds[mission.from] || !validOwner(mission.actor)
      || !Number.isSafeInteger(mission.id) || mission.id < 1 || mission.id >= state.nextMission || missionIds.has(mission.id)
      || !validYear(mission.issuedAt) || !isFiniteBetween(mission.departure, mission.issuedAt, 1e12)
      || !isFiniteBetween(mission.arrives, mission.departure, 1e12) || mission.arrives <= state.year
      || !['distance', 'signalYears', 'flightYears', 'transferEnergy', 'fleet', 'strength'].every(key => isFiniteBetween(mission[key], 0, 1e12))) return false;
    missionIds.add(mission.id);
  }
  return state.events.every(event => event && typeof event.kind === 'string' && event.kind.length <= 30 && validYear(event.year)
    && (event.planet === null || validPlanet(event.planet)) && (event.detail === null || (typeof event.detail === 'string' && event.detail.length <= 30)));
}

export class SpaceSimulation {
  static create(seed, mode = 'space', legacy = null) {
    const galaxy = createGalaxy(seed);
    const home = galaxy.planets.get(galaxy.home);
    const state = {
      mode, year: 0, homeName: legacy?.name?.slice(0, 160) || home.name,
      worlds: {}, surveyed: galaxy.systems.slice(0, 7).flatMap(system => system.planets.map(planet => planet.id)),
      research: { complete: mode === 'campaign' ? ['power-1', 'habitat-1', 'industry-1'] : [...STARTING_TECH], points: mode === 'campaign' ? 6 : 12, active: null, progress: 0 },
      missions: [], nextMission: 1, events: [],
    };
    for (const planet of galaxy.planets.values()) {
      if (planet.native) state.worlds[planet.id] = makeWorld(planet, planet.id === home.id ? PLAYER : `c-${planet.id}`, 0, planet.id === home.id);
    }
    if (legacy) {
      const world = state.worlds[home.id];
      world.population = Math.max(40, Math.min(300, legacy.population * 2));
      world.materials = Math.max(70, Math.min(180, legacy.stock));
      world.fleet = 3;
    }
    const sim = new SpaceSimulation(galaxy, state);
    sim.log(mode === 'campaign' ? 'firstOrbit' : 'command', home.id);
    return sim;
  }

  static restore(seed, state) {
    const galaxy = createGalaxy(seed);
    if (!validateState(galaxy, state)) throw new Error('Invalid interstellar state');
    return new SpaceSimulation(galaxy, structuredClone(state));
  }

  constructor(galaxy, state) {
    this.galaxy = galaxy;
    this.state = state;
    this.levels = researchLevels(state.research);
    this.surveyed = new Set(state.surveyed);
  }

  log(kind, planet = null, detail = null) {
    this.state.events.unshift({ kind, planet, detail, year: this.state.year });
    this.state.events.length = Math.min(this.state.events.length, 120);
  }

  ownedWorlds() {
    return Object.entries(this.state.worlds).filter(([, world]) => world.owner === PLAYER);
  }

  ownedBiomes() {
    return new Set(this.ownedWorlds().map(([id]) => this.galaxy.planets.get(id).biome));
  }

  capital() {
    return this.state.worlds[this.galaxy.home].owner === PLAYER ? this.galaxy.home : this.ownedWorlds()[0]?.[0] ?? this.galaxy.home;
  }

  startResearch(id) {
    const research = this.state.research;
    if (!this.ownedWorlds().length) return { ok: false, code: 'lostCommand' };
    const status = getResearchStatus(id, research, this.ownedBiomes());
    if (status !== 'available') return { ok: false, code: status };
    if (research.active) return { ok: false, code: 'researchBusy' };
    research.active = id;
    this.applyResearch(0);
    return { ok: true };
  }

  applyResearch(income) {
    const research = this.state.research;
    research.points = round(Math.min(2500, research.points + income));
    if (!research.active || !this.ownedWorlds().length) return;
    const tech = TECH_BY_ID.get(research.active);
    if (tech.biome && !this.ownedBiomes().has(tech.biome)) return;
    const supply = Math.min(research.points, tech.cost - research.progress);
    research.points = round(research.points - supply);
    research.progress = round(research.progress + supply);
    if (research.progress < tech.cost) return;
    research.complete.push(tech.id);
    research.active = null;
    research.progress = 0;
    this.levels = researchLevels(research);
    this.log('researched', null, tech.id);
  }

  cancelResearch() {
    const { research } = this.state;
    research.points = round(Math.min(2500, research.points + research.progress));
    research.active = null;
    research.progress = 0;
  }

  describe(id) {
    const planet = this.galaxy.planets.get(id);
    const system = this.galaxy.byId.get(planet.system);
    const world = this.state.worlds[id] ?? null;
    const env = planetEnvironment(system, planet, this.state.year);
    const resolution = this.isDetailed(id) ? 'detailed' : 'aggregate';
    const production = world && this.production(id, world, env);
    const districts = resolution === 'detailed' ? planet.basins.map((basin, index) => ({ index, water: clamp(BIOMES[planet.biome].water * (0.67 + basin * 0.58), 0, 1),
      resources: BIOMES[planet.biome].minerals * (0.7 + basin / 2),
      population: world ? world.population * basin / planet.basins.reduce((total, share) => total + share, 0) : 0,
    })) : [];
    return { planet, system, world, env, production, resolution, surveyed: this.surveyed.has(id), districts };
  }

  isDetailed(id) {
    return this.state.worlds[id]?.owner === PLAYER || this.galaxy.byId.get(this.galaxy.planets.get(id).system).index < 7
      || this.surveyed.has(id) || this.state.missions.some(mission => mission.from === id || mission.to === id);
  }

  production(id, world, env) {
    const planet = this.galaxy.planets.get(id);
    const profile = BIOMES[planet.biome];
    const level = world.owner === PLAYER ? this.levels : {};
    const adaptation = level[BIOME_TRACK[planet.biome]] ?? 0;
    const infrastructure = world.projects;
    const effectiveHabitability = clamp(env.habitability + (level.habitat ?? 0) * 0.034 + adaptation * 0.09 + infrastructure.habitat * 0.035, 0, 1);
    const usablePower = (infrastructure.solar * Math.min(3.5, env.averageFlux) * 5 + 3 * infrastructure.solar) * (1 + (level.power ?? 0) * 0.24)
      + adaptation * (planet.biome === 'volcanic' ? 5 : 2.5);
    const upkeep = world.population * (0.035 + env.radiation * 0.03) + world.fleet * 0.32 + (1 - effectiveHabitability) * 2;
    const balance = usablePower - upkeep;
    const productive = world.power > 0 || balance > 0 ? 1 : 0.32;
    const materials = profile.minerals * infrastructure.mine * (3.2 + (level.industry ?? 0) * 0.75 + adaptation * 0.35) * productive;
    const science = (infrastructure.lab * (2.1 + (level.network ?? 0) * 0.34) + Math.min(world.population, 300) * 0.012) * productive;
    return { power: balance, materials, science, life: effectiveHabitability, capacity: 38 * infrastructure.habitat + 490 * effectiveHabitability };
  }

  projectInfo(id, kind) {
    const world = this.state.worlds[id];
    if (!world || world.owner !== PLAYER) return { ok: false, code: 'notOwned' };
    if (!Object.hasOwn(PROJECTS, kind)) return { ok: false, code: 'unknown' };
    const count = kind === 'fleet' ? 1 : world.projects[kind];
    if (count >= 12 || (kind === 'fleet' && world.fleet >= 120)) return { ok: false, code: 'capacity' };
    const power = Math.ceil(PROJECTS[kind].power * (1 + count * 0.18));
    const materials = Math.ceil(PROJECTS[kind].materials * (1 + count * 0.38) / (1 + (this.levels.industry ?? 0) * 0.055));
    return { ok: world.power >= power && world.materials >= materials, code: 'resources', power, materials };
  }

  build(id, kind) {
    const quote = this.projectInfo(id, kind);
    if (!quote.ok) return quote;
    const world = this.state.worlds[id];
    world.power = round(world.power - quote.power);
    world.materials = round(world.materials - quote.materials);
    if (kind === 'fleet') world.fleet = Math.min(120, world.fleet + 4 + Math.floor((this.levels.defense ?? 0) / 2));
    else world.projects[kind]++;
    this.log('built', id, kind);
    return { ok: true };
  }

  missionInfo(kind, from, to, actor = PLAYER) {
    const source = this.state.worlds[from];
    const target = this.state.worlds[to];
    const planet = this.galaxy.planets.get(to);
    if (!source || source.owner !== actor) return { ok: false, code: 'notOwned' };
    if (!planet || from === to || !Object.hasOwn(MISSIONS, kind)) return { ok: false, code: 'invalidTarget' };
    if (this.state.missions.length >= 100) return { ok: false, code: 'capacity' };
    if (this.state.missions.some(mission => mission.kind === kind && mission.actor === actor && mission.to === to)) return { ok: false, code: 'duplicate' };
    if (kind === 'survey' && this.surveyed.has(to)) return { ok: false, code: 'surveyed' };
    if (kind === 'colonize' && (target || planet.biome === 'giant')) return { ok: false, code: 'invalidTarget' };
    if (['trade', 'attack', 'truce'].includes(kind) && (!target || target.owner === actor)) return { ok: false, code: 'invalidTarget' };
    if (kind === 'trade' && target.standing <= -55) return { ok: false, code: 'hostile' };
    if (kind === 'truce' && target.standing > -15) return { ok: false, code: 'notHostile' };
    const terra = this.galaxy.planets.get(from);
    const sourceSystem = this.galaxy.byId.get(terra.system);
    const targetSystem = this.galaxy.byId.get(planet.system);
    const level = actor === PLAYER ? this.levels : { drive: 1, network: 1, habitat: 2, defense: 1 };
    const distance = systemDistance(sourceSystem, targetSystem);
    if (distance && !level.drive) return { ok: false, code: 'driveRequired' };
    if (distance > 12 + (level.drive ?? 0) * 6 + (level.network ?? 0) * 4) return { ok: false, code: 'range' };
    const environment = planetEnvironment(targetSystem, planet, this.state.year);
    const isHighRadiation = environment.radiation > 0.65 && (level.habitat ?? 0) < 6;
    const obstacle = kind === 'colonize' && settlementObstacle(environment, level);
    if (obstacle) return { ok: false, code: obstacle };
    if (isHighRadiation && kind !== 'survey' && kind !== 'truce') return { ok: false, code: 'shieldRequired' };
    const speed = Math.min(0.82, 0.09 + (level.drive ?? 0) * 0.11);
    const plan = travelPlan(this.galaxy, from, to, speed, this.state.year, actor === PLAYER ? this.capital() : from);
    const cost = MISSIONS[kind];
    const power = Math.ceil(cost.power + plan.transferEnergy * 9 + (kind === 'colonize' ? environment.radiation * 8 : 0));
    const materials = cost.materials + (kind === 'colonize' ? Math.ceil((1 - environment.habitability) * 13) : 0);
    const fleet = kind === 'attack' ? Math.min(16 + (level.defense ?? 0) * 2, source.fleet) : cost.fleet;
    const ok = source.power >= power && source.materials >= materials && source.fleet >= cost.fleet;
    return { ok, code: source.fleet < cost.fleet ? 'fleetRequired' : 'resources', plan, power, materials, fleet, strength: fleet * (1 + (level.defense ?? 0) * 0.21) };
  }

  issue(kind, from, to, actor = PLAYER) {
    const quote = this.missionInfo(kind, from, to, actor);
    if (!quote.ok) return quote;
    const source = this.state.worlds[from];
    source.power = round(source.power - quote.power);
    source.materials = round(source.materials - quote.materials);
    source.fleet -= quote.fleet;
    const mission = { id: this.state.nextMission++, actor, kind, from, to, issuedAt: this.state.year,
      ...quote.plan, fleet: quote.fleet, strength: quote.strength };
    this.state.missions.push(mission);
    if (actor === PLAYER || this.state.worlds[to]?.owner === PLAYER) this.log('dispatched', to, kind);
    return { ok: true, mission };
  }

  markSurveyed(id, radius = false) {
    const selected = this.galaxy.planets.get(id);
    const scanned = radius ? this.galaxy.byId.get(selected.system).planets : [selected];
    for (const planet of scanned) {
      if (this.surveyed.has(planet.id)) continue;
      this.surveyed.add(planet.id);
      this.state.surveyed.push(planet.id);
    }
  }

  resolve(mission) {
    const { kind, to, from, actor, strength, fleet } = mission;
    const target = this.state.worlds[to];
    const source = this.state.worlds[from];
    const playerInvolved = actor === PLAYER || target?.owner === PLAYER;
    const planet = this.galaxy.planets.get(to);
    if (actor === PLAYER) this.markSurveyed(to, kind === 'survey');
    if (kind === 'survey') {
      if (playerInvolved) this.log('scanned', to);
    } else if (kind === 'colonize') {
      const environment = planetEnvironment(this.galaxy.byId.get(planet.system), planet, this.state.year);
      const obstacle = settlementObstacle(environment, actor === PLAYER ? this.levels : { habitat: 2 });
      if (target) {
        if (source?.owner === actor) source.fleet += fleet;
        if (playerInvolved) this.log('colonyBlocked', to);
      } else if (obstacle) {
        if (source?.owner === actor) source.fleet += fleet;
        if (playerInvolved) this.log('colonyLost', to);
      } else {
        this.state.worlds[to] = makeWorld(planet, actor, this.state.year);
        if (actor !== PLAYER) this.state.worlds[to].standing = -5;
        if (playerInvolved) this.log('settled', to);
      }
    } else if (kind === 'trade' || kind === 'truce') {
      if (target?.owner === actor || !target || (kind === 'trade' && target.standing <= -55)) {
        if (playerInvolved) this.log('talksFailed', to);
        return;
      }
      target.standing = clamp(target.standing + (kind === 'trade' ? 14 + (this.levels.network ?? 0) * 2 : 37), -100, 100);
      if (kind === 'trade' && source?.owner === actor) {
        source.materials = round(source.materials + 30 + BIOMES[planet.biome].minerals * 8);
        this.state.research.points += 4;
      }
      if (playerInvolved) this.log(kind === 'trade' ? 'traded' : 'peace', to);
    } else if (kind === 'attack' && target) {
      if (target.owner === actor) {
        target.fleet += fleet;
        return;
      }
      const defenseTech = target.owner === PLAYER ? this.levels.defense ?? 0 : 1;
      const garrison = target.fleet * (1 + defenseTech * 0.2) + target.projects.habitat * 1.4 + target.population / 85;
      if (strength > garrison) {
        target.owner = actor;
        target.standing = -100;
        target.population = round(Math.max(1, target.population * 0.84));
        target.fleet = Math.max(1, Math.floor(fleet * 0.54));
        if (playerInvolved) this.log('conquered', to, actor);
      } else {
        target.fleet = Math.max(0, target.fleet - Math.ceil(strength / 3));
        target.standing = -100;
        if (source?.owner === actor) source.fleet += Math.floor(fleet * 0.26);
        if (playerInvolved) this.log('repelled', to, actor);
      }
    }
  }

  advance(years) {
    if (!Number.isSafeInteger(years) || years < 1 || years > 1000 || !Number.isSafeInteger(this.state.year + years)) return;
    const annual = () => {
      const year = ++this.state.year;
      let science = 0;
      for (const [id, world] of Object.entries(this.state.worlds)) {
        const planet = this.galaxy.planets.get(id);
        const system = this.galaxy.byId.get(planet.system);
        const elapsed = year - world.lastYear;
        if (elapsed < 1 || (!this.isDetailed(id) && elapsed < FAR_TICK)) continue;
        const environment = planetEnvironment(system, planet, year);
        const flow = this.production(id, world, environment);
        world.power = round(clamp(world.power + elapsed * flow.power, 0, 850 + world.projects.solar * 85));
        world.materials = round(clamp(world.materials + elapsed * flow.materials, 0, 950 + world.projects.mine * 80));
        const shortage = world.power === 0 ? 0.038 : 0;
        const growth = (flow.life - 0.26) * 0.048 * (1 - world.population / Math.max(1, flow.capacity)) - shortage;
        const nextPopulation = flow.life < 0.26 ? world.population * Math.exp(Math.min(0, growth) * elapsed)
          : world.population * Math.exp(clamp(growth, -0.08, 0.065) * elapsed);
        world.population = round(clamp(nextPopulation, 1, 3500));
        world.lastYear = year;
        if (world.owner === PLAYER) science += flow.science;
        if (world.owner !== PLAYER && year % 8 === 0 && world.fleet > 0 && world.fleet < 8 && world.materials >= 43) {
          world.fleet++;
          world.materials -= 22;
        }
      }
      this.applyResearch(science);
      const arrived = this.state.missions.filter(mission => mission.arrives <= year).sort((a, b) => a.arrives - b.arrives || a.id - b.id);
      this.state.missions = this.state.missions.filter(mission => mission.arrives > year);
      for (const mission of arrived) this.resolve(mission);
      for (const system of this.galaxy.systems) {
        if (year === Math.ceil(system.star.giantAt) || year === Math.ceil(system.star.remnantAt)) this.log('starChanged', system.planets[0].id, stellarState(system, year).phase);
      }
      this.advanceRivals(year);
    };
    for (let step = 0; step < years; step++) annual();
  }

  advanceRivals(year) {
    if (year < 40 || year % 5 !== 0) return;
    const own = this.ownedWorlds();
    const capitals = new Map();
    for (const [id, world] of Object.entries(this.state.worlds)) {
      if (world.owner === PLAYER || (capitals.has(world.owner) && world.owner !== world.polity)) continue;
      capitals.set(world.owner, [id, world]);
    }
    for (const [id, world] of capitals.values()) {
      if (!this.isDetailed(id) && year % 20 !== 0) continue;
      const system = this.galaxy.byId.get(this.galaxy.planets.get(id).system);
      if ((system.index + year / 5) % 9 !== 0) continue;
      const threatened = own.find(([planetId]) => systemDistance(system, this.galaxy.byId.get(this.galaxy.planets.get(planetId).system)) < 7);
      if (world.standing < -40 && threatened && this.issue('attack', id, threatened[0], world.owner).ok) continue;
      const candidateSystems = [system, ...this.galaxy.systems.filter(entry => entry !== system && systemDistance(system, entry) < 7)
        .sort((a, b) => systemDistance(a, system) - systemDistance(b, system))];
      for (const candidate of candidateSystems.flatMap(entry => entry.planets)) {
        if (candidate.biome === 'giant' || this.state.worlds[candidate.id] || candidate.id === 's1-1' && year < 125) continue;
        if (this.issue('colonize', id, candidate.id, world.owner).ok) break;
      }
    }
  }
}
