// ============================================================
// sim.js — 模拟编排器
// 固定步长推进（1 游戏小时/tick）；分层 LOD：
//   近距：村民 Agent 全模拟；远距：聚落抽象推演。
// ============================================================
import { GameClock } from './time.js';
import { NameGen } from './names.js';
import { Weather, WSTATE } from './weather.js';
import { History } from './history.js';
import { Nations, Nation, NATION_COLORS } from './nations.js';
import { Disasters } from './events.js';
import { AgentManager } from './agents.js';
import { Wildlife } from './wildlife.js';
import { Settlement } from './settlement.js';
import { SEA, SETTLE_NEAR, SETTLE_COUNT, SETTLE_REGION } from '../core/config.js';
import { t } from '../i18n.js';
import { BIOME } from '../world/terrain.js';
import { EditWriter, stampTree } from '../world/buildings.js';
import { hash2 } from '../core/rng.js';

export class Sim {
  constructor(seedStr, cm) {
    this.seedStr = seedStr;
    this.cm = cm;
    this.clock = new GameClock();
    this.names = new NameGen(seedStr);
    this.history = new History();
    this.nations = new Nations();
    this.disasters = new Disasters();
    this.agents = new AgentManager();
    this.wildlife = new Wildlife();
    this.weather = new Weather(seedStr, cm.terrain);
    this.settlements = [];
    this.weatherOverride = null;
    this._lastDay = 1;
    this._settleById = null;   // 惰性 id→聚落 Map（settleById 每帧被大量调用）

    // 世界编辑门面（供聚落/建筑使用）
    this.world = {
      terrain: cm.terrain,
      applyBlockEdits: (edits) => cm.applyBlockEdits(edits),
      applyPlantEdits: (edits, opts) => cm.applyPlantEdits(edits, opts),
    };

    this._ctx = {
      sim: this,
      cm,
      clock: this.clock,
      names: this.names,
      weather: this.weather,
      camX: 0, camZ: 0,
      onMine: null,
    };
  }

  settleById(id) {
    // 惰性 id→聚落索引：聚落集合只在 init/读档/上帝建村时变化（按长度失配重建）。
    // 旧实现是 settlements.find() 线性扫描，agents 每帧每 agent 都会调用。
    let m = this._settleById;
    if (!m || m.size !== this.settlements.length) {
      m = new Map();
      for (const s of this.settlements) m.set(s.id, s);
      this._settleById = m;
    }
    return m.get(id) || null;
  }

  // ============ 初始化：选址建国 ============
  async init(progress) {
    const terrain = this.cm.terrain;
    progress && progress(t('sim.seeking'), 0.35);

    // 内圈聚落（观察区）
    const spots = this.findSpots(terrain, SETTLE_COUNT - 3, SETTLE_REGION, 240, 0);
    // 外圈聚落（地图各处）
    const far = this.findSpots(terrain, 3, 3800, 900, 77);
    spots.push(...far);

    spots.forEach((sp, i) => {
      const s = Settlement.found(i, this.names.settlement(), sp.x, sp.z, terrain, 1);
      // 初始资源随环境
      s.food = 55 + Math.round(sp.water * 25);
      s.wood = 70 + Math.round(Math.random() * 40);
      s.stone = 25 + Math.round(Math.random() * 30);
      this.settlements.push(s);
      s.found_buildings(this.world);
    });

    progress && progress(t('sim.rising'), 0.5);
    this.nations.createFromSettlements(this.settlements, this.names, this.history);
    this.history.now(1, 1);
    this.history.add('good', 'ev.worldAwake', { n: this.settlements.length }, 1, 1);
  }

