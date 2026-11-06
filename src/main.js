// ============================================================
// main.js — 应用编排：启动 / 主循环 / UI / 交互 / 存档
// ============================================================
import * as THREE from 'three';
import { buildAtlas, buildWaterTexture } from './world/atlas.js';
import { ChunkManager } from './world/chunkManager.js';
import { Scene3D } from './render/scene.js';
import { Characters } from './render/characters.js';
import { Particles } from './render/particles.js';
import { Minimap } from './render/minimap.js';
import { Sim } from './sim/sim.js';
import { GameClock } from './sim/time.js';
import { AUTOSAVE_MS, SEA } from './core/config.js';
import { saveWorld, loadWorld, deleteWorld, listWorlds, MANUAL_SLOTS, serializeJournal, deserializeJournal } from './save.js';
import { t, getLang, toggleLang, applyStatic, onLangChange, evText } from './i18n.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

// 每帧复用对象（避免主循环分配）
const _selV = new THREE.Vector3();
const _envClock = { hour: 0, season: 0, dayOfYear: 0 };
// WSTATE 枚举 → 粒子系统字符串（原实现每帧新建数组字面量再按下标取值）
const WSTATE_STR = ['clear', 'cloud', 'rain', 'storm', 'snow', 'blizzard', 'fog', 'sandstorm'];

// ---------- 参数 ----------
const qs = new URLSearchParams(location.search);
let seedStr = qs.get('seed') || String((Math.random() * 1e9) | 0);
// Keep a generated world's identity through reloads so its autosave can be found.
if (!qs.get('seed')) {
  const url = new URL(location.href);
  url.searchParams.set('seed', seedStr);
  history.replaceState(null, '', url);
}
document.title = `Tiny Civilization · ${seedStr}`;

// ---------- 三件套 ----------
const canvas = $('scene');
const atlasTex = buildAtlas('tiny-civ-v1');
const waterTex = buildWaterTexture('tc-water-v1');
const scene3d = new Scene3D(canvas, atlasTex, waterTex);
const cm = new ChunkManager(scene3d.scene, scene3d.solidMat, scene3d.waterMat, seedStr);

const characters = new Characters(scene3d.scene);
const particles = new Particles(scene3d.scene);
const minimap = new Minimap($('minimap'), cm);

let sim = null;
let selected = null;        // {type:'agent'|'settle', id}
let selectedAgent = null;

// ---------- 工具 ----------
let toastTimer = 0;
function toast(msg, ms = 2600) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

function setProgress(text, pct) {
  $('ovText').textContent = text;
  $('ovBar').style.width = `${Math.round(pct * 100)}%`;
}

const WORLD_PRE = ['苍翠', '晨雾', '远山', '碧波', '金穗', '星落', '松涛', '云影', '湖光', '赤霞'];
const WORLD_SUF = ['之野', '大陆', '群山', '星海', '沃土', '纪元', '之地', '河湾'];
function worldName(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h ^ seed.charCodeAt(i), 16777619)) >>> 0;
  return WORLD_PRE[h % WORLD_PRE.length] + WORLD_SUF[Math.floor(h / 256) % WORLD_SUF.length];
}

// ---------- 新闻横幅 ----------
// 重大事件（good 类）：升格 / 建村 / 新国家 —— 与旧版文案关键词一致
const IMPORTANT_GOOD_KEYS = new Set(['ev.devGrow.0', 'ev.devGrow.1', 'ev.devGrow.2', 'ev.devGrow.3', 'ev.foundJoin', 'ev.foundNew']);
let tickerTimer = 0;
function pushTicker(ev) {
  const important = ev.type === 'war' || ev.type === 'bad'
    || (ev.type === 'good' && (ev.key ? IMPORTANT_GOOD_KEYS.has(ev.key)
      : (ev.text.includes('成长为') || ev.text.includes('建立'))));
  if (!important) return;
  const el = $('ticker');
  $('tickerText').textContent = t('hud.ticker', { year: ev.year, text: evText(ev) });
  el.classList.remove('hidden');
  el.classList.toggle('war', ev.type === 'war' || ev.type === 'bad');
  requestAnimationFrame(() => el.classList.add('show'));
  clearTimeout(tickerTimer);
  tickerTimer = setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.classList.add('hidden'), 400);
  }, 6500);
}
$('ticker').addEventListener('click', () => { refreshHistory(); $('historyPanel').classList.remove('hidden'); });

// ---------- 动态面板布局：强制 10px 分隔 ----------
function layoutPanels() {
  const wi = $('worldInfo'), tp = $('toolPanel');
  if (wi && tp) tp.style.top = `${Math.round(wi.getBoundingClientRect().bottom + 10)}px`;
  const pf = $('perfPanel'), ip = $('infoPanel');
  if (pf && ip && !ip.classList.contains('hidden')) {
    ip.style.top = `${Math.round(pf.getBoundingClientRect().bottom + 10)}px`;
  }
}
window.addEventListener('resize', layoutPanels);
const panelObserver = new ResizeObserver(layoutPanels);
panelObserver.observe($('worldInfo'));
panelObserver.observe($('perfPanel'));
$('toolPanel').addEventListener('toggle', layoutPanels);

