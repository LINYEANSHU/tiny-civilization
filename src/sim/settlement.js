// ============================================================
// settlement.js — 聚落：选址 / 规划 / 经济 / 建造 / 兴衰
// 聚落状态是唯一事实源；近处由村民 Agent 执行劳动，远处抽象推演。
// ============================================================
import { SEA } from '../core/config.js';
import { WSTATE } from './weather.js';
import { BIOME } from '../world/terrain.js';
import { addClaim } from '../world/claims.js';
import { EditWriter, stampHouse, stampFarm, stampWell, stampStorage, stampLumberCamp, stampQuarry, stampMarket, stampTownHall, stampWatchtower, stampWall, stampGate, stampRoad, stampLamp, stampTree, stampDock, stampMonument, stampWindmill, stampGranary, cultureForBiome } from '../world/buildings.js';
import { B } from '../world/blocks.js';

// 发展度名称已迁入 i18n 字典（dev.0~dev.3，见 src/i18n.js）

const BUILD_DEFS = {
  house:     { label: '住宅', wood: 30, stone: 8, work: 55 },
  farm:      { label: '农田', wood: 12, stone: 0, work: 26 },
  storage:   { label: '仓库', wood: 45, stone: 15, work: 70 },
  lumber:    { label: '伐木场', wood: 20, stone: 0, work: 36 },
  quarry:    { label: '采石场', wood: 10, stone: 0, work: 46 },
  market:    { label: '市场', wood: 35, stone: 10, work: 64 },
  townhall:  { label: '市政厅', wood: 60, stone: 60, work: 150 },
  watchtower:{ label: '哨塔', wood: 0, stone: 40, work: 90 },
  walls:     { label: '城墙', wood: 0, stone: 70, work: 130 },
  dock:      { label: '渔码头', wood: 25, stone: 0, work: 50 },
  monument:  { label: '纪念碑', wood: 0, stone: 60, work: 110 },
  windmill:  { label: '风车', wood: 40, stone: 25, work: 90 },
  granary:   { label: '谷仓', wood: 30, stone: 10, work: 60 },
};

export class Settlement {
  constructor() {
    this.id = 0;
    this.name = '';
    this.x = 0; this.z = 0; this.g = 20;
    this.cultureKey = 'wood';
    this.pop = 6;
    this.food = 60;
    this.wood = 80;
    this.stone = 30;
    this.wealth = 10;
    this.morale = 62;
    this.foundedDay = 1;
    this.nationId = -1;
    this.devLevel = 0;
    this.peakPop = 6;

    // 建筑
    this.well = null;          // {x,z}
    this.storage = null;
    this.market = null;
    this.townhall = null;
    this.lumber = null;
    this.quarry = null;
    this.windmill = null;      // {x,z}（精进阶段 E3：农田生长 +15%）
    this.granary = null;       // {x,z}（精进阶段 E6：食物消耗 -12%）
    this.watchtowers = [];     // [{x,z}]
    this.houses = [];          // [{x,z,door}]
    this.farms = [];           // [{x0,z0,g,wd,dp,cells,growth,ripe,destroyed}]
    this.wallsBuilt = 0;

    // 规划
    this.pads = [];            // 剩余宅基地 [{x,z,g}]
    this.grove = null;         // {x,z,stock}
    this.quarryPlan = null;    // {x,z}

    this.buildQueue = [];      // {type,x0,z0,g,progress,need}
    this.effects = [];         // 灾害/增益效果 [{kind, untilDay, data}]
    this.starveDays = 0;
    this.tradePartners = new Map(); // settleId -> volume
    this.lastCaravanDay = -99;
  }

  get culture() { return cultureForBiome(this.biome ?? 2); }
  get houseCap() { return this.houses.length * 5 + 2; }
  get isStarving() { return this.food <= 0.01; }

  // ============ 创建 ============
  static found(id, name, x, z, terrain, day) {
    const s = new Settlement();
    s.id = id;
    s.name = name;
    s.x = x; s.z = z;
    const info = terrain.sample(x, z);
    s.g = info.h;
    s.biome = info.biome;
    s.cultureKey = cultureForBiome(info.biome).key;
    s.foundedDay = day;
    s.plan(terrain);
    s.registerClaims();
    return s;
  }