  // 候选地评分搜索
  findSpots(terrain, n, regionR, minDist, salt) {
    const cands = [];
    const step = Math.max(70, regionR / 14);
    for (let x = -regionR; x <= regionR; x += step) {
      for (let z = -regionR; z <= regionR; z += step) {
        const jx = hash2(x, z, 977 + salt) * step * 0.8;
        const jz = hash2(z, x, 337 + salt) * step * 0.8;
        const px = Math.round(x + jx), pz = Math.round(z + jz);
        const info = terrain.sample(px, pz);
        // 修复（精进阶段 F1 调用点补全）：info 指向共享 _scratch，下方邻居采样会覆写
        // 它——旧代码 slope 恒为 0（邻居与覆写后的自身相减），评分里的本列高度/生物群系
        // 也读到的是最后一个邻列的值。先拷贝本列字段再采样邻居。
        const h0 = info.h, riv0 = info.riv, biome0 = info.biome;
        if (h0 < SEA + 2 || h0 > SEA + 16) continue;
        if (riv0 > 0.45) continue;
        // 平坦度
        let slope = 0;
        for (const [dx, dz] of [[-6, 0], [6, 0], [0, -6], [0, 6], [-4, -4], [4, 4]]) {
          slope += Math.abs(terrain.sample(px + dx, pz + dz).h - h0);
        }
        slope /= 6;
        if (slope > 2.4) continue;
        // 近水奖励
        let water = 0;
        for (const [dx, dz] of [[10, 0], [-10, 0], [0, 10], [0, -10], [16, 10], [-16, -10]]) {
          if (terrain.sample(px + dx, pz + dz).h < SEA) { water = 1; break; }
        }
        const forest = terrain.forestDensity(px, pz);
        const score = -slope * 2.2 - Math.abs(h0 - SEA - 5) * 0.12 + water * 2.4 + forest * 1.2
          + (biome0 === BIOME.DESERT ? -1.2 : 0);
        cands.push({ x: px, z: pz, score, water });
      }
    }
    cands.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const c of cands) {
      if (picked.length >= n) break;
      if (picked.some(p => Math.hypot(p.x - c.x, p.z - c.z) < minDist)) continue;
      picked.push(c);
    }
    return picked;
  }

  // ============ 每帧 ============
  update(realDt, camX, camZ) {
    const t0 = performance.now();
    this._ctx.camX = camX; this._ctx.camZ = camZ;

    const hoursAll = this.clock.advance(realDt);
    // 单帧小时 tick 上限（防止后台长期挂起后的恢复螺旋）
    this._runHours(Math.min(hoursAll, 240), camX, camZ);

    // 聚落实体化 LOD
    this._materializeNear(camX, camZ);

    // Agent 每帧（时间跳跃期间冻结个体行为）
    this._ctx.onMine = this._mineFx;
    if (!this.jumping) {
      this.agents.update(realDt, this._ctx);
      this.wildlife.update(realDt, { sim: this, cm: this.cm, camX, camZ });
    }

    // 军队可见性（每帧同步，处理行军入镜）—— 复用 env 对象，避免每帧分配
    if (!this.jumping) {
      const envA = this._envA || (this._envA = {
        camX: 0, camZ: 0, agents: null, settlements: null, clock: null, history: null,
      });
      envA.camX = camX; envA.camZ = camZ;
      envA.agents = this.agents; envA.settlements = this.settlements;
      envA.clock = this.clock; envA.history = this.history;
      for (const army of this.nations.armies) this.nations.syncArmyAgents(army, envA);
    }

    // 士兵死亡清理
    for (const a of this.agents.agents.values()) {
      if (a.job === 'soldier' && a.hp <= 0) {
        this.nations.onSoldierDeath(a, { agents: this.agents, clock: this.clock, history: this.history });
      } else if (a.hp <= 0) {
        // 被狼袭杀的村民（历史事件已在 wildlife 记录）
        this.agents.despawnAgent(a);
      }
    }

    // 天气覆盖到期
    if (this.weatherOverride && this.clock.day > this.weatherOverride.untilDay) {
      this.weatherOverride = null;
      this.weather.override = null;
    }

    return performance.now() - t0;
  }

  // 小时/日 tick 核心（update 与时间跳跃共用）
  _runHours(hours, camX = this._ctx.camX, camZ = this._ctx.camZ) {
    if (hours <= 0) return;
    this.history.now(this.clock.day, this.clock.year);
    // 复用 env 对象（每帧调用，原实现每次新建）。
    // 字段每次调用都重新赋值：settlements/nations/history 在读档时会被整体替换，
    // 不能依赖首次捕获的引用；消费方均为同步使用（fire 的异步回调仅读 env.cm，稳定）。
    const env = this._hourEnv || (this._hourEnv = {});
    env.clock = this.clock; env.weather = this.weather; env.history = this.history;
    env.settlements = this.settlements; env.nations = this.nations;
    env.world = this.world; env.cm = this.cm; env.agents = this.agents;
    env.camX = camX; env.camZ = camZ; env.jumping = !!this.jumping;
    for (let h = 0; h < hours; h++) {
      for (const s of this.settlements) s.tickHour(env);
      this.disasters.updateHour(env);
      this.nations._settlements = this.settlements;
      // 日界（跳跃时可能一帧跨多天，逐日触发日 tick）
      if (this.clock.day !== this._lastDay) {
        this._lastDay = this.clock.day;
        this.history.now(this.clock.day, this.clock.year);
        for (const s of this.settlements) s.updateEffects(this.clock);
        this.disasters.dailyRoll(env);
        this.nations.dailyTick(env);
        // 集市日：每季首日，有市场的聚落开集
        if (this.clock.dayOfYear % 12 === 1) {
          for (const s of this.settlements) {
            if (s.market) { s.festival = this.clock.day; s.morale = Math.min(100, s.morale + 3); }
          }
        }
      }
    }
  }

  /**
   * 时间跳跃：直接演化 n 年（分片执行避免卡帧）
   * 返回 Promise，onProgress(year 进度回调)
   */
  async jumpYears(years, onProgress) {
    if (this.jumping) return;
    this.jumping = true;
    const prevPaused = this.clock.paused;
    this.clock.paused = false;
    try {
      const totalDays = years * 48;
      let done = 0;
      const startYear = this.clock.year;
      while (done < totalDays) {
        const slice = Math.min(24, totalDays - done);   // 每片约 1 个季度
        const hours = this.clock.advanceDays(slice);
        this._runHours(hours);
        done += slice;
        if (onProgress) onProgress(this.clock.year, done / totalDays);
        // 让出主线程（MessageChannel 不被后台节流）
        await new Promise((r) => {
          const ch = new MessageChannel();
          ch.port1.onmessage = () => r();
          ch.port2.postMessage(0);
        });
      }
      // 跳跃后重新校准近距聚落（作物视觉等）
      for (const s of this.settlements) {
        if (s.nearCamera) {
          const cx0 = Math.floor((s.x - 40) / 16), cx1 = Math.floor((s.x + 40) / 16);
          const cz0 = Math.floor((s.z - 40) / 16), cz1 = Math.floor((s.z + 40) / 16);
          for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
            s.syncCropsForChunk(this.cm, cx, cz);
          }
        }
      }
    } finally {
      this.jumping = false;
      this.clock.paused = prevPaused;
    }
  }

  _mineFx = null;

  _materializeNear(camX, camZ) {
    for (const s of this.settlements) {
      const d = Math.hypot(s.x - camX, s.z - camZ);
      if (!s.nearCamera && d < SETTLE_NEAR * 16) {
        s.nearCamera = true;
        s._matDay = this.clock.day;
        this.agents.materialize(s, this._ctx);
        // 同步作物视觉
        const cx0 = Math.floor((s.x - 40) / 16), cx1 = Math.floor((s.x + 40) / 16);
        const cz0 = Math.floor((s.z - 40) / 16), cz1 = Math.floor((s.z + 40) / 16);
        for (let cx = cx0; cx <= cx1; cx++) for (let cz = cz0; cz <= cz1; cz++) {
          s.syncCropsForChunk(this.cm, cx, cz);
        }
      } else if (s.nearCamera && d > SETTLE_NEAR * 16 + 24) {
        s.nearCamera = false;
        this.agents.despawnSettlement(s.id);
      } else if (s.nearCamera && this.clock.day !== (s._matDay || 0)) {
        // 人口增长或新增岗位（码头建成等）→ 补充村民（每 2 天至多一次）
        const set = this.agents.bySettle.get(s.id);
        const cur = set ? set.size : 0;
        const want = Math.min(34, Math.max(4, Math.round(s.pop * 0.45)));
        const needFisher = s.dock && ![...(set || [])].some(a => a.job === 'fisher');
        if ((cur < want * 0.75 || needFisher) && this.clock.day - (s._matDay || 0) >= 2) {
          s._matDay = this.clock.day;
          this.agents.materialize(s, this._ctx);
        }
      }
    }
  }

  // chunk 就绪回调（作物视觉恢复）
  onChunkReady(cx, cz) {
    for (const s of this.settlements) {
      if (!s.nearCamera) continue;
      s.syncCropsForChunk(this.cm, cx, cz);
    }
  }

  // ============ 上帝工具 ============
  godFoundSettlement(x, z) {
    const info = this.cm.terrain.sample(Math.round(x), Math.round(z));
    if (info.h < SEA + 1 || info.riv > 0.5) return { ok: false, msg: t('god.noSettleHere') };
    const s = Settlement.found(this.settlements.length + 100, this.names.settlement(), Math.round(x), Math.round(z), this.cm.terrain, this.clock.day);
    s.food = 90; s.wood = 120; s.stone = 60;
    this.settlements.push(s);
    s.found_buildings(this.world);
    // 加入最近国家或建国
    let nearest = null, nd = 500;
    for (const o of this.settlements) {
      if (o.id === s.id || o.nationId < 0) continue;
      const d = Math.hypot(o.x - s.x, o.z - s.z);
      if (d < nd) { nd = d; nearest = o; }
    }
    if (nearest) {
      s.nationId = nearest.nationId;
      const n = this.nations.get(s.nationId);
      if (n && !n.members.includes(s.id)) n.members.push(s.id);
      this.history.add('good', 'ev.foundJoin', { name: s.name, nation: n?.name }, this.clock.day, this.clock.year);
    } else {
      const nid = this.nations.list.length;
      const nation = new Nation(nid, this.names.nation(), NATION_COLORS[nid % NATION_COLORS.length]);
      nation.members = [s.id];
      nation.capitalId = s.id;
      this.nations.list.push(nation);
      s.nationId = nid;
      this.history.add('good', 'ev.foundNew', { name: s.name }, this.clock.day, this.clock.year);
    }
    if (Math.hypot(s.x - this._ctx.camX, s.z - this._ctx.camZ) < 120) {
      s.nearCamera = true;
      this.agents.materialize(s, this._ctx);
    }
    return { ok: true, msg: t('god.founded', { name: s.name }), settle: s };
  }

  godWeather(kind, days) {
    const map = { clear: WSTATE.CLEAR, rain: WSTATE.RAIN, storm: WSTATE.STORM, snow: WSTATE.SNOW, fog: WSTATE.FOG };
    const st = map[kind];
    if (st === undefined) return false;
    this.weatherOverride = { state: st, untilDay: this.clock.day + (days || 2) };
    this.weather.override = this.weatherOverride;
    return true;
  }

  godDisaster(kind, x, z) {
    let s = null;
    let nd = 80;
    for (const o of this.settlements) {
      const d = Math.hypot(o.x - x, o.z - z);
      if (d < nd) { nd = d; s = o; }
    }
    return this.disasters.trigger(kind, Math.round(x), Math.round(z), {
      clock: this.clock, history: this.history, cm: this.cm, settlements: this.settlements,
    }, s);
  }

  godBlessFood(x, z) {
    const s = this.nearestSettle(x, z, 120);
    if (!s) return { ok: false, msg: t('god.noSettleNear') };
    s.food += 200; s.morale += 10;
    this.history.add('good', 'ev.blessFood', { name: s.name }, this.clock.day, this.clock.year);
    return { ok: true, msg: t('god.foodGiven', { name: s.name }) };
  }

  godPlantForest(x, z) {
    const w = new EditWriter();
    let n = 0;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * 22;
      const px = Math.round(x + Math.cos(a) * r), pz = Math.round(z + Math.sin(a) * r);
      const info = this.cm.terrain.sample(px, pz);
      if (info.h <= SEA + 1 || info.riv > 0.4) continue;
      if (info.biome === BIOME.DESERT) continue;
      stampTree(w, px, pz, info.h, info.temp < -0.2 ? 2 : (Math.random() < 0.2 ? 1 : 0), Math.random);
      n++;
    }
    if (!n) return { ok: false, msg: t('god.noTrees') };
    this.world.applyBlockEdits(w.edits);
    return { ok: true, msg: t('god.treesPlanted', { n }) };
  }

  godFertile() {
    for (const s of this.settlements) {
      s.effects = s.effects.filter(e => e.kind !== 'drought' && e.kind !== 'blizzard');
      for (const f of s.farms) f.growth = Math.min(38, f.growth + 12);
      s.morale += 8;
      s.food += s.pop * 2;
    }
    this.history.add('good', 'ev.fertile', {}, this.clock.day, this.clock.year);
    return { ok: true, msg: t('god.fertile') };
  }

  nearestSettle(x, z, maxD = 1e9) {
    let best = null, bd = maxD;
    for (const s of this.settlements) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // ============ 序列化 ============
  serialize() {
    return {
      clock: { min: this.clock.min, day: this.clock.day, speed: this.clock.speed },
      settlements: this.settlements.map(s => s.serialize()),
      nations: this.nations.serialize(),
      disasters: this.disasters.serialize(),
      history: this.history.serialize(),
      weatherOverride: this.weatherOverride,
    };
  }

  static deserialize(data, seedStr, cm) {
    const sim = new Sim(seedStr, cm);
    sim.clock.min = data.clock.min;
    sim.clock.day = data.clock.day;
    sim.clock.speed = data.clock.speed || 1;
    sim.settlements = data.settlements.map(d => Settlement.deserialize(d));
    sim.nations = Nations.deserialize(data.nations, sim.settlements);
    sim.disasters = Disasters.deserialize(data.disasters);
    sim.history = History.deserialize(data.history);
    sim.weatherOverride = data.weatherOverride || null;
    if (sim.weatherOverride) sim.weather.override = sim.weatherOverride;
    sim._lastDay = sim.clock.day;
    // 重建聚落领地登记（树木保护）
    for (const s of sim.settlements) s.registerClaims();
    return sim;
  }
}
