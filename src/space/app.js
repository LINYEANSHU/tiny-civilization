import { AUTOSAVE_MS } from '../core/config.js';
import { applyStatic, onLangChange, toggleLang } from '../i18n.js';
import { decodeWorldSave, deleteWorld, loadWorld, MANUAL_SLOTS, saveWorld } from '../save.js';
import { StarChart, drawOrbits } from './chart.js';
import { isSpaceSave, restoreSpaceSave, SAVE_SLOTS, spaceSave, worldSlot, worldURL } from './modes.js';
import { PLAYER, SpaceSimulation } from './simulation.js';
import { phrase as p } from './strings.js';
import { action, escapeHtml, n, planetName, renderChronicle, renderInspector, renderMissions, renderResearch, stat } from './view.js';
import './space.css';

function download(data, prefix) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const address = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = address;
  link.download = `tiny-civ-${prefix}-${data.seed.replace(/[^\p{L}\p{N}_.-]/gu, '-').slice(0, 45)}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(address), 2000);
}

const slotLabel = slot => slot === 'autosave' ? p('auto') : `${p('slot')} ${MANUAL_SLOTS.indexOf(slot) + 1}`;
const saveIntent = 'tiny-civ.autosave-intent';
const seedValue = () => globalThis.crypto?.randomUUID?.().slice(0, 8) ?? String(Date.now());

async function openSave(mode, seed, slot) {
  const auto = worldSlot(mode, 'autosave');
  const chosen = worldSlot(mode, slot);
  const [loaded, existing] = await Promise.all([loadWorld(chosen), slot === 'autosave' ? null : loadWorld(auto)]);
  const saved = slot === 'autosave' ? loaded : existing;
  let intent = false;
  try {
    intent = sessionStorage.getItem(saveIntent) === JSON.stringify([seed, slot]);
    sessionStorage.removeItem(saveIntent);
  } catch { /* Confirmation still protects the existing autosave. */ }
  if (loaded?.seed !== seed) return { sim: null, archive: null, protectedSave: !!saved, restored: false };
  const result = restoreSpaceSave(loaded);
  if (result.sim.state.mode !== mode) throw new Error('Checkpoint mode mismatch');
  if (slot !== 'autosave' && intent) await saveWorld(auto, spaceSave(result.sim, mode, result.ground));
  return { sim: result.sim, archive: result.ground, protectedSave: slot !== 'autosave' && !intent, restored: true, clearLoad: intent };
}

export async function startSpace(mode) {
  const params = new URLSearchParams(location.search);
  const requested = params.get('load');
  const slot = SAVE_SLOTS.includes(requested) ? requested : 'autosave';
  const seedParam = params.get('seed');
  const seed = seedParam && seedParam.length <= 512 ? seedParam : seedValue();
  let data;
  let readError = false;
  try { data = await openSave(mode, seed, slot); }
  catch (error) {
    console.warn('Interstellar checkpoint could not be read', error);
    data = { sim: null, archive: null, protectedSave: true, restored: false };
    readError = true;
  }
  if (!data.sim && mode === 'campaign') {
    const overlay = document.getElementById('overlay');
    const title = document.createElement('div');
    title.className = 'ov-box';
    title.setAttribute('role', 'alert');
    const message = document.createElement('p');
    message.textContent = p('readError');
    const link = document.createElement('a');
    link.href = worldURL('ground');
    link.textContent = p('ground');
    title.append(message, link);
    overlay.replaceChildren(title);
    return;
  }
  const sim = data.sim ?? SpaceSimulation.create(seed);
  const archive = data.archive;
  let protectedSave = data.protectedSave;
  let selected = sim.capital();
  let from = sim.capital();
  let tab = 'atlas';
  let era = 'orbit';
  let running = false;
  let navigating = false;
  let status = readError ? 'readError' : data.restored ? 'restored' : protectedSave ? 'protected' : '';
  let saveRequest = 0;
  let saveDialogRequest = 0;
  if (!seedParam || seedParam !== seed || data.clearLoad) {
    history.replaceState(null, '', worldURL(mode, seed, data.clearLoad ? null : requested));
  }

  document.title = `Tiny Civilization · ${p('title')} · ${seed}`;
  const app = document.createElement('main');
  app.id = 'space-app';
  app.innerHTML = `<header class="space-header"></header><nav class="space-nav"></nav><div class="space-body">
    <section class="space-map" data-section="atlas"><div class="space-map-toolbar"></div><canvas id="star-chart" aria-hidden="true"></canvas><div class="space-map-legend"></div><div class="space-missions"></div></section>
    <div class="space-content" hidden></div><aside class="space-inspector" tabindex="-1"></aside></div>
    <footer class="space-footer"></footer><dialog class="space-saves" aria-labelledby="space-save-title"></dialog>`;
  document.body.append(app);
  document.body.classList.add('space-mode');
  const find = selector => app.querySelector(selector);
  const header = find('.space-header');
  const nav = find('.space-nav');
  const map = find('.space-map');
  const search = find('.space-map-toolbar');
  const chart = new StarChart(find('#star-chart'), sim, onSelectSystem);
  chart.selected = sim.galaxy.planets.get(selected).system;
  chart.focus(chart.selected);
  const legend = find('.space-map-legend');
  const missions = find('.space-missions');
  const panel = find('.space-content');
  const inspector = find('.space-inspector');
  const footer = find('.space-footer');
  const dialog = find('.space-saves');
  const orbitObserver = new ResizeObserver(entries => {
    const canvas = entries.at(-1)?.target;
    if (canvas?.isConnected) drawSelectedOrbits(canvas);
  });
  let previousOrbit = null;

  function drawSelectedOrbits(canvas) {
    const planet = sim.galaxy.planets.get(selected);
    drawOrbits(canvas, sim.galaxy.byId.get(planet.system), selected, sim.state.year);
  }

  function onSelectSystem(id, focus = false) {
    const system = sim.galaxy.byId.get(id);
    if (id !== sim.galaxy.planets.get(selected).system) selected = system.planets[0].id;
    chart.selected = id;
    if (focus) chart.focus(id);
    inspector.scrollTop = 0;
    render();
  }

  function renderShell() {
    const own = sim.ownedWorlds();
    const visibleMissions = sim.state.missions.filter(mission => mission.actor === PLAYER || sim.state.worlds[mission.to]?.owner === PLAYER);
    header.innerHTML = `<div class="space-masthead"><span class="space-mark" aria-hidden="true"></span><div><h1>${p('title')}</h1><p>${p(mode === 'campaign' ? 'campaign' : 'free')} · ${escapeHtml(sim.state.homeName)} · <span class="space-seed">${escapeHtml(seed)}</span></p></div></div>
      <dl class="space-header-stats">${stat(p('year'), n(sim.state.year))}${stat(p('worlds'), n(own.length))}${stat(p('fleets'), n(visibleMissions.length))}</dl>
      <div class="space-header-actions"><a href="${worldURL('ground')}">${p('ground')}</a>${mode === 'space' ? `<a href="${worldURL('campaign')}">${p('campaign')}</a>` : `<a href="${worldURL('space')}">${p('free')}</a>`}
      ${action('saves', p('save'))}${action('language', document.documentElement.lang === 'en' ? '简体中文' : 'EN')}</div>`;
    nav.setAttribute('aria-label', p('title'));
    nav.innerHTML = ['atlas', 'research', 'chronicle'].map(value => action('tab', p(value), value, `aria-pressed="${value === tab}"`)).join('');
    const searchValue = sim.galaxy.planets.get(selected).system;
    const oldSelect = search.querySelector('select');
    if (!oldSelect || oldSelect.getAttribute('aria-label') !== p('search')) {
      search.innerHTML = `<label class="space-search"><span>${p('search')}</span><select id="space-system-search" aria-label="${p('search')}">
        ${[...sim.galaxy.systems].sort((a, b) => a.name.localeCompare(b.name)).map(system => `<option value="${system.id}">${escapeHtml(system.name)}</option>`).join('')}
      </select></label><div class="space-zoom">${action('local', p('neighborhood'))}${action('global', p('allStars'))}
      ${action('zoom-in', '+', '', `aria-label="${p('zoomIn')}"`)}${action('zoom-out', '−', '', `aria-label="${p('zoomOut')}"`)}</div>`;
    }
    search.querySelector('select').value = searchValue;
    legend.innerHTML = `<span><i class="key-player"></i>${p('player')}</span><span><i class="key-rival"></i>${p('rival')}</span><span><i class="key-hole"></i>${p('blackHole')}</span><span><i class="key-route"></i>${p('legendTransit')}</span>
      ${action('details', p('planetDetails'), '', 'class="space-text-button space-open-details"')}`;
    footer.innerHTML = `<div class="space-clock" aria-label="${p('release')}">${action('run', p(running ? 'pause' : 'run'), '', `aria-pressed="${running}"`)}
      ${[1, 5, 20].map(value => action('advance', `+${value} ${p('years')}`, value)).join('')}</div><p role="status" aria-live="polite">${status ? p(status) : ''}</p>`;
  }

  function render(preserveFocus = true) {
    if (!sim.state.worlds[from] || sim.state.worlds[from].owner !== PLAYER) from = sim.capital();
    const activeElement = document.activeElement;
    const focusKey = preserveFocus && activeElement?.dataset.action;
    const focusValue = activeElement?.dataset.value;
    const inspectorScroll = inspector.scrollTop;
    const openDistricts = !!inspector.querySelector('.space-districts[open]');
    renderShell();
    map.hidden = tab !== 'atlas';
    inspector.hidden = tab !== 'atlas';
    panel.hidden = tab === 'atlas';
    if (tab === 'atlas') {
      inspector.innerHTML = renderInspector(sim, selected, from);
      if (openDistricts) inspector.querySelector('.space-districts')?.setAttribute('open', '');
      inspector.scrollTop = inspectorScroll;
      if (previousOrbit) orbitObserver.unobserve(previousOrbit);
      previousOrbit = find('#orbital-chart');
      orbitObserver.observe(previousOrbit);
      drawSelectedOrbits(previousOrbit);
      missions.innerHTML = renderMissions(sim);
      chart.draw();
    } else {
      const previousScroll = panel.scrollTop;
      panel.innerHTML = tab === 'research' ? renderResearch(sim, era) : renderChronicle(sim, archive);
      panel.scrollTop = previousScroll;
    }
    if (focusKey && !dialog.open) {
      const selector = `[data-action="${CSS.escape(focusKey)}"][data-value="${CSS.escape(focusValue ?? '')}"]`;
      find(selector)?.focus({ preventScroll: true });
    }
  }

  async function checkpoint(force = false, notify = false) {
    if ((!force && protectedSave) || navigating) return;
    const request = ++saveRequest;
    try {
      const guard = force ? undefined : record => !record || (record.seed === seed && isSpaceSave(record) && record.mode === mode);
      const written = await saveWorld(worldSlot(mode, 'autosave'), spaceSave(sim, mode, archive), guard);
      if (request !== saveRequest) return;
      if (!written) { protectedSave = true; status = 'protected'; render(); return; }
      protectedSave = false;
      if (notify) { status = 'saved'; render(); }
      if (params.get('load')) history.replaceState(null, '', worldURL(mode, seed));
    } catch (error) {
      console.warn('Interstellar autosave failed', error);
      if (request === saveRequest) { status = 'saveError'; render(); }
    }
  }

  function doAdvance(amount, save = true) {
    sim.advance(amount);
    render();
    if (save) checkpoint();
  }

  function normalizeImported(record) {
    if (isSpaceSave(record)) {
      if (record.mode !== mode) throw new Error('Checkpoint mode mismatch');
      restoreSpaceSave(record);
      return record;
    }
    if (mode === 'campaign') return decodeWorldSave(record);
    throw new Error('Requires an interstellar checkpoint');
  }

  async function renderSaves() {
    const request = ++saveDialogRequest;
    const saved = await Promise.all(SAVE_SLOTS.map(key => loadWorld(worldSlot(mode, key))));
    if (request !== saveDialogRequest || !dialog.open) return;
    const focused = document.activeElement?.dataset;
    dialog.innerHTML = `<header><h2 id="space-save-title">${p('save')}</h2>${action('close-saves', p('close'))}</header>
      <div class="space-save-list">${saved.map((record, index) => {
        const key = SAVE_SLOTS[index];
        const identity = record ? `${escapeHtml(record.seed)} · ${p(isSpaceSave(record) ? 'title' : 'ground')}` : p('noSave');
        const title = Number.isFinite(record?.savedAt) ? ` title="${escapeHtml(new Date(record.savedAt).toLocaleString())}"` : '';
        return `<div class="space-save-row"><div><strong>${slotLabel(key)}</strong><small${title}>${identity}</small></div><div>
          ${action('save-slot', p('saveNow'), key)}${record ? action('load-slot', p('load'), key) + action('export-slot', p('download'), key) : ''}
          ${record && key !== 'autosave' ? action('delete-slot', p('delete'), key) : ''}</div></div>`;
      }).join('')}</div><div class="space-save-tools">${action('import-slot', p('importSave'))}
      ${archive ? action('archive', p('archived')) : action('new', p('newSeed'))}</div>
      ${archive ? `<p class="space-note">${p('archiveTip')}</p>` : ''}<p class="space-save-status" role="status">${status ? p(status) : ''}</p>`;
    const lastAction = focused?.action && dialog.querySelector(`[data-action="${CSS.escape(focused.action)}"][data-value="${CSS.escape(focused.value ?? '')}"]`);
    (lastAction || dialog.querySelector('[data-action="close-saves"]'))?.focus({ preventScroll: true });
  }

  async function replaceRun(record) {
    navigating = true;
    try { await saveWorld(worldSlot(mode, 'autosave'), record); }
    catch (error) { navigating = false; throw error; }
    location.href = worldURL(mode, record.seed);
  }

  async function useSlot(operation, key) {
    if (!SAVE_SLOTS.includes(key)) return;
    const storageKey = worldSlot(mode, key);
    if (operation === 'save-slot') {
      if (key === 'autosave') {
        if (!protectedSave || confirm(p('replaceAuto'))) await checkpoint(protectedSave, true);
      } else {
        await saveWorld(storageKey, spaceSave(sim, mode, archive));
        status = 'saved';
      }
    } else if (operation === 'delete-slot' && key !== 'autosave') {
      if (confirm(`${p('delete')} · ${slotLabel(key)}?`)) await deleteWorld(storageKey);
    } else if (operation === 'export-slot') {
      const record = await loadWorld(storageKey);
      if (record) download(record, key);
    } else if (operation === 'load-slot') {
      const record = await loadWorld(storageKey);
      normalizeImported(record);
      if (!confirm(p('replaceRun'))) return;
      await replaceRun(record);
      return;
    }
    render();
    await renderSaves();
  }

  function importSlot() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      if (!file) return;
      let value;
      try { value = normalizeImported(JSON.parse(await file.text())); }
      catch { status = 'badImport'; handleAsync(renderSaves()); return; }
      handleAsync((async () => {
        const keys = MANUAL_SLOTS.map(key => worldSlot(mode, key));
        const slots = await Promise.all(keys.map(loadWorld));
        const available = slots.findIndex(record => !record);
        if (available < 0) status = 'importFull';
        else { await saveWorld(keys[available], value); status = 'imported'; }
        await renderSaves();
      })());
    });
    input.click();
  }

  function handleAsync(operation) {
    operation.catch(error => {
      console.warn('Interstellar storage action failed', error);
      status = 'saveError';
      render();
      const message = dialog.querySelector('.space-save-status');
      if (message) message.textContent = p(status);
    });
  }

  app.addEventListener('change', event => {
    if (event.target.id === 'space-system-search') onSelectSystem(event.target.value, true);
    if (event.target.id === 'space-origin') { from = event.target.value; render(); find('#space-origin')?.focus(); }
  });

  app.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const value = button.dataset.value;
    const operation = button.dataset.action;
    switch (operation) {
      case 'tab': tab = value; panel.scrollTop = 0; break;
      case 'planet': selected = value; break;
      case 'mission-target': selected = value; tab = 'atlas'; chart.selected = sim.galaxy.planets.get(value).system; chart.focus(chart.selected); inspector.scrollTop = 0; break;
      case 'local': chart.overview(true); return;
      case 'global': chart.overview(false); return;
      case 'zoom-in': chart.zoom(0.67); return;
      case 'zoom-out': chart.zoom(1.5); return;
      case 'details': inspector.scrollIntoView({ block: 'start' }); inspector.focus({ preventScroll: true }); return;
      case 'planet-actions': find('.space-actions').scrollIntoView({ block: 'start' }); find('.space-actions').focus({ preventScroll: true }); return;
      case 'advance': doAdvance(Number(value)); return;
      case 'run': running = !running; if (!running) checkpoint(); break;
      case 'era': era = value; panel.scrollTop = 0; break;
      case 'language': toggleLang(); return;
      case 'saves': running = false; dialog.showModal(); dialog.innerHTML = `<header><h2 id="space-save-title">${p('save')}</h2>${action('close-saves', p('close'))}</header><p class="space-save-status" role="status"></p>`; handleAsync(renderSaves()); break;
      case 'close-saves': dialog.close(); return;
      case 'save-slot': case 'load-slot': case 'export-slot': case 'delete-slot': handleAsync(useSlot(operation, value)); return;
      case 'import-slot': importSlot(); return;
      case 'archive': if (archive) download(archive, 'ground-archive'); return;
      case 'new':
        if (mode === 'space' && confirm(p('confirmNew'))) handleAsync(replaceRun(spaceSave(SpaceSimulation.create(seedValue()), mode)));
        return;
      case 'cancel-research': sim.cancelResearch(); checkpoint(); break;
      case 'research': case 'mission': case 'build': {
        const result = operation === 'research' ? sim.startResearch(value) : operation === 'mission' ? sim.issue(value, from, selected) : sim.build(selected, value);
        status = result.ok ? 'success' : result.code === 'resources' ? 'resourcesLow' : result.code;
        if (result.ok) checkpoint();
        break;
      }
      default: return;
    }
    render();
  });

  setInterval(() => { if (running && !document.hidden) doAdvance(1, sim.state.year % 10 === 9); }, 900);
  setInterval(() => checkpoint(), AUTOSAVE_MS);
  document.addEventListener('visibilitychange', () => { if (document.hidden) checkpoint(); });
  onLangChange(() => { render(); if (dialog.open) handleAsync(renderSaves()); });
  applyStatic();
  render(false);
  checkpoint();
}