// ---------- 语言切换 ----------
applyStatic();
$('langLabel').textContent = getLang() === 'zh' ? 'EN' : '中';
$('btnLang').addEventListener('click', () => toggleLang());

// 语言切换后重绘所有动态面板（静态 DOM 由 i18n.applyStatic 处理）
onLangChange(() => {
  if (!sim) return;
  updateHUD();
  refreshSettleList();
  refreshHistory();
  syncMapModeUi();
  if (selected?.type === 'settle') selectSettle(selected.id);
  else if (selected?.type === 'agent') selectAgent(selected.id);
  if (!$('savePanel').classList.contains('hidden')) renderSavePanel();
});

// ---------- 启动 ----------
async function boot() {
  $('worldName').textContent = worldName(seedStr);
  $('seedLabel').textContent = seedStr;
  setProgress(t('boot.mountains'), 0.1);
  await cm.whenReady();

  // 读取存档：?load=<slot> 指定槽位（存档管理面板"读取"跳转），
  // 缺省读自动存档。槽位白名单校验，避免任意键注入。
  const loadParam = qs.get('load');
  const loadSlot = [ 'autosave', ...MANUAL_SLOTS ].includes(loadParam) ? loadParam : 'autosave';
  let loaded = false;
  let saveData = null;
  try {
    const save = await loadWorld(loadSlot);
    if (save && save.seed === seedStr && save.v >= 2) {
      saveData = save;
      setProgress(t('boot.restoring'), 0.3);
      cm.journal = deserializeJournal(save.journal);
      sim = Sim.deserialize(save.sim, seedStr, cm);
      loaded = true;
      setTimeout(() => toast(loadSlot === 'autosave' ? t('boot.restoredAuto') : t('boot.restoredSlot', { slot: slotLabel(loadSlot) })), 1200);
    } else if (save && save.seed !== seedStr) {
      console.warn(`存档种子(${save.seed})与 URL 种子(${seedStr})不一致，改为新世界`);
    }
  } catch (e) { console.warn('读档失败', e); }

  if (!sim) {
    sim = new Sim(seedStr, cm);
    await sim.init(setProgress);
  }
  sim.history.onEvent = pushTicker;   // 新闻横幅
  // 聚落领地（禁止长树）同步到 Worker
  cm.syncClaimsToWorker();

  scene3d.setGroundHint((x, z) => Math.max(cm.surfaceY(Math.round(x), Math.round(z)), SEA) + 4);

  // 相机初始位置
  if (saveData && saveData.cam && loaded) {
    scene3d.cam.target.set(saveData.cam.x, saveData.cam.y, saveData.cam.z);
    scene3d.camGoal.target.copy(scene3d.cam.target);
    scene3d.cam.dist = saveData.cam.dist; scene3d.camGoal.dist = saveData.cam.dist;
    scene3d.cam.yaw = saveData.cam.yaw; scene3d.cam.pitch = saveData.cam.pitch;
  } else {
    const first = sim.settlements[0];
    const fx = first ? first.x : 0, fz = first ? first.z : 0;
    scene3d.cam.target.set(fx, cm.groundAt(Math.round(fx), Math.round(fz)) + 6, fz);
    scene3d.camGoal.target.copy(scene3d.cam.target);
    scene3d.cam.dist = 70; scene3d.camGoal.dist = 70;
  }

  minimap.loadTerrain().then(() => { /* 地图就绪 */ });
  cm.onChunkReady = (cx, cz) => { if (sim) sim.onChunkReady(cx, cz); };
  minimap.onClick = () => toggleBigMap(true);   // 点小地图 → 展开全景大地图

  setProgress(t('boot.welcome'), 1);
  $('overlay').classList.add('done');
  setTimeout(() => { $('overlay').style.display = 'none'; }, 800);
  sim.clock.paused = false;
  refreshSettleList();
  refreshHistory();
  layoutPanels();
}

