import { seededRandom } from '../core/rng.js';

const TAU = Math.PI * 2;
const AU_PER_LIGHT_YEAR = 63241.077;
export const GALAXY_SIZE = 192;

export const BIOMES = {
  terran: { label: ['温带岩质', 'Temperate rocky'], color: '#84bf91', water: 0.64, minerals: 1.0, atmosphere: 1 },
  desert: { label: ['干旱岩质', 'Arid rocky'], color: '#d9a374', water: 0.11, minerals: 1.55, atmosphere: 0.61 },
  ice: { label: ['冰封世界', 'Ice world'], color: '#a4cee0', water: 0.55, minerals: 0.85, atmosphere: 0.37 },
  ocean: { label: ['海洋世界', 'Ocean world'], color: '#70a9df', water: 0.97, minerals: 0.61, atmosphere: 0.93 },
  volcanic: { label: ['火山岩质', 'Volcanic rocky'], color: '#e09179', water: 0.04, minerals: 2.15, atmosphere: 0.31 },
  irradiated: { label: ['辐射岩质', 'Irradiated rocky'], color: '#c6a7c9', water: 0.12, minerals: 1.38, atmosphere: 0.18 },
  giant: { label: ['气态巨行星', 'Gas giant'], color: '#dfbf96', water: 0.08, minerals: 0, atmosphere: 0 },
};

export const STAR_PHASES = {
  main: { label: ['主序星', 'Main sequence'], color: '#f0cf95' },
  giant: { label: ['红巨星', 'Red giant'], color: '#f2936f' },
  supergiant: { label: ['红超巨星', 'Red supergiant'], color: '#ee896d' },
  white: { label: ['白矮星', 'White dwarf'], color: '#bbd6ee' },
  neutron: { label: ['中子星', 'Neutron star'], color: '#a7bbe9' },
  'black-hole': { label: ['黑洞', 'Black hole'], color: '#cfaddf' },
};

const FIRST = ['Al', 'Cael', 'Del', 'El', 'Faen', 'Hal', 'Iri', 'Kal', 'Lin', 'Mer', 'Nel', 'Or', 'Prae', 'Ren', 'Saren', 'Tir', 'Ur', 'Vel'];
const LAST = ['ara', 'eth', 'ion', 'ira', 'os', 'une', 'av', 'ea', 'en', 'il', 'ora', 'ys'];
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
const NEAR = [
  { name: 'Hearth', x: 0, y: 0, mass: 1, type: 'terran', flux: 1, native: true },
  { name: 'Lacuna', x: 3.4, y: 1.8, mass: 0.91, type: 'ocean', flux: 0.9, native: false },
  { name: 'Aster', x: -4.9, y: 2.6, mass: 1.07, type: 'terran', flux: 1.06, native: true },
  { name: 'Nivalis', x: 1.4, y: -6.1, mass: 0.67, type: 'ice', flux: 0.49, native: false },
  { name: 'Umbra', x: 9.8, y: -4.2, mass: 26, type: 'irradiated', flux: 0.11, native: false, phase: 'black-hole' },
  { name: 'Vesper', x: -11.6, y: -5.4, mass: 23, type: 'volcanic', flux: 1.5, native: false, giantAt: 65, remnantAt: 235 },
  { name: 'Sirocco', x: -1.8, y: 7.4, mass: 0.82, type: 'desert', flux: 1.22, native: true },
];

const clamp = (number, low, high) => Math.min(high, Math.max(low, number));
const round = (number, precision = 1000) => Math.round(number * precision) / precision;
const luminosity = mass => mass < 0.43 ? 0.23 * mass ** 2.3 : mass ** 3.5;

export function stellarState(system, year) {
  const { mass, giantAt, remnantAt, phase: initialPhase } = system.star;
  const remnant = mass >= 20 ? 'black-hole' : mass >= 8 ? 'neutron' : 'white';
  const phase = initialPhase ?? (year >= remnantAt ? remnant : year >= giantAt ? mass >= 8 ? 'supergiant' : 'giant' : 'main');
  switch (phase) {
    case 'giant': return { phase, mass: mass * 0.83, luminosity: luminosity(mass) * 40, radiation: 0.31 };
    case 'supergiant': return { phase, mass: mass * 0.68, luminosity: luminosity(mass) * 6, radiation: 0.78 };
    case 'white': return { phase, mass: Math.min(1.35, 0.47 + mass * 0.09), luminosity: 0.008, radiation: 0.22 };
    case 'neutron': return { phase, mass: 1.7, luminosity: 0.014, radiation: 0.92 };
    case 'black-hole': return { phase, mass: mass * 0.35, luminosity: 0, radiation: 0.68 };
    default: return { phase, mass, luminosity: luminosity(mass), radiation: clamp((mass - 0.75) / 24, 0.035, 0.73) };
  }
}