  // 登记领地：范围内不长树（读档时也调用）
  registerClaims() {
    addClaim(this.x, this.z, 32);
    for (const f of (this.farmSites || [])) addClaim(f.x, f.z, 9);
    if (this.quarryPlan) addClaim(this.quarryPlan.x, this.quarryPlan.z, 9);
    if (this.grove) addClaim(this.grove.x, this.grove.z, 6);  // 伐木场空地
  }

  // 选址扫描：宅基地 / 农田 / 林场 / 采石场
  plan(terrain) {
    const { x, z, g } = this;
    // 宅基地：环形螺旋搜平地
    const pads = [];
    for (let ring = 7; ring <= 30 && pads.length < 16; ring += 3) {
      const steps = Math.max(8, (ring * 6) | 0);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + ring;
        const px = Math.round(x + Math.cos(a) * ring);
        const pz = Math.round(z + Math.sin(a) * ring);
        if (pads.some(p => Math.abs(p.x - px) < 7 && Math.abs(p.z - pz) < 7)) continue;
        const h = terrain.sample(px, pz);
        // 修复（精进阶段 F1 调用点补全）：h 是共享 _scratch，邻居采样会覆写它——
        // 旧代码 hh.h - h.h 恒为 0，平坦度检测从未生效。先拷贝本列高度。
        const h0 = h.h, riv0 = h.riv;
        if (h0 <= SEA + 1 || riv0 > 0.4) continue;
        let ok = true;
        for (const [dx, dz] of [[-3, -3], [3, -3], [-3, 3], [3, 3], [0, 0]]) {
          const hh = terrain.sample(px + dx, pz + dz);
          if (Math.abs(hh.h - h0) > 2 || hh.h <= SEA) { ok = false; break; }
        }
        if (ok) pads.push({ x: px, z: pz, g: h0 });
      }
    }
    pads.sort((a, b) => (Math.abs(a.x - x) + Math.abs(a.z - z)) - (Math.abs(b.x - x) + Math.abs(b.z - z)));
    this.pads = pads;