// ---------- 主循环 ----------
let _simMs = 0;
scene3d._renderCb = (dt, realDt) => {
  if (!sim) return;
  const t = scene3d._clock.elapsedTime;
  const camX = scene3d.cam.target.x, camZ = scene3d.cam.target.z;

  // 文明演化按真实时间推进（不被帧率钳制）；动画用渲染 dt
  _simMs = sim.update(realDt, camX, camZ);
  cm.update(camX, camZ);
  characters.sync(sim.agents.agents, t);
  characters.syncAnimals(sim.wildlife.animals);

  // 天气
  const wEnum = sim.weather.stateAt(camX, camZ, sim.clock.day);
  const wStr = WSTATE_STR[wEnum];
  particles.setWeather(wStr, sim.weather.intensity(wEnum));
  particles.update(dt, scene3d.camera.position, sim.disasters.fireCells);
  // 日照锁定：高速时用停驻的视觉时刻，季节仍走真实日历
  // （setEnvironment 只读 hour/season/dayOfYear，复用对象避免每帧分配）
  let envClock = sim.clock;
  if (isSunLocked()) {
    envClock = _envClock;
    _envClock.hour = lockedHour;
    _envClock.season = sim.clock.season;
    _envClock.dayOfYear = sim.clock.dayOfYear;
  }
  scene3d.setEnvironment(envClock, wStr, sim.weather.intensity(wEnum));

  updateSelRing();
  minimap.render(camX, camZ, sim.settlements, sim.nations, sim.nations.wars, performance.now());
};

setInterval(() => {
  if (!sim) return;
  updateHUD();
  refreshSettleList();
}, 400);

setInterval(() => {
  if (!sim || sim.clock.paused) return;
  doSave('autosave').catch(() => {});
}, AUTOSAVE_MS);

scene3d.onStats = ({ fps, calls, tris }) => {
  $('pFps').textContent = fps;
  $('pCalls').textContent = calls;
  $('pTris').textContent = tris >= 1000 ? (tris / 1000).toFixed(0) + 'k' : tris;
};

// ---------- HUD ----------
const SPD_BTNS = document.querySelectorAll('.spd');   // 静态 NodeList，缓存避免每 400ms 重查
const SEL_RING = $('selRing');                        // 选择环元素（每帧使用，缓存避免重复 getElementById）
function updateHUD() {
  const c = sim.clock;
  $('dateLabel').textContent = c.dateLabel();
  $('seasonLabel').textContent = t(`season.${c.season}`);
  $('clockLabel').textContent = (c.isNight ? t('hud.night') : t('hud.day')) + c.clockLabel();
  const wEnum = sim.weather.stateAt(scene3d.cam.target.x, scene3d.cam.target.z, c.day);
  $('weatherLabel').textContent = t(`weather.${wEnum}`);
  $('pChunks').textContent = cm.stats.chunks + (cm.stats.queued ? `(+${
    cm.stats.queued})` : '');
  if (cm.stats.genMs !== undefined) $('pGenMs').textContent = cm.stats.genMs.toFixed(1);
  $('pAgents').textContent = sim.agents.count();
  $('pSim').textContent = _simMs.toFixed(1);
  if (performance.memory) {
    $('pMem').textContent = (performance.memory.usedJSHeapSize / 1048576).toFixed(0) + 'MB';
  }
  // 速度按钮态
  SPD_BTNS.forEach(b => {
    b.classList.toggle('active', !c.paused && parseInt(b.dataset.spd) === c.speed);
  });
  $('btnPause').classList.toggle('active', c.paused);
}

function refreshSettleList() {
  const el = $('settleList');
  if (!sim) return;
  if (el.children.length !== sim.settlements.length) {
    el.innerHTML = '';
    for (const s of sim.settlements) {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'srow';
      const n = sim.nations.get(s.nationId);
      const col = n ? `#${n.color.toString(16).padStart(6, '0')}` : '#999';
      row.innerHTML = `<span class="dot" style="background:${col}"></span><span class="sname"></span><span class="cnt">${t('settle.popUnit', { n: Math.round(s.pop) })}</span>`;
      row.querySelector('.sname').textContent = s.name;
      row.addEventListener('click', () => {
        scene3d.flyTo(s.x, s.z, 60);
        selectSettle(s.id);
      });
      el.appendChild(row);
    }
  } else {
    // 直接迭代 HTMLCollection（原实现 [...展开] 每次复制整个子元素数组）
    let i = 0;
    for (const row of el.children) {
      const s = sim.settlements[i++];
      if (!s) break;
      row.children[2].textContent = t('settle.popUnit', { n: Math.round(s.pop) });
    }
  }
}