export function orbitPosition(orbit, starMass, year) {
  const { axis, eccentricity, phase } = orbit;
  const period = Math.sqrt(axis ** 3 / starMass);
  const mean = (phase + TAU * (year % period) / period) % TAU;
  let anomaly = mean;
  for (let iteration = 0; iteration < 6; iteration++) {
    anomaly -= (anomaly - eccentricity * Math.sin(anomaly) - mean) / (1 - eccentricity * Math.cos(anomaly));
  }
  const x = axis * (Math.cos(anomaly) - eccentricity);
  const y = axis * Math.sqrt(1 - eccentricity ** 2) * Math.sin(anomaly);
  return { x, y, radius: Math.hypot(x, y), period };
}

export function planetEnvironment(system, planet, year) {
  const star = stellarState(system, year);
  const axis = planet.orbit.axis * system.star.baselineMass / star.mass;
  const orbit = orbitPosition({ ...planet.orbit, axis }, star.mass, year);
  const flux = star.luminosity / orbit.radius ** 2;
  const averageFlux = star.luminosity / (axis ** 2 * Math.sqrt(1 - planet.orbit.eccentricity ** 2));
  const profile = BIOMES[planet.biome];
  const equilibriumKelvin = 278.3 * Math.max(0, averageFlux * (1 - planet.albedo)) ** 0.25;
  const radiation = clamp(star.radiation * Math.max(0.6, Math.sqrt(averageFlux)) + planet.radiation, 0, 1);
  const liquidWater = clamp(1 - Math.abs(equilibriumKelvin - 252) / 162, 0, 1);
  const habitability = clamp(liquidWater * (0.39 + profile.water * 0.38 + profile.atmosphere * 0.23) - radiation * 0.49, 0, 1);
  return { star, axis, orbit, flux, averageFlux, equilibriumKelvin, radiation, habitability: planet.biome === 'giant' ? 0 : habitability };
}

export function createGalaxy(seed) {
  const systems = [];
  const planets = new Map();
  const names = new Set();
  for (let index = 0; index < GALAXY_SIZE; index++) {
    const random = seededRandom(seed, `star:${index}`);
    const anchor = NEAR[index];
    const radius = 12 + 57 * Math.sqrt(random());
    const angle = random() * TAU;
    const nameBase = FIRST[Math.floor(random() * FIRST.length)] + LAST[Math.floor(random() * LAST.length)];
    const name = anchor?.name ?? (names.has(nameBase) ? `${nameBase}-${index + 1}` : nameBase);
    names.add(name);
    const phase = anchor?.phase ?? (!anchor && index % 39 === 0 ? 'black-hole' : !anchor && index % 17 === 0 ? 'white' : null);
    const mass = anchor?.mass ?? (phase === 'black-hole' ? 20 + random() * 12 : random() < 0.055 ? 8 + random() * 24 : 0.32 + random() * 1.25);
    const evolving = !anchor && !phase && (mass >= 8 || index % 23 === 0);
    const giantAt = anchor?.giantAt ?? (evolving ? 110 + Math.floor(random() * 1100) : 1e10 / mass ** 2.5);
    const remnantAt = anchor?.remnantAt ?? (evolving ? giantAt + 120 + Math.floor(random() * 400) : giantAt * 1.13);
    const id = `s${index}`;
    const system = {
      id, index, name, x: anchor?.x ?? round(radius * Math.cos(angle)), y: anchor?.y ?? round(radius * Math.sin(angle) * 0.82),
      star: { mass, phase, giantAt, remnantAt, baselineMass: stellarState({ star: { mass, phase, giantAt, remnantAt } }, 0).mass },
      planets: [],
    };
    const count = anchor ? (index === 4 ? 2 : 5) : 2 + Math.floor(random() * 6);
    const star = stellarState(system, 0);
    const innermostFlux = anchor?.flux ?? (0.5 + random() * 0.9);
    for (let order = 0; order < count; order++) {
      const baseFlux = innermostFlux * 0.59 ** order;
      const type = order === 0 && anchor ? anchor.type : order >= 3 && random() > 0.66 ? 'giant'
        : phase === 'black-hole' || phase === 'neutron' ? 'irradiated'
          : order > 1 ? (random() > 0.22 ? 'ice' : 'desert') : ['terran', 'desert', 'ocean', 'volcanic'][Math.floor(random() * 4)];
      const native = order === 0 && (anchor ? anchor.native : !phase && index % 20 !== 0 && index % 5 <= 1 && mass < 1.7);
      const planet = {
        id: `${id}-${order + 1}`, system: id, index: order, name: `${name} ${ROMAN[order]}`, biome: type, native,
        orbit: { axis: round(Math.sqrt(Math.max(0.032, star.luminosity) / baseFlux)), eccentricity: round(random() * (order ? 0.28 : 0.13)), phase: random() * TAU },
        albedo: round(type === 'ice' ? 0.49 + random() * 0.19 : 0.19 + random() * 0.17),
        gravity: round(type === 'giant' ? 1.9 + random() * 2.4 : 0.53 + random() * 0.9),
        radiation: type === 'irradiated' ? 0.37 : type === 'volcanic' ? 0.14 : 0.04,
        basins: [round(random()), round(random()), round(random()), round(random())],
      };
      system.planets.push(planet);
      planets.set(planet.id, planet);
    }
    systems.push(system);
  }
  return { seed, systems, byId: new Map(systems.map(system => [system.id, system])), planets, home: 's0-1' };
}