    // 农田：近水平地，优先靠水
    const farms = [];
    for (let ring = 9; ring <= 34 && farms.length < 7; ring += 3) {
      const steps = Math.max(8, (ring * 6) | 0);
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2 + ring * 0.7;
        const px = Math.round(x + Math.cos(a) * ring);
        const pz = Math.round(z + Math.sin(a) * ring);
        if (farms.some(p => Math.abs(p.x - px) < 9 && Math.abs(p.z - pz) < 9)) continue;
        if (pads.some(p => Math.abs(p.x - px) < 6 && Math.abs(p.z - pz) < 6)) continue;
        const h = terrain.sample(px, pz);
        // 修复（精进阶段 F1 调用点补全）：同上，先拷贝本列高度/河流值，
        // 旧代码平坦度恒通过、记录的 g 是最后一个邻列的高度。
        const h0 = h.h, riv0 = h.riv;
        if (h0 < SEA + 1 || h0 > SEA + 9) continue;
        let flat = true, water = riv0 > 0.2;
        for (const [dx, dz] of [[-4, -2], [4, 2], [-4, 2], [4, -2]]) {
          const hh = terrain.sample(px + dx, pz + dz);
          if (Math.abs(hh.h - h0) > 1 || hh.h <= SEA) { flat = false; break; }
          if (hh.riv > 0.2) water = true;
        }
        if (!flat) continue;
        farms.push({ x: px, z: pz, g: h0, water });
      }
    }
    farms.sort((a, b) => (b.water ? 1 : 0) - (a.water ? 1 : 0));
    this.farmSites = farms;

    // 林场：森林密度最高处
    let best = null, bd = -1;
    for (let ring = 18; ring <= 52; ring += 6) {
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + ring;
        const px = Math.round(x + Math.cos(a) * ring);
        const pz = Math.round(z + Math.sin(a) * ring);
        const info = terrain.sample(px, pz);
        if (info.h <= SEA + 1) continue;
        const d = terrain.forestDensity(px, pz) + (info.biome === BIOME.FOREST ? 0.3 : 0);
        if (d > bd) { bd = d; best = { x: px, z: pz, stock: 1 }; }
      }
    }
    this.grove = best;

    // 采石场：山地/陡坡
    let qb = null, qs = -1;
    for (let ring = 16; ring <= 60; ring += 7) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + ring * 1.3;
        const px = Math.round(x + Math.cos(a) * ring);
        const pz = Math.round(z + Math.sin(a) * ring);
        // 修复（精进阶段 F1 调用点补全）：sample() 恒返回 slope=0，坡度项从未生效；
        // 改用 sampleSloped() 取真实坡度（选址只在建城时跑一次，开销可忽略）
        const info = terrain.sampleSloped(px, pz);
        if (info.h <= SEA + 1) continue;
        const sc = (info.biome === BIOME.MOUNTAIN ? 1 : 0) + info.slope * 0.2 - ring * 0.004;
        if (sc > qs) { qs = sc; qb = { x: px, z: pz }; }
      }
    }
    this.quarryPlan = qb;

    // 海岸探测：逐格直扫最近的临水陆地（渔码头选址）
    this.coast = null;
    let cBest = 1e9;
    for (let dx = -16; dx <= 16; dx++) {
      for (let dz = -16; dz <= 16; dz++) {
        const px = x + dx, pz = z + dz;
        const info = terrain.sample(px, pz);
        // 修复（精进阶段 F1 调用点补全）：邻列采样会覆写共享 scratch，
        // 旧代码记录的 g 是水下列的高度（info.h 与 n.h 同源）。先拷贝本列高度。
        const gh = info.h;
        if (gh < SEA || gh > SEA + 8) continue;   // 含滩涂（h=SEA）
        for (const [ox, oz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = terrain.sample(px + ox, pz + oz);
          if (n.h < SEA) {
            const d = dx * dx + dz * dz;
            if (d < cBest) { cBest = d; this.coast = { x: px, z: pz, dx: ox, dz: oz, g: gh }; }
            break;
          }
        }
      }
    }
  }

  // 初始建筑（成立时直接盖章，写入编辑日志）
  found_buildings(world) {
    // world: {edits(list), applyBlockEdits, applyPlantEdits, terrain}
    const w = new EditWriter();
    const cul = this.culture;
    stampWell(w, this.x, this.z, this.g);
    this.well = { x: this.x, z: this.z };
    // 广场
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > 4) continue;
      if (Math.abs(dx) <= 1 && Math.abs(dz) <= 1) continue;
      w.set(this.x + dx, this.g, this.z + dz, B.PATH);
    }
    // 仓库（南侧）
    const st = this.takeNearestPad(this.x, this.z + 6);
    if (st) {
      stampStorage(w, st.x - 3, st.z - 2, st.g, cul, 6, 5, 0);
      this.storage = { x: st.x, z: st.z };
      this.buildRoad(w, [st.x, st.z], this.x, this.z + 3, world.terrain);
    }
    // 两座住宅
    for (let i = 0; i < 2; i++) {
      const p = this.takeNearestPad(this.x, this.z);
      if (!p) break;
      const r = stampHouse(w, p.x - 2, p.z - 2, p.g, cul, 5, 5, 0, { chimney: this.cultureKey === 'stone' });
      this.houses.push({ x: p.x, z: p.z, door: r.door, g: p.g });
      this.buildRoad(w, r.door, this.x, this.z, world.terrain);
    }
    // 一片农田
    const f = this.farmSites && this.farmSites.shift();
    if (f) {
      stampFarm(w, f.x - 3, f.z - 2, f.g, 7, 5);
      this.farms.push({ x0: f.x - 3, z0: f.z - 2, g: f.g, wd: 7, dp: 5, cells: 25, growth: 0, ripe: false, destroyed: false });
      this.buildRoad(w, [f.x, f.z], this.x, this.z, world.terrain);
    }
    // 路灯
    for (const [dx, dz] of [[4, 0], [-4, 0], [0, 4], [0, -4]]) {
      const lx = this.x + dx, lz = this.z + dz;
      const h = world.terrain.sample(lx, lz);
      if (h.h > SEA && h.riv < 0.4) stampLamp(w, lx, lz, h.h);
    }
    world.applyBlockEdits(w.edits);
    world.applyPlantEdits(w.plants, { journal: true });
  }

  takeNearestPad(tx, tz) {
    if (!this.pads.length) return null;
    let bi = 0, bd = 1e9;
    for (let i = 0; i < this.pads.length; i++) {
      const d = Math.abs(this.pads[i].x - tx) + Math.abs(this.pads[i].z - tz);
      if (d < bd) { bd = d; bi = i; }
    }
    return this.pads.splice(bi, 1)[0];
  }

  buildRoad(w, from, tx, tz, terrain) {
    const cells = [];
    let { x, z } = from;
    let guard = 0;
    while ((Math.abs(x - tx) > 1 || Math.abs(z - tz) > 1) && guard++ < 80) {
      cells.push([x, z]);
      const dx = Math.sign(tx - x), dz = Math.sign(tz - z);
      if (dx !== 0 && dz !== 0) { if ((x + z) % 2 === 0) x += dx; else z += dz; }
      else if (dx !== 0) x += dx;
      else z += dz;
    }
    stampRoad(w, cells, (px, pz) => {
      const h = terrain.sample(px, pz);
      return Math.max(h.h, SEA);
    });
  }

  // ============ 建造队列 ============
  enqueue(type, world) {
    const def = BUILD_DEFS[type];
    if (!def) return false;
    if (this.wood < def.wood || this.stone < def.stone) return false;
    if (this.buildQueue.some(q => q.type === type)) return false;
    if (type === 'house' && !this.pads.length) return false;
    if (type === 'farm' && (!this.farmSites || !this.farmSites.length)) return false;

    let x0, z0, g, extra = {};
    if (type === 'house') {
      const p = this.takeNearestPad(this.x, this.z);
      x0 = p.x - 2; z0 = p.z - 2; g = p.g; extra.pad = p;
    } else if (type === 'farm') {
      const f = this.farmSites.shift();
      x0 = f.x - 3; z0 = f.z - 2; g = f.g;
    } else if (type === 'storage') {
      const p = this.takeNearestPad(this.x, this.z);
      if (!p) return false;
      x0 = p.x - 3; z0 = p.z - 2; g = p.g; extra.pad = p;
    } else if (type === 'lumber') {
      if (!this.grove) return false;
      x0 = this.grove.x - 2; z0 = this.grove.z - 2; g = world.terrain.sample(this.grove.x, this.grove.z).h;
    } else if (type === 'quarry') {
      if (!this.quarryPlan) return false;
      x0 = this.quarryPlan.x - 2; z0 = this.quarryPlan.z - 2; g = world.terrain.sample(this.quarryPlan.x, this.quarryPlan.z).h;
    } else if (type === 'market') {
      const p = this.takeNearestPad(this.x, this.z + 4);
      if (!p) return false;
      x0 = p.x - 4; z0 = p.z - 1; g = p.g;
    } else if (type === 'townhall') {
      const p = this.takeNearestPad(this.x, this.z - 8);
      if (!p) return false;
      x0 = p.x - 3; z0 = p.z - 3; g = p.g;
    } else if (type === 'watchtower') {
      const p = this.takeNearestPad(this.x + 14, this.z + 10);
      if (!p) return false;
      x0 = p.x - 1; z0 = p.z - 1; g = p.g;
    } else if (type === 'walls') {
      x0 = this.x; z0 = this.z; g = this.g;
    } else if (type === 'dock') {
      if (!this.coast) return false;
      x0 = this.coast.x; z0 = this.coast.z; g = this.coast.g;
    } else if (type === 'monument') {
      const p = this.takeNearestPad(this.x + 6, this.z - 6);
      if (!p) return false;
      x0 = p.x - 1; z0 = p.z - 1; g = p.g;
    } else if (type === 'windmill') {
      const p = this.takeNearestPad(this.x + 9, this.z + 9);
      if (!p) return false;
      x0 = p.x - 1; z0 = p.z - 1; g = p.g;
    } else if (type === 'granary') {
      const p = this.takeNearestPad(this.x - 9, this.z + 9);
      if (!p) return false;
      x0 = p.x - 1; z0 = p.z - 1; g = p.g;
    }
    this.wood -= def.wood;
    this.stone -= def.stone;
    this.buildQueue.push({ type, x0, z0, g, progress: 0, need: def.work, ...extra });
    return true;
  }

  // 完成建造 → 盖章入世界
  completeBuild(q, world, history) {
    const w = new EditWriter();
    const cul = this.culture;
    switch (q.type) {
      case 'house': {
        const r = stampHouse(w, q.x0, q.z0, q.g, cul, 5, 5, 0, { chimney: this.cultureKey === 'stone' });
        this.houses.push({ x: q.x0 + 2, z: q.z0 + 2, door: r.door, g: q.g });
        this.buildRoad(w, r.door, this.well.x, this.well.z, world.terrain);
        break;
      }
      case 'farm': {
        stampFarm(w, q.x0, q.z0, q.g, 7, 5);
        this.farms.push({ x0: q.x0, z0: q.z0, g: q.g, wd: 7, dp: 5, cells: 25, growth: 0, ripe: false, destroyed: false });
        this.buildRoad(w, [q.x0 + 3, q.z0 + 2], this.well.x, this.well.z, world.terrain);
        break;
      }
      case 'storage':
        stampStorage(w, q.x0, q.z0, q.g, cul, 6, 5, 0);
        this.storage = { x: q.x0 + 3, z: q.z0 + 2 };
        break;
      case 'lumber':
        stampLumberCamp(w, q.x0, q.z0, q.g, cul);
        this.lumber = { x: q.x0 + 2, z: q.z0 + 1 };
        break;
      case 'quarry':
        stampQuarry(w, q.x0, q.z0, q.g);
        this.quarry = { x: q.x0 + 2, z: q.z0 + 2 };
        break;
      case 'market':
        stampMarket(w, q.x0, q.z0, q.g, cul);
        this.market = { x: q.x0 + 4, z: q.z0 + 1 };
        break;
      case 'townhall':
        stampTownHall(w, q.x0, q.z0, q.g, cul, 0);
        this.townhall = { x: q.x0 + 3, z: q.z0 + 3 };
        break;
      case 'watchtower':
        stampWatchtower(w, q.x0, q.z0, q.g);
        this.watchtowers.push({ x: q.x0 + 1, z: q.z0 + 1 });
        break;
      case 'dock':
        stampDock(w, q.x0, q.z0, q.g, this.coast.dx, this.coast.dz);
        this.dock = { x: q.x0 + this.coast.dx * 4, z: q.z0 + this.coast.dz * 4 };
        break;
      case 'monument':
        stampMonument(w, q.x0, q.z0, q.g);
        this.monument = { x: q.x0 + 1, z: q.z0 + 1 };
        break;
      case 'windmill':
        stampWindmill(w, q.x0, q.z0, q.g);
        this.windmill = { x: q.x0 + 1, z: q.z0 + 1 };
        break;
      case 'granary':
        stampGranary(w, q.x0, q.z0, q.g);
        this.granary = { x: q.x0 + 1, z: q.z0 + 1 };
        break;
      case 'walls': {
        const cells = [];
        const R = 17;
        for (let dx = -R; dx <= R; dx++) {
          cells.push([this.x + dx, this.z - R]);
          cells.push([this.x + dx, this.z + R]);
        }
        for (let dz = -R + 1; dz < R; dz++) {
          cells.push([this.x - R, this.z + dz]);
          cells.push([this.x + R, this.z + dz]);
        }
        const land = cells.filter(([x, z]) => {
          const h = world.terrain.sample(x, z);
          return h.h > SEA + 1 && h.riv < 0.5 && Math.abs(h.h - this.g) < 14;
        });
        stampWall(w, land, (x, z) => world.terrain.sample(x, z).h);
        // 四门
        for (const [gx, gz, ax] of [[this.x, this.z - R, 'x'], [this.x, this.z + R, 'x'], [this.x - R, this.z, 'z'], [this.x + R, this.z, 'z']]) {
          const h = world.terrain.sample(gx, gz);
          if (h.h > SEA) stampGate(w, gx, gz, Math.max(h.h, SEA), ax);
        }
        this.wallsBuilt = land.length;
        break;
      }
    }
    world.applyBlockEdits(w.edits);
    world.applyPlantEdits(w.plants, { journal: true });
    history.add('build', `ev.build.${q.type}`, { name: this.name });
  }

  // ============ 每小时经济 tick ============
  tickHour(env) {
    const { clock, weather, history, world } = env;
    const season = clock.season;
    const wstate = weather.stateAt(this.x, this.z, clock.day);

    // ---- 农业生长 ----
    const seasonGrow = [1.25, 1.35, 1.0, 0.08][season];
    const drought = this.hasEffect('drought');
    const flood = this.hasEffect('flood');
    const blizzard = this.hasEffect('blizzard');
    let growMult = seasonGrow * (drought ? 0.12 : 1) * (flood ? 0.25 : 1) * (blizzard ? 0.3 : 1);
    // 修复（精进阶段 F2）：wstate 是数字枚举，旧代码与字符串比较恒 false，雨水增速从未生效
    if (wstate === WSTATE.STORM || wstate === WSTATE.RAIN) growMult *= 1.1;
    // 风车（E3）：磨坊提高农业效率
    if (this.windmill) growMult *= 1.15;
    for (const f of this.farms) {
      if (f.destroyed || f.ripe) continue;
      f.growth += growMult;
      if (f.growth >= 40) { f.growth = 40; f.ripe = true; }
    }

    // ---- 远距抽象生产（近处由 Agent 补充实际产出）----
    // 每小时该聚落"无人完成"的基线产出（约为满员效率的 55%）
    const wantWood = this.lumber ? 1 : 0;
    const wantStone = this.quarry ? 1 : 0;
    if (!this.nearCamera || env.jumping) {
      if (this.grove && this.grove.stock > 0.05 && wantWood) {
        const rate = 0.55 * (blizzard ? 0.4 : 1);
        this.wood += rate * (0.5 + this.grove.stock);
        this.grove.stock = Math.max(0, this.grove.stock - 0.004);
      }
      if (wantStone) this.stone += 0.42 * (blizzard ? 0.4 : 1);
      // 远距自动收获
      for (const f of this.farms) {
        if (f.ripe && !f.destroyed) this.harvestFarm(f, 0.9, env);
      }
      // 远距自动施工
      const q = this.buildQueue[0];
      if (q) {
        q.progress += 1.1;
        if (q.progress >= q.need) { this.buildQueue.shift(); this.completeBuild(q, world, history); }
      }
    }

    // 林木再生
    if (this.grove) this.grove.stock = Math.min(1, this.grove.stock + 0.0012);

    // ---- 消耗 ----
    let cons = this.pop * 0.014;
    if (season === 3) cons *= 1.25;
    if (blizzard) cons *= 1.15;
    // 谷仓（E6）：架空防潮储粮，损耗降低
    if (this.granary) cons *= 0.88;
    this.food -= cons;

    // ---- 饥荒 ----
    if (this.isStarving) {
      this.food = 0;
      this.morale -= 0.9;
      this.starveDays++;
      if (Math.random() < 0.035) {
        this.pop = Math.max(1, this.pop - 1);
        if (this.pop <= 1) history.add('bad', 'ev.famineDeath', { name: this.name });
      }
    } else {
      this.starveDays = 0;
      this.morale += 0.12;
    }

    // ---- 人口 ----
    if (this.food > this.pop * 0.5 && this.pop < this.houseCap && this.morale > 35 && !this.hasEffect('plague')) {
      if (Math.random() < 0.018) { this.pop++; }
    }
    this.peakPop = Math.max(this.peakPop, this.pop);

    // ---- 市场与财富 ----
    if (this.market) this.wealth += 0.05 + this.pop * 0.002;

    // ---- 士气回归 ----
    this.morale += (62 - this.morale) * 0.004;
    this.morale = Math.max(5, Math.min(100, this.morale));

    // ---- 发展度 ----
    const dev = this.pop >= 34 && this.townhall && this.wallsBuilt ? 3
      : this.pop >= 22 && this.townhall ? 2
        : this.pop >= 11 ? 1 : 0;
    if (dev > this.devLevel) {
      this.devLevel = dev;
      history.add('good', `ev.devGrow.${dev}`, { name: this.name, n: this.pop });
    }

    // ---- 自动决策 ----
    this.autoDecide(env);
  }

  autoDecide(env) {
    const { world, history, nations } = env;
    const atWar = nations && nations.isAtWar(this.nationId);
    // 食物安全 → 农田
    if (this.food < this.pop * 2.2 && this.farms.length < 7) this.enqueue('farm', world);
    // 住房
    if (this.pop >= this.houseCap - 1 && this.houses.length < 15) this.enqueue('house', world);
    // 木材
    if (this.wood < 45 && !this.lumber && this.grove) this.enqueue('lumber', world);
    // 风车（E3）：农田达到 3 片后修建磨坊，进一步推动农业
    if (this.farms.length >= 3 && !this.windmill) this.enqueue('windmill', world);
    // 谷仓（E6）：人口达到 12 后修建架空谷仓，降低食物消耗
    if (this.pop >= 12 && !this.granary) this.enqueue('granary', world);
    // 石材需求：有大型工程，或石材长期短缺
    const wantStone = this.buildQueue.some(q => BUILD_DEFS[q.type]?.stone > 20);
    if ((wantStone || this.stone < 45) && !this.quarry && this.quarryPlan && this.pop >= 9) {
      this.enqueue('quarry', world);
    }
    // 市场
    if (this.wealth > 70 && !this.market && this.pop >= 10) this.enqueue('market', world);
    // 市政厅
    if (this.pop >= 24 && !this.townhall) this.enqueue('townhall', world);
    // 军事
    if ((this.pop >= 30 || atWar) && !this.wallsBuilt && this.stone > 90) this.enqueue('walls', world);
    if (this.wallsBuilt && this.watchtowers.length < 2 && this.stone > 60) this.enqueue('watchtower', world);
    // 渔业（沿海聚落的食物来源）
    if (this.coast && this.pop >= 8 && !this.dock) this.enqueue('dock', world);
    // 城市奇观
    if (this.devLevel >= 3 && !this.monument) this.enqueue('monument', world);
  }

  harvestFarm(f, eff, env) {
    const yieldFood = f.cells * 0.8 * eff;
    this.food += yieldFood;
    f.ripe = false;
    f.growth = 0;
    return yieldFood;
  }

  hasEffect(kind) {
    return this.effects.some(e => e.kind === kind);
  }
  addEffect(kind, untilDay, data) {
    this.effects.push({ kind, untilDay, data: data || {} });
  }
  updateEffects(clock) {
    this.effects = this.effects.filter(e => e.untilDay > clock.day);
  }

  // 作物视觉同步：chunk 就绪后把当前生长阶段写入（临时编辑，不入日志）
  syncCropsForChunk(cm, cx, cz) {
    const edits = [];
    const x0c = cx * 16, z0c = cz * 16;
    for (const f of this.farms) {
      if (f.destroyed) continue;
      const fx0 = f.x0 + 1, fx1 = f.x0 + f.wd - 2;
      const fz0 = f.z0 + 1, fz1 = f.z0 + f.dp - 2;
      const midZ = f.z0 + (f.dp >> 1);
      if (fx1 < x0c || fx0 > x0c + 15 || fz1 < z0c || fz0 > z0c + 15) continue;
      const pid = f.ripe ? B.WHEAT : B.WHEAT_YOUNG;
      for (let x = fx0; x <= fx1; x++) {
        for (let z = fz0; z <= fz1; z++) {
          if (z === midZ) continue;
          edits.push([x, f.g + 1, z, pid, 0]);
        }
      }
    }
    if (edits.length) cm.applyPlantEdits(edits, { journal: false });
  }

  serialize() {
    return {
      id: this.id, name: this.name, x: this.x, z: this.z, g: this.g,
      cultureKey: this.cultureKey, biome: this.biome,
      pop: this.pop, food: round2(this.food), wood: round2(this.wood),
      stone: round2(this.stone), wealth: round2(this.wealth), morale: Math.round(this.morale),
      foundedDay: this.foundedDay, nationId: this.nationId, devLevel: this.devLevel,
      peakPop: this.peakPop, starveDays: this.starveDays,
      well: this.well, storage: this.storage, market: this.market, townhall: this.townhall,
      lumber: this.lumber, quarry: this.quarry,
      watchtowers: this.watchtowers, houses: this.houses, farms: this.farms,
      wallsBuilt: this.wallsBuilt, coast: this.coast, dock: this.dock,
      monument: this.monument, windmill: this.windmill, granary: this.granary, festival: this.festival || 0,
      pads: this.pads, grove: this.grove, quarryPlan: this.quarryPlan,
      farmSites: this.farmSites || [],
      buildQueue: this.buildQueue,
      effects: this.effects,
      tradePartners: [...this.tradePartners.entries()],
    };
  }

  static deserialize(d) {
    const s = new Settlement();
    Object.assign(s, d);
    s.tradePartners = new Map(d.tradePartners || []);
    s.effects = d.effects || [];
    return s;
  }
}

function round2(v) { return Math.round(v * 100) / 100; }