// ---------- 选择 ----------
function selectSettle(id) {
  selected = { type: 'settle', id };
  const s = sim.settleById(id);
  if (!s) return;
  const n = sim.nations.get(s.nationId);
  const nat = s.nationId >= 0 ? sim.nations.list[s.nationId] : null;
  const rows = [
    ['row.pop', t('row.popVal', { a: Math.round(s.pop), b: s.houseCap })],
    ['row.dev', t(`dev.${s.devLevel}`)],
    ['row.food', Math.floor(s.food)],
    ['row.wood', Math.floor(s.wood)],
    ['row.stone', Math.floor(s.stone)],
    ['row.wealth', Math.floor(s.wealth)],
    ['row.morale', Math.round(s.morale)],
    ['row.nation', nat ? nat.name + ' · ' + t(`tech.${nat.tech}`) : t('row.none')],
  ];
  const builds = [];
  if (s.houses.length) builds.push(`${t('build.house')}×${s.houses.length}`);
  if (s.farms.length) builds.push(`${t('build.farm')}×${s.farms.length}`);
  if (s.storage) builds.push(t('build.storage'));
  if (s.lumber) builds.push(t('build.lumber'));
  if (s.quarry) builds.push(t('build.quarry'));
  if (s.market) builds.push(t('build.market'));
  if (s.townhall) builds.push(t('build.townhall'));
  if (s.windmill) builds.push(t('build.windmill'));
  if (s.granary) builds.push(t('build.granary'));
  if (s.wallsBuilt) builds.push(t('build.walls'));
  if (s.watchtowers.length) builds.push(`${t('build.watchtower')}×${s.watchtowers.length}`);
  const q = s.buildQueue[0];
  const fx = q ? `<div class="row"><span>${t('panel.building')}</span><b>${escapeHtml(t(`build.${q.type}`))} ${Math.round(q.progress / q.need * 100)}%</b></div>` : '';
  const KNOWN_EFFECTS = { drought: 1, flood: 1, blizzard: 1, plague: 1 };
  const effects = s.effects.length ? `<div class="note">${escapeHtml(t('panel.effects', { list: s.effects.map(e => KNOWN_EFFECTS[e.kind] ? t(`effect.${e.kind}`) : e.kind).join(getLang() === 'zh' ? '、' : ', ') }))}</div>` : '';
  const cultureKey = ({ wood: 'culture.wood', stone: 'culture.stone', adobe: 'culture.adobe', nordic: 'culture.nordic' })[s.cultureKey];
  const cultureLabel = cultureKey ? t('tag.culture', { v: t(cultureKey) }) : '';
  $('infoBody').innerHTML = `
    <h3>${escapeHtml(s.name)}</h3>
    <span class="tag">${t(`tag.${Math.min(3, s.devLevel)}`)} · ${t('tag.founded', { y: s.foundedDay <= 48 ? 1 : Math.floor((s.foundedDay - 1) / 48) + 1 })} · ${cultureLabel}</span>
    ${rows.map(r => `<div class="row"><span>${t(r[0])}</span><b>${escapeHtml(r[1])}</b></div>`).join('')}
    ${fx}
    <h4>${t('panel.builds')}</h4><div class="note">${builds.join(' · ') || t('panel.none')}</div>
    ${effects}`;
  $('infoPanel').classList.remove('hidden');
}

function selectAgent(id) {
  const a = sim.agents.agents.get(id);
  if (!a) return;
  selected = { type: 'agent', id };
  selectedAgent = a;
  const s = sim.settleById(a.settleId);
  const jobDef = t(`job.${a.job}`) || a.job;
  const stateName = a.state === 'work'
    ? t(`st.work.${a.job}`) || t('st.work')
    : t(`st.${a.state}`) || a.state;
  const armyName = a.data && a.data.army ? ' · ' + t('agent.army', { name: sim.nations.get(a.data.army.nationId)?.name || '' }) : '';
  const desc = a.job === 'soldier' ? t('agent.desc.soldier')
    : a.job === 'trader' ? t('agent.desc.trader')
    : a.job === 'child' ? t('agent.desc.child')
    : t('agent.desc.default');
  $('infoBody').innerHTML = `
    <h3>${escapeHtml(a.name)}</h3>
    <span class="tag">${escapeHtml(jobDef)}${s ? ' · ' + escapeHtml(s.name) : ''}${escapeHtml(armyName)}</span>
    <div class="row"><span>${t('panel.status')}</span><b>${escapeHtml(stateName)}</b></div>
    <div class="row"><span>${t('panel.pos')}</span><b>${Math.round(a.x)}, ${Math.round(a.z)}</b></div>
    <div class="row"><span>${t('panel.hp')}</span><b>${Math.max(0, Math.round(a.hp * 10))}%</b></div>
    <div class="note">${desc}</div>`;
  $('infoPanel').classList.remove('hidden');
}

function deselect() {
  selected = null;
  selectedAgent = null;
  $('infoPanel').classList.add('hidden');
  SEL_RING.classList.add('hidden');
}

function updateSelRing() {
  if (!selected) return;
  const v = _selV;
  if (selected.type === 'agent') {
    const a = sim.agents.agents.get(selected.id);
    if (!a) { deselect(); return; }
    v.set(a.x, a.y + 1.1, a.z);
  } else {
    const s = sim.settleById(selected.id);
    if (!s) { deselect(); return; }
    v.set(s.x, s.g + 3, s.z);
  }
  v.project(scene3d.camera);
  if (v.z > 1) { SEL_RING.classList.add('hidden'); return; }
  const el = SEL_RING;
  el.classList.remove('hidden');
  const size = selected.type === 'settle' ? 42 : 26;
  el.style.width = el.style.height = size + 'px';
  el.style.left = `${(v.x * 0.5 + 0.5) * window.innerWidth - size / 2}px`;
  el.style.top = `${(-v.y * 0.5 + 0.5) * window.innerHeight - size / 2}px`;
}