export function systemDistance(from, to) {
  return Math.hypot(to.x - from.x, to.y - from.y);
}

export function travelPlan(galaxy, fromId, toId, speed, year, commandId = galaxy.home) {
  const from = galaxy.planets.get(fromId);
  const to = galaxy.planets.get(toId);
  const source = galaxy.byId.get(from.system);
  const target = galaxy.byId.get(to.system);
  const command = galaxy.byId.get(galaxy.planets.get(commandId).system);
  const distance = systemDistance(source, target);
  const commandDelay = systemDistance(command, source);
  if (distance > 0) {
    const signalYears = distance + commandDelay;
    const flightYears = distance / speed;
    const departure = year + signalYears;
    const relativisticEnergy = 2 * (1 / Math.sqrt(1 - speed ** 2) - 1);
    return { distance, signalYears, flightYears, departure, arrives: departure + flightYears, transferEnergy: distance * relativisticEnergy };
  }
  const origin = planetEnvironment(source, from, year);
  const destination = planetEnvironment(target, to, year);
  const signalYears = commandDelay + Math.hypot(origin.orbit.x - destination.orbit.x, origin.orbit.y - destination.orbit.y) / AU_PER_LIGHT_YEAR;
  const transferAxis = (origin.axis + destination.axis) / 2;
  const flightYears = Math.sqrt(transferAxis ** 3 / origin.star.mass) / 2;
  const desiredAngle = (Math.PI - TAU * flightYears / destination.orbit.period) % TAU;
  const phaseNow = Math.atan2(destination.orbit.y, destination.orbit.x) - Math.atan2(origin.orbit.y, origin.orbit.x);
  const relativeRate = TAU / destination.orbit.period - TAU / origin.orbit.period;
  const direction = Math.sign(relativeRate);
  const delta = ((desiredAngle - phaseNow - relativeRate * signalYears) * direction % TAU + TAU) % TAU;
  const wait = Math.abs(relativeRate) > 1e-5 ? delta / Math.abs(relativeRate) : 0;
  const departure = year + signalYears + wait;
  const fromBurn = Math.abs(Math.sqrt(2 - origin.axis / transferAxis) - 1) * Math.sqrt(origin.star.mass / origin.axis);
  const toBurn = Math.abs(1 - Math.sqrt(2 - destination.axis / transferAxis)) * Math.sqrt(origin.star.mass / destination.axis);
  return { distance, signalYears, flightYears, departure, arrives: departure + flightYears, transferEnergy: fromBurn + toBurn };
}
