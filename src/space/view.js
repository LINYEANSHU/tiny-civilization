import { getLang } from '../i18n.js';
import { BIOMES, STAR_PHASES, stellarState } from './galaxy.js';
import { MISSIONS, PLAYER, PROJECTS } from './simulation.js';
import { ERAS, getResearchStatus, TECH_BY_ID, TECHS, TRACK_LABELS } from './technology.js';
import { EVENT_LABELS, local, phrase as p } from './strings.js';

export const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const formatters = { zh: new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }), en: new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }) };
export const n = value => formatters[getLang()].format(value);
const percent = value => `${Math.round(value * 100)}%`;
const signed = value => `${value > 0 ? '+' : ''}${n(value)}`;
const cost = quote => `${n(quote.power)} ${p('power')} · ${n(quote.materials)} ${p('materials')}`;
const year = value => `${n(value)} ${p('years')}`;

export function action(key, label, value = '', attributes = '') {
  return `<button type="button" data-action="${key}" data-value="${escapeHtml(value)}" ${attributes}>${escapeHtml(label)}</button>`;
}

export function stat(label, value, detail = '') {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}${detail ? `<small>${escapeHtml(detail)}</small>` : ''}</dd></div>`;
}

export function planetName(sim, id) {
  return id === sim.galaxy.home ? sim.state.homeName : sim.galaxy.planets.get(id)?.name ?? '';
}

function ownerName(sim, owner) {
  if (owner === PLAYER) return `${p('player')} · ${sim.state.homeName}`;
  return planetName(sim, owner.slice(2));
}

function astroDetails(system, star, currentYear) {
  const next = system.star.phase ? null : [system.star.giantAt, system.star.remnantAt].find(at => at > currentYear);
  const remaining = next === undefined || next === null ? 0 : next - currentYear;
  const duration = remaining >= 1e9 ? `${n(remaining / 1e9)} ${p('billionYears')}` : remaining >= 1e6 ? `${n(remaining / 1e6)} ${p('millionYears')}` : year(remaining);
  const forecast = next ? `<p class="space-note">${p('stellarForecast')} · ${escapeHtml(local(STAR_PHASES[stellarState(system, next).phase].label))} ${duration}</p>` : '';
  return `<p class="space-system-meta">${escapeHtml(local(STAR_PHASES[star.phase].label))} · ${n(star.mass)} ${p('solarMass')}</p>${forecast}`;
}

function planetList(sim, system, selectedId) {
  return `<nav class="space-planets" aria-label="${p('planets')}">${system.planets.map(planet => {
    const controlled = sim.state.worlds[planet.id]?.owner === PLAYER;
    return action('planet', planetName(sim, planet.id), planet.id,
      `aria-pressed="${planet.id === selectedId}"${controlled ? ' class="owned"' : ''}`);
  }).join('')}</nav>`;
}

function renderWorld(sim, record) {
  const { world, env, planet, surveyed, production } = record;
  const classification = local(BIOMES[planet.biome].label);
  const physical = stat(p('orbit'), year(env.orbit.period)) + stat(p('gravity'), `${n(planet.gravity)} g`)
    + stat(p('thermal'), `${n(env.equilibriumKelvin)} K`) + stat(p('flux'), `${n(env.averageFlux)} Sₑ`)
    + stat(p('habit'), percent(env.habitability)) + stat(p('radiation'), percent(env.radiation));
  const identity = world ? `<p class="space-note">${p('localCivilization')} · ${escapeHtml(planetName(sim, planet.id))} <span>/${world.polity}</span><br>${p('alliance')} · ${escapeHtml(ownerName(sim, world.owner))}${world.owner !== PLAYER ? ` · ${p('standing')} ${signed(world.standing)}` : world.standing < 0 ? ` · ${p('occupation')} ${n(-world.standing)}` : ''}</p>` : '';
  const economy = world ? `<dl class="space-readouts world-economy">
    ${stat(p('population'), n(world.population))}${stat(p('fleet'), n(world.fleet))}
    ${stat(p('power'), n(world.power), `${signed(production.power)}/${p('years')}`)}
    ${stat(p('materials'), n(world.materials), `${signed(production.materials)}/${p('years')}`)}
  </dl>` : '';
  const districtHtml = surveyed && record.districts.length ? `<details class="space-districts"><summary>${p('district')} · ${record.districts.length}</summary>
    <table><thead><tr><th>${p('district')}</th><th>${p('water')}</th><th>${p('resources')}</th><th>${p('population')}</th></tr></thead>
    <tbody>${record.districts.map(district => `<tr><td>${district.index + 1}</td><td>${percent(district.water)}</td><td>${n(district.resources)}</td><td>${n(district.population)}</td></tr>`).join('')}</tbody></table></details>`
    : `<p class="space-note">${p('dataPending')}</p>`;
  return `<section class="space-world"><div class="space-title-row"><h3>${escapeHtml(planetName(sim, planet.id))}</h3>
    <span class="space-world-state${world?.owner === PLAYER ? ' controlled' : ''}">${p(world ? world.owner === PLAYER ? 'player' : 'rival' : 'empty')}</span></div>
    <p class="space-note">${classification} · ${p(record.resolution === 'detailed' ? 'detail' : 'aggregate')}</p>
    ${identity}${economy}<dl class="space-readouts">${physical}</dl>${districtHtml}</section>`;
}

function buildTable(sim, id) {
  return `<section class="space-actions" tabindex="-1"><h3>${p('industryTitle')}</h3><div class="space-action-list">${Object.entries(PROJECTS).map(([key, project]) => {
    const quote = sim.projectInfo(id, key);
    const count = sim.state.worlds[id].projects[key];
    const caption = quote.power === undefined ? p(quote.code) : cost(quote);
    const label = `${local(project.label)}${count ? ` · ${count}` : ''}`;
    return `<div class="space-action-row"><div><strong>${label}</strong><small>${caption}</small></div>${action('build', p('build'), key, quote.ok ? '' : 'disabled')}</div>`;
  }).join('')}</div></section>`;
}

function renderOrders(sim, id, source) {
  const world = sim.state.worlds[id];
  const owned = sim.ownedWorlds();
  let choices = [];
  if (world && world.owner !== PLAYER) choices = ['survey', 'trade', 'truce', 'attack'];
  if (!world) choices = sim.galaxy.planets.get(id).biome === 'giant' ? ['survey'] : ['survey', 'colonize'];
  if (sim.surveyed.has(id)) choices = choices.filter(key => key !== 'survey');
  const missionRows = choices.map(key => {
    const quote = sim.missionInfo(key, source, id);
    const plan = quote.plan;
    const wait = plan ? Math.max(0, plan.departure - sim.state.year - plan.signalYears) : 0;
    const reasons = quote.ok ? '' : ` · ${p(quote.code === 'resources' ? 'resourcesLow' : quote.code)}`;
    return `<div class="space-order"><div class="space-action-row"><div><strong>${local(MISSIONS[key].label)}</strong>
        <small>${plan ? `${cost(quote)}${reasons}` : p(quote.code)}</small></div>
        ${action('mission', local(MISSIONS[key].label), key, quote.ok ? '' : 'disabled')}</div>
        ${plan ? `<p class="space-order-plan">${p('signal')} ${year(plan.signalYears)} · ${wait > 0.01 ? `${p('launchWindow')} ${year(wait)} · ` : ''}${p('transit')} ${year(plan.flightYears)} · ${p('arrival')} ${year(plan.arrives)}</p>` : ''}</div>`;
  }).join('');
  const sourceSelect = owned.length ? `<label class="space-field">${p('origin')} <select id="space-origin">${owned.map(([id]) => `<option value="${id}" ${source === id ? 'selected' : ''}>${escapeHtml(planetName(sim, id))}</option>`).join('')}</select></label>` : '';
  const message = !owned.length ? p('noCommand') : !choices.length ? p(world ? 'destinationOwned' : 'beyondLimit') : '';
  return `<section class="space-actions" tabindex="-1"><h3>${p('mission')}</h3>${message ? `<p class="space-note">${message}</p>` : `${sourceSelect}<div class="space-action-list">${missionRows}</div>`}</section>`;
}

export function renderInspector(sim, id, source) {
  const record = sim.describe(id);
  return `<section class="space-system"><h2>${escapeHtml(record.system.name)}</h2>${astroDetails(record.system, record.env.star, sim.state.year)}
    <canvas id="orbital-chart" aria-hidden="true"></canvas>${planetList(sim, record.system, id)}
    ${action('planet-actions', p(record.world?.owner === PLAYER ? 'industryTitle' : 'mission'), '', 'class="space-text-button space-jump"')}</section>
    ${renderWorld(sim, record)}${record.world?.owner === PLAYER ? buildTable(sim, id) : renderOrders(sim, id, source)}`;
}

const EFFECTS = {
  drive: ['提高巡航速度与航程。', 'Raises cruise speed and range.'], power: ['增加各行星发电量。', 'Increases planetary power output.'],
  habitat: ['提高人口承载和宜居性，解锁更严苛行星的殖民。', 'Improves habitat capacity and permits harsher destinations.'],
  industry: ['提高产量并降低建设成本。', 'Increases extraction and reduces building costs.'],
  network: ['增加航程、研究产出与外交收益。', 'Extends reach and improves research and diplomacy.'],
  defense: ['提升舰队生产与攻防强度。', 'Improves fleet production and combat strength.'],
};

function detailsForTech(tech) {
  if (tech.biome) return getLang() === 'zh'
    ? `强化${local(BIOMES[tech.biome].label)}行星的宜居性、发电与采矿。`
    : `Improves habitability, power and extraction on ${local(BIOMES[tech.biome].label).toLowerCase()} worlds.`;
  return local(EFFECTS[tech.track]);
}

export function renderResearch(sim, era) {
  const owned = sim.ownedBiomes();
  const research = sim.state.research;
  const active = TECH_BY_ID.get(research.active);
  const eraTabs = Object.entries(ERAS).map(([value, label]) => action('era', local(label), value, `aria-pressed="${value === era}"`)).join('');
  const branches = Object.keys(TRACK_LABELS).flatMap(track => {
    const techs = TECHS.filter(tech => tech.era === era && tech.track === track);
    if (!techs.length) return [];
    return `<section class="space-branch"><h3>${local(TRACK_LABELS[track])}</h3><p>${detailsForTech(techs[0])}</p>${techs.map(tech => {
      const status = getResearchStatus(tech.id, research, owned);
      const prereqs = tech.requires.map(id => escapeHtml(local(TECH_BY_ID.get(id).name))).join(' / ');
      const stage = status === 'available' && active ? 'researchBusy' : status;
      return `<article class="space-tech ${status}" id="tech-${tech.id}"><div class="space-tech-title"><h4>${local(tech.name)}</h4><span>${p(stage)}</span></div>
        <p>${n(tech.cost)} ${p('science')}${tech.biome ? ` · ${local(BIOMES[tech.biome].label)}` : ''}</p>
        ${prereqs ? `<p class="space-prereq">${p('requires')} · ${prereqs}</p>` : ''}
        ${status === 'available' && !active ? action('research', p('assign'), tech.id) : ''}</article>`;
    }).join('')}</section>`;
  }).join('');
  return `<div class="space-section-head"><div><h2>${p('research')}</h2><p>${research.complete.length} / ${TECHS.length} ${p('complete')}</p></div></div>
    <section class="space-research-status"><div><small>${p('activeResearch')}</small><strong>${active ? local(active.name) : p('noResearch')}</strong></div>
      ${active ? `<progress value="${research.progress}" max="${active.cost}" aria-label="${p('activeResearch')}"></progress><span>${n(research.progress)} / ${n(active.cost)}</span>${action('cancel-research', p('stop'))}` : ''}
      <div><small>${p('bank')}</small><strong>${n(research.points)}</strong></div></section>
    <nav class="space-era" aria-label="${p('purpose')}">${eraTabs}</nav><div class="space-branches">${branches}</div>`;
}

export function renderMissions(sim) {
  const missions = sim.state.missions.filter(mission => mission.actor === PLAYER || sim.state.worlds[mission.to]?.owner === PLAYER);
  return `<h3>${p('ledger')} <span>${missions.length}</span></h3>${missions.length ? `<ol>${missions.map(mission => `<li>
    <div><strong>${local(MISSIONS[mission.kind].label)}${mission.actor === PLAYER ? '' : ` · ${p('rival')}`}</strong>
    ${action('mission-target', planetName(sim, mission.to), mission.to, 'class="space-text-button"')}</div>
    <small>${p(sim.state.year < mission.departure ? 'waiting' : 'enRoute')} · ${p('arrival')} ${year(mission.arrives)}</small>
  </li>`).join('')}</ol>` : `<p>${p('noMissions')}</p>`}`;
}

export function renderChronicle(sim, archive) {
  const events = sim.state.events.map(event => {
    let details = '';
    if (event.kind === 'researched') details = local(TECH_BY_ID.get(event.detail)?.name ?? ['', '']);
    if (event.kind === 'built' && Object.hasOwn(PROJECTS, event.detail)) details = local(PROJECTS[event.detail].label);
    if (event.kind === 'dispatched' && Object.hasOwn(MISSIONS, event.detail)) details = local(MISSIONS[event.detail].label);
    if (event.kind === 'starChanged' && Object.hasOwn(STAR_PHASES, event.detail)) details = local(STAR_PHASES[event.detail].label);
    const label = Object.hasOwn(EVENT_LABELS, event.kind) ? local(EVENT_LABELS[event.kind]) : p('unknown');
    return `<li><time>${p('year')} ${n(event.year)}</time><strong>${label}</strong>
      <span>${event.planet ? action('mission-target', planetName(sim, event.planet), event.planet, 'class="space-text-button"') : ''}${details ? ` ${escapeHtml(details)}` : ''}</span></li>`;
  });
  return `<div class="space-section-head"><div><h2>${p('chronicle')}</h2>${archive ? `<p>${p('archiveTime')} ${archive.sim.clock.day} · ${action('archive', p('archived'), '', 'class="space-text-button"')}</p>` : ''}</div></div>
    <section class="space-events"><h3>${p('calendar')}</h3><ol>${events.join('')}</ol></section>
    <details class="space-districts space-model"><summary>${p('model')}</summary><p>${p('signalModel')}</p><p>${p('starModel')}</p></details>`;
}