// ---------- 点击拾取 ----------
const _ray = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
scene3d.onClick = (px, py) => {
  if (!sim) return;
  _ndc.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
  _ray.setFromCamera(_ndc, scene3d.camera);

  // 1) 村民
  const aid = characters.pick(_ray);
  if (aid !== null && aid !== undefined) {
    selectAgent(aid);
    return;
  }
  // 2) 地面 → 最近聚落
  const hits = _ray.intersectObject(cm.group, true);
  if (hits.length) {
    const p = hits[0].point;
    let best = null, bd = 30;
    for (const s of sim.settlements) {
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    if (best) { selectSettle(best.id); return; }
  }
  deselect();
};

// ---------- 历史 / 面板 ----------
// E2：编年史类型过滤（'all' + history.add 实际使用的类型：war/build/trade/good/bad）
let histFilter = 'all';
function refreshHistory() {
  if (!sim) return;
  const el = $('histBody');
  const evs = [...sim.history.events].reverse();
  const shown = histFilter === 'all' ? evs : evs.filter(e => e.type === histFilter);
  $('histCount').textContent = histFilter === 'all'
    ? t('hist.count', { n: shown.length })
    : t('hist.countFiltered', { a: shown.length, b: evs.length });
  el.innerHTML = shown.slice(0, 120).map(e => {
    const cls = e.type === 'war' ? 'war' : e.type === 'good' ? 'good' : e.type === 'bad' ? 'bad'
      : e.type === 'build' ? 'build' : e.type === 'trade' ? 'trade' : '';
    return `<div class="hev ${cls}"><span class="y">${escapeHtml(t('hist.year', { y: e.year }))}</span><span class="t">${escapeHtml(evText(e))}</span></div>`;
  }).join('') || `<div class="hev"><span class="t dim-note">${t('hist.empty')}</span></div>`;
}
document.querySelectorAll('#histFilters button').forEach(b => {
  b.addEventListener('click', () => {
    histFilter = b.dataset.f;
    document.querySelectorAll('#histFilters button').forEach(x => x.classList.toggle('active', x === b));
    refreshHistory();
  });
});

$('btnHistory').addEventListener('click', () => { refreshHistory(); $('historyPanel').classList.toggle('hidden'); });
$('histClose').addEventListener('click', () => $('historyPanel').classList.add('hidden'));
$('btnHelp').addEventListener('click', () => $('helpPanel').classList.toggle('hidden'));
$('helpClose').addEventListener('click', () => $('helpPanel').classList.add('hidden'));
$('infoClose').addEventListener('click', deselect);

// ---------- 全屏宏观地图 ----------
let bigMapOpen = false;
let bigMapTimer = null;

function toggleBigMap(force) {
  const open = force !== undefined ? force : !bigMapOpen;
  if (open === bigMapOpen) return;
  bigMapOpen = open;
  $('bigMap').classList.toggle('hidden', !open);
  if (open) {
    // 首次打开：高清采样（1024²，后台进行，先以 512 渲染）
    if (!minimap._terrainBig) {
      $('bmSampling').classList.remove('hidden');
      minimap.ensureBigTerrain().then(() => $('bmSampling').classList.add('hidden'));
    }
    const cv = $('bigMapCanvas');
    const rect = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(rect.width * dpr);
    cv.height = Math.round(rect.height * dpr);
    bigMapTimer = setInterval(() => {
      if (!sim) return;
      const cv2 = $('bigMapCanvas');
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      // 硬上限防反馈循环（clientWidth 异常时画布会指数膨胀直至 GPU 崩溃）
      const w = Math.min(1600, Math.max(300, Math.round((cv2.clientWidth || 800) * dpr)));
      if (cv2.width !== w && w <= 1600) { cv2.width = w; cv2.height = w; }
      $('bmDate').textContent = `${sim.clock.dateLabel()} · ${t(`weather.${sim.weather.stateAt(scene3d.cam.target.x, scene3d.cam.target.z, sim.clock.day)}`)}`;
      minimap.renderBig(cv2, sim, scene3d.cam.target.x, scene3d.cam.target.z);
    }, 400);
  } else if (bigMapTimer) {
    clearInterval(bigMapTimer);
    bigMapTimer = null;
  }
}
$('bmClose').addEventListener('click', () => toggleBigMap(false));
// E4：小地图 地形/政治 模式切换（阻止冒泡，避免触发 mapWrap 的展开大图）
function syncMapModeUi() {
  const btn = $('btnMapMode');
  const political = minimap.political;
  btn.classList.toggle('active', political);
  btn.title = t(political ? 'map.modePolitical' : 'map.modeTerrain');
  btn.textContent = t('map.politicalBtn');
  const hint = document.querySelector('.map-hint');
  if (hint) hint.textContent = t(political ? 'map.hintPolitical' : 'map.hint');
}
$('btnMapMode').addEventListener('click', (e) => {
  e.stopPropagation();
  minimap.toggleMode();
  syncMapModeUi();
  minimap.render(scene3d.cam.target.x, scene3d.cam.target.z, sim.settlements, sim.nations, sim.nations.wars, 0);
});
$('bigMapCanvas').addEventListener('click', (e) => {
  const rect = e.target.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  const wx = (fx - 0.5) * 10000, wz = (fy - 0.5) * 10000;
  scene3d.flyTo(wx, wz, Math.min(scene3d.camGoal.dist, 130));
  deselect();
});
$('btnMap').addEventListener('click', () => toggleBigMap());
$('mapWrap').addEventListener('click', (e) => {
  // 点小地图标题区域展开大图（画布本身已有跳转逻辑）
  if (e.target.tagName !== 'CANVAS') toggleBigMap();
});

// ---------- 时间控制 ----------
// 日照锁定：加速时太阳停驻（默认开，避免昼夜疯狂闪烁）
let sunLock = localStorage.getItem('tc-sunlock') !== '0';
let lockedHour = 10;

function isSunLocked() { return sunLock && sim && (sim.clock.speed > 4 || sim.jumping); }

function chooseSunHour() {
  const h = sim.clock.hour;
  lockedHour = (h >= 6.5 && h <= 18.5) ? h : 10;   // 夜间加速则停在上午
}

function setSpeed(v) {
  if (!sim) return;
  const wasLocked = isSunLocked();
  sim.clock.paused = false;
  sim.clock.speed = v;
  if (sunLock) {
    if (v > 4 && !wasLocked) chooseSunHour();
    if (v <= 4 && wasLocked) sim.clock.min = lockedHour * 60;  // 解锁时衔接真实时刻
  }
}

$('btnPause').addEventListener('click', () => { if (sim) sim.clock.paused = !sim.clock.paused; });
document.querySelectorAll('.spd').forEach(b => {
  b.addEventListener('click', () => setSpeed(parseInt(b.dataset.spd)));
});

// 日照锁定开关
const btnSun = $('btnSun');
btnSun.classList.toggle('active', sunLock);
btnSun.addEventListener('click', () => {
  sunLock = !sunLock;
  localStorage.setItem('tc-sunlock', sunLock ? '1' : '0');
  btnSun.classList.toggle('active', sunLock);
  if (!sunLock && sim) sim.clock.min = lockedHour * 60;        // 解锁 → 衔接
  else if (sunLock && sim && sim.clock.speed > 4) chooseSunHour();
  toast(t(sunLock ? 'toast.sunlock' : 'toast.sunfree'));
});

// 时间跳跃
let jumping = false;
document.querySelectorAll('.jump').forEach(b => {
  b.addEventListener('click', async () => {
    if (!sim || jumping) return;
    const years = parseInt(b.dataset.jump);
    if (sunLock && sim.clock.speed > 4) { /* 已锁定则保持 */ }
    jumping = true;
    document.querySelectorAll('.jump').forEach(x => { x.disabled = true; x.classList.add('busy'); });
    toast(t('toast.evolve', { n: years }), 60000);
    const t0 = performance.now();
    let lastY = -1;
    await sim.jumpYears(years, (year, frac) => {
      if (year !== lastY) {
        lastY = year;
        $('toast').textContent = t('toast.evolveProgress', { n: years, y: year, p: Math.round(frac * 100) });
        $('toast').classList.remove('hidden');
      }
    });
    jumping = false;
    document.querySelectorAll('.jump').forEach(x => { x.disabled = false; x.classList.remove('busy'); });
    toast(t('toast.evolved', { date: sim.clock.dateLabel(), s: ((performance.now() - t0) / 1000).toFixed(1) }));
    refreshHistory();
    refreshSettleList();
  });
});
window.addEventListener('keydown', (e) => {
  if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.code === 'Escape') {
    if (bigMapOpen) toggleBigMap(false);
    for (const id of ['helpPanel', 'historyPanel', 'savePanel']) $(id).classList.add('hidden');
    return;
  }
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  if ((e.code === 'Space' || e.code === 'Enter') && e.target.closest('button, summary')) return;
  if (e.code === 'F3') { e.preventDefault(); $('perfPanel').classList.toggle('is-visible'); layoutPanels(); }
  if (e.code === 'Space' && sim) {
    e.preventDefault();
    sim.clock.paused = !sim.clock.paused;
  }
  if (e.code === 'KeyM') toggleBigMap();
});

// ---------- 上帝工具 ----------
document.querySelectorAll('.tool').forEach(btn => {
  btn.addEventListener('click', () => {
    const sub = btn.nextElementSibling;
    document.querySelectorAll('.tp-sub').forEach(s => { if (s !== sub) s.classList.remove('open'); });
    sub.classList.toggle('open');
  });
});
document.querySelectorAll('.tp-sub button').forEach(btn => {
  btn.addEventListener('click', () => {
    if (!sim) return;
    const act = btn.dataset.act;
    const tx = scene3d.cam.target.x, tz = scene3d.cam.target.z;
    switch (act) {
      case 'w-clear': sim.godWeather('clear', 3); toast(t('toast.clear')); break;
      case 'w-rain': sim.godWeather('rain', 2); toast(t('toast.rain')); break;
      case 'w-storm': sim.godWeather('storm', 1); toast(t('toast.storm')); break;
      case 'w-snow': sim.godWeather('snow', 2); toast(t('toast.snow')); break;
      case 'w-fog': sim.godWeather('fog', 1); toast(t('toast.fog')); break;
      case 'd-drought': toast(sim.godDisaster('drought', tx, tz) ? t('toast.drought') : t('toast.noTarget')); break;
      case 'd-flood': toast(sim.godDisaster('flood', tx, tz) ? t('toast.flood') : t('toast.noTargetShort')); break;
      case 'd-fire': toast(sim.godDisaster('fire', tx, tz) ? t('toast.fire') : t('toast.noTargetShort')); break;
      case 'd-blizzard': toast(sim.godDisaster('blizzard', tx, tz) ? t('toast.blizzard') : t('toast.noTargetShort')); break;
      case 'd-plague': toast(sim.godDisaster('plague', tx, tz) ? t('toast.plague') : t('toast.noTargetShort')); break;
      case 'b-settle': {
        const r = sim.godFoundSettlement(Math.round(tx), Math.round(tz));
        toast(r.msg);
        refreshSettleList();
        break;
      }
      case 'b-forest': { const r = sim.godPlantForest(tx, tz); toast(r.msg); break; }
      case 'b-food': { const r = sim.godBlessFood(tx, tz); toast(r.msg); break; }
      case 'b-rain-fert': { const r = sim.godFertile(); toast(r.msg); break; }
    }
    refreshHistory();
  });
});

$('btnRename').addEventListener('click', () => {
  if (confirm(t('confirm.reroll'))) {
    location.href = `${location.pathname}?seed=${(Math.random() * 1e9) | 0}`;
  }
});

// ---------- 存档（E1：多槽位存档管理） ----------
function slotLabel(slot) {
  if (slot === 'autosave') return t('slot.autosave');
  const i = MANUAL_SLOTS.indexOf(slot);
  return i >= 0 ? t('slot.named', { n: i + 1 }) : slot;
}

async function doSave(slot) {
  if (!sim) return;
  const data = {
    v: 3,
    seed: seedStr,
    sim: sim.serialize(),
    journal: serializeJournal(cm.journal),
    cam: {
      x: scene3d.cam.target.x, y: scene3d.cam.target.y, z: scene3d.cam.target.z,
      dist: scene3d.cam.dist, yaw: scene3d.cam.yaw, pitch: scene3d.cam.pitch,
    },
    savedAt: Date.now(),
  };
  await saveWorld(slot, data);
  if (slot !== 'autosave') toast(t('slot.saved', { slot: slotLabel(slot) }));
}

function mkSlotBtn(label, onClick) {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

// 从槽位读取：整页跳转到 ?seed=<seed>&load=<slot>，启动流程会从该槽位恢复
function loadFromSlot(slot, rec) {
  const go = () => {
    location.href = `${location.pathname}?seed=${encodeURIComponent(rec.seed)}&load=${encodeURIComponent(slot)}`;
  };
  if (rec.seed === seedStr) go();
  else if (confirm(t('slot.otherWorld', { name: worldName(rec.seed), seed: rec.seed }))) go();
}

async function renderSavePanel() {
  const body = $('saveBody');
  body.textContent = t('slot.loading');
  let rows;
  try { rows = await listWorlds(); } catch (e) { body.textContent = t('slot.listFailed') + e.message; return; }
  const bySlot = new Map(rows.map(r => [r.slot, r]));
  body.innerHTML = '';
  for (const slot of ['autosave', ...MANUAL_SLOTS]) {
    const rec = bySlot.get(slot);
    const has = !!(rec && rec.seed !== null && rec.seed !== undefined);
    const row = document.createElement('div');
    row.className = 'save-slot' + (has ? '' : ' empty');
    const info = document.createElement('div');
    info.className = 'si';
    if (has) {
      const d = rec.savedAt ? new Date(rec.savedAt) : null;
      info.innerHTML = `<b>${slotLabel(slot)}${slot === 'autosave' ? t('slot.every3') : ''}</b>`
        + `<span>${worldName(String(rec.seed))} · Seed ${escapeHtml(rec.seed)}</span>`
        + `<span>${d ? d.toLocaleString() : ''}</span>`;
    } else {
      info.innerHTML = `<b>${slotLabel(slot)}</b><span>${t('slot.empty')}</span>`;
    }
    row.appendChild(info);
    if (slot !== 'autosave') {
      row.appendChild(mkSlotBtn(t('btn.save'), () => { doSave(slot).then(renderSavePanel).catch(e => toast(t('slot.saveFailed') + e.message)); }));
    }
    if (has) {
      row.appendChild(mkSlotBtn(t('btn.load'), () => loadFromSlot(slot, rec)));
      // E5：文件备份 —— 导出为 .json（可跨浏览器迁移 / 分享世界）
      row.appendChild(mkSlotBtn(t('btn.export'), () => { doExport(slot).catch(e => toast(t('slot.exportFailed') + e.message)); }));
      // E5：删除槽位（自动存档保留作为安全网，不提供删除）
      if (slot !== 'autosave') {
        row.appendChild(mkSlotBtn(t('btn.delete'), () => {
          if (!confirm(t('slot.deleteConfirm', { slot: slotLabel(slot) }))) return;
          deleteWorld(slot)
            .then(() => { toast(t('slot.deleted', { slot: slotLabel(slot) })); return renderSavePanel(); })
            .catch(e => toast(t('slot.deleteFailed') + e.message));
        }));
      }
    }
    body.appendChild(row);
  }
  // E5：从 .json 文件导入存档（优先落入第一个空槽位）
  const importRow = document.createElement('div');
  importRow.className = 'save-slot empty';
  const hint = document.createElement('div');
  hint.className = 'si';
  hint.innerHTML = `<b>${t('slot.importTitle')}</b><span>${t('slot.importHint')}</span>`;
  importRow.appendChild(hint);
  importRow.appendChild(mkSlotBtn(t('slot.importBtn'), importSaveFile));
  body.appendChild(importRow);
}

// E5：把槽位内容下载为 .json 文件
async function doExport(slot) {
  const data = await loadWorld(slot);
  if (!data) { toast(t('slot.isEmpty')); return; }
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const d = data.savedAt ? new Date(data.savedAt) : new Date();
  const ts = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  a.href = url;
  a.download = `tiny-civ-${slot}-${data.seed ?? 'unknown'}-${ts}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  toast(t('slot.exported', { slot: slotLabel(slot), file: a.download }));
}

// E5：导入 .json 存档文件，校验后写入第一个空槽位（全满时询问覆盖存档槽 1）
function importSaveFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.onchange = async () => {
    const file = input.files && input.files[0];
    if (!file) return;
    let data;
    try { data = JSON.parse(await file.text()); }
    catch (e) { toast(t('slot.importBadJson')); return; }
    if (!data || typeof data !== 'object' || !data.sim || typeof data.sim !== 'object' || typeof data.seed !== 'string' || !data.seed.length || data.seed.length > 512) {
      toast(t('slot.importNoData')); return;
    }
    if (!Number.isInteger(data.v) || data.v < 2 || data.v > 3) {
      toast(t('slot.importTooOld')); return;
    }
    let target = null;
    try {
      const rows = await listWorlds();
      const bySlot = new Map(rows.map(r => [r.slot, r]));
      target = MANUAL_SLOTS.find(s => {
        const r = bySlot.get(s);
        return !r || r.seed === null || r.seed === undefined;
      }) || null;
    } catch (e) { /* 列表读取失败则走覆盖确认 */ }
    if (!target && !confirm(t('slot.slotsFull'))) return;
    if (!target) target = MANUAL_SLOTS[0];
    try {
      await saveWorld(target, data);
      toast(t('slot.imported', { slot: slotLabel(target), name: worldName(data.seed), seed: data.seed }));
      renderSavePanel();
    } catch (e) { toast(t('slot.importFailed') + e.message); }
  };
  input.click();
}

function toggleSavePanel(force) {
  const panel = $('savePanel');
  const open = force !== undefined ? force : panel.classList.contains('hidden');
  panel.classList.toggle('hidden', !open);
  if (open) renderSavePanel();
}
$('btnSave').addEventListener('click', () => toggleSavePanel());
$('saveClose').addEventListener('click', () => toggleSavePanel(false));

// ---------- 启动 ----------
boot().catch((e) => {
  console.error(e);
  setProgress(t('boot.failed') + e.message, 1);
});

// 调试句柄
window.__app = {
  get sim() { return sim; },
  get cm() { return cm; },
  scene3d, characters,
  selectSettle, seedStr,
};
