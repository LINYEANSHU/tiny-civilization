// ============================================================
// agents.js — 村民 / 士兵 / 商队 Agent（有限状态机）
// 仅对相机附近聚落实体化；状态写入聚落（唯一事实源）。
// ============================================================
import { SEA } from '../core/config.js';
import { WSTATE } from './weather.js';
import { B } from '../world/blocks.js';
import { EditWriter, stampTree } from '../world/buildings.js';

export const JOBS = {
  farmer: { robe: 0x7a9c4e, label: '农夫' },
  lumberjack: { robe: 0x8a6a42, label: '伐木工' },
  miner: { robe: 0x7d7d85, label: '矿工' },
  builder: { robe: 0xc9a24a, label: '工匠' },
  villager: { robe: 0x9a7a5a, label: '村民' },
  child: { robe: 0xc98a6a, label: '孩童' },
  elder: { robe: 0x8a8a9a, label: '长者' },
  guard: { robe: 0x5a6a8a, label: '卫兵' },
  soldier: { robe: 0x8a4a4a, label: '士兵' },
  trader: { robe: 0xd4b45a, label: '商人' },
  fisher: { robe: 0x4a8a8a, label: '渔夫' },
  hunter: { robe: 0x5a7a3a, label: '猎人' },
};

const SKINS = [0xe8c39a, 0xd9a97e, 0xc79466, 0xefd3ac, 0xb98a5e];

let NEXT_ID = 1;

export class Agent {
  constructor(job, settleId, name) {
    this.id = NEXT_ID++;
    this.job = job;
    this.settleId = settleId;
    this.name = name;
    this.x = 0; this.y = 20; this.z = 0;
    this.yaw = Math.random() * Math.PI * 2;
    this.state = 'idle';
    this.target = null;       // {x,z}
    this.onArrive = null;     // 到达回调名
    this.workT = 0;           // 剩余工作秒
    this.workSite = null;     // 引用 farm/grove/quarry/queue
    this.carry = null;        // {type, amt}
    this.phase = Math.random() * 10;
    this.speed = 2.3;
    this.hp = 10;
    this.hidden = false;
    this.stuckT = 0;
    this.lastDist = 1e9;
    this.data = {};           // job 专属数据
    this.skin = SKINS[(Math.random() * SKINS.length) | 0];
  }
}

export class AgentManager {
  constructor() {
    this.agents = new Map();
    this.bySettle = new Map();  // settleId -> Set<agent>
    this.onChange = null;       // 数量变化回调（UI）
  }

  count() { return this.agents.size; }

  spawn(job, settleId, name, x, y, z) {
    const a = new Agent(job, settleId, name);
    a.x = x; a.y = y; a.z = z;
    this.agents.set(a.id, a);
    if (!this.bySettle.has(settleId)) this.bySettle.set(settleId, new Set());
    this.bySettle.get(settleId).add(a);
    return a;
  }

  despawnSettlement(settleId) {
    const set = this.bySettle.get(settleId);
    if (!set) return;
    for (const a of set) this.agents.delete(a.id);
    this.bySettle.delete(settleId);
  }

  despawnAgent(a) {
    this.agents.delete(a.id);
    const set = this.bySettle.get(a.settleId);
    if (set) set.delete(a.id);
  }

  // 按聚落需求生成村民组合
  materialize(settlement, ctx) {
    this.despawnSettlement(settlement.id);
    const s = settlement;
    const { sim } = ctx;
    const spawnAt = () => {
      const a = Math.random() * Math.PI * 2;
      const r = 1 + Math.random() * 4;
      const x = s.x + Math.cos(a) * r, z = s.z + Math.sin(a) * r;
      return [x, ctx.cm.surfaceY(Math.round(x), Math.round(z)) + 0.05, z];
    };
    const jobs = [];
    const nFarm = Math.min(s.farms.filter(f => !f.destroyed).length * 2, 8);
    for (let i = 0; i < nFarm; i++) jobs.push('farmer');
    if (s.lumber) for (let i = 0; i < 2; i++) jobs.push('lumberjack');
    if (s.quarry) jobs.push('miner');
    if (s.dock) for (let i = 0; i < 2; i++) jobs.push('fisher');
    if (s.grove && s.pop >= 10) jobs.push('hunter');
    if (s.buildQueue.length) for (let i = 0; i < 2; i++) jobs.push('builder');
    const nGuard = s.wallsBuilt ? 2 : 1;
    for (let i = 0; i < nGuard; i++) jobs.push('guard');
    let rest = Math.max(2, Math.min(30, Math.round(s.pop * 0.45))) - jobs.length;
    for (let i = 0; i < rest; i++) {
      const r = Math.random();
      jobs.push(r < 0.15 ? 'child' : r < 0.25 ? 'elder' : 'villager');
    }
    // 上限
    while (jobs.length > 34) jobs.pop();
    for (const job of jobs) {
      const [x, y, z] = spawnAt();
      const a = this.spawn(job, s.id, ctx.names.citizen(), x, y, z);
      if (job === 'child') a.speed = 1.7;
      if (job === 'elder') a.speed = 1.4;
      if (job === 'guard') a.speed = 2.0;
      a.data.home = { x: s.x + (Math.random() - 0.5) * 6, z: s.z + (Math.random() - 0.5) * 6 };
    }
  }

  // ============ 每帧更新 ============
  update(dt, ctx) {
    const { clock, cm, sim } = ctx;
    const night = clock.isNight;
    const weather = ctx.sim.weather;   // 稳定引用，提到循环外避免每 agent 重复取
    for (const a of this.agents.values()) {
      const s = sim.settleById(a.settleId);
      if (!s) { this.despawnAgent(a); continue; }
      if (a.job === 'soldier') { this.updateSoldier(a, dt, ctx, s); continue; }
      if (a.job === 'trader') { this.updateTrader(a, dt, ctx); continue; }

      // 睡觉：夜晚进屋（隐藏），清晨出现
      if (night && a.job !== 'guard') {
        a.hidden = true;
        a.state = 'sleep';
        continue;
      }
      if (!night && a.state === 'sleep') {
        a.hidden = false;
        a.state = 'idle';
        a.workT = 0;
      }
      if (a.hidden) continue;

      // 暴风雪/暴雨：回家躲雨
      // 修复（精进阶段 F2）：stateAt 返回 WSTATE 数字枚举，旧代码与字符串比较恒 false，
      // 天气从未真正让村民回家躲雨。
      const wstate = weather.stateAt(a.x, a.z, clock.day);
      if ((wstate === WSTATE.BLIZZARD || wstate === WSTATE.STORM) && a.job !== 'guard') {
        this.walkTo(a, a.data.home, dt, cm, () => { a.state = 'idle'; });
        continue;
      }

      switch (a.job) {
        case 'farmer': this.updateFarmer(a, dt, ctx, s); break;
        case 'lumberjack': this.updateLumberjack(a, dt, ctx, s); break;
        case 'miner': this.updateMiner(a, dt, ctx, s); break;
        case 'builder': this.updateBuilder(a, dt, ctx, s); break;
        case 'guard': this.updateGuard(a, dt, ctx, s); break;
        case 'fisher': this.updateFisher(a, dt, ctx, s); break;
        case 'hunter': this.updateHunter(a, dt, ctx, s); break;
        default: this.updateWanderer(a, dt, ctx, s); break;
      }
    }
  }

  // ---------- 移动 ----------
  walkTo(a, target, dt, cm, onArrive) {
    if (!target) { a.state = 'idle'; return false; }
    const dx = target.x - a.x, dz = target.z - a.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.9) {
      a.state = 'work';
      if (onArrive) onArrive();
      return true;
    }
    a.state = 'walk';
    a.target = target;
    let dir = Math.atan2(dx, dz);
    // 障碍规避：前方是水/悬崖 → 转向
    const step = 1.2;
    const nx = a.x + Math.sin(dir) * step, nz = a.z + Math.cos(dir) * step;
    const w = cm.waterTopAt(Math.round(nx), Math.round(nz));
    const gNext = cm.groundAt(Math.round(nx), Math.round(nz));
    const gNow = cm.groundAt(Math.round(a.x), Math.round(a.z));
    const blocked = (w > 0 && w > gNext) || Math.abs(gNext - gNow) > 2.4 || gNext <= SEA - 1;
    if (blocked) {
      let found = false;
      for (const off of [0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
        const d2 = dir + off;
        const bx = a.x + Math.sin(d2) * step, bz = a.z + Math.cos(d2) * step;
        const wb = cm.waterTopAt(Math.round(bx), Math.round(bz));
        const gb = cm.groundAt(Math.round(bx), Math.round(bz));
        if (!((wb > 0 && wb > gb) || Math.abs(gb - gNow) > 2.4 || gb <= SEA - 1)) { dir = d2; found = true; break; }
      }
      if (!found) dir += 2.5;
    }
    // 平滑转向
    let dyaw = dir - a.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    a.yaw += dyaw * Math.min(1, dt * 8);

    const sp = a.speed * (a.state === 'walk' ? 1 : 0);
    a.x += Math.sin(a.yaw) * sp * dt;
    a.z += Math.cos(a.yaw) * sp * dt;
    const gy = cm.surfaceY(Math.round(a.x), Math.round(a.z));
    a.y += (gy + 0.02 - a.y) * Math.min(1, dt * 10);
    a.phase += dt * a.speed * 2.4;

    // 卡死检测
    if (dist > a.lastDist - 0.01) {
      a.stuckT += dt;
      if (a.stuckT > 2.5) {
        a.yaw += 1.8; a.stuckT = 0;
      }
    } else a.stuckT = 0;
    a.lastDist = dist;
    return false;
  }

  wanderNear(a, cx, cz, r, dt, cm) {
    if (!a.target || (a.state === 'work' && a.workT <= 0)) {
      const ang = Math.random() * Math.PI * 2;
      const rr = Math.random() * r;
      a.target = { x: cx + Math.cos(ang) * rr, z: cz + Math.sin(ang) * rr };
      a.data._pause = 0.5 + Math.random() * 2.5;
    }
    if (a.state === 'work') {
      a.workT -= dt;
      a.phase += dt * 2;
      if (a.workT <= 0) { a.target = null; a.state = 'idle'; }
      return;
    }
    this.walkTo(a, a.target, dt, cm, () => {
      a.workT = a.data._pause || 1.5;
      a.state = 'work';
    });
  }

  updateWanderer(a, dt, ctx, s) {
    // 集市日：村民聚向市场广场
    if (s.market && s.festival === ctx.clock.day) {
      this.wanderNear(a, s.market.x, s.market.z, 6, dt, ctx.cm);
      return;
    }
    this.wanderNear(a, s.x, s.z, 10, dt, ctx.cm);
  }

  // ---------- 农夫 ----------
  // 免分配统计：单趟遍历同时统计未毁农田数与首个成熟田，
  // 代替每帧每农夫的 farms.filter()+find() 数组分配。
  // 「照料目标」仍按同序第 idx 个未毁田选取（idx=(Math.random()*count)|0），
  // 随机数消耗次数与分支条件同旧实现完全一致（count===0 时不消耗）。
  updateFarmer(a, dt, ctx, s) {
    const farms = s.farms;
    let count = 0, ripe = null;
    for (let i = 0; i < farms.length; i++) {
      const f = farms[i];
      if (f.destroyed) continue;
      if (ripe === null && f.ripe) ripe = f;
      count++;
    }
    if (ripe) {
      if (a.workSite !== ripe) {
        a.workSite = ripe;
        const cx = ripe.x0 + ripe.wd / 2, cz = ripe.z0 + ripe.dp / 2;
        this.walkTo(a, { x: cx, z: cz }, dt, ctx.cm, () => { a.workT = 4.5; });
      } else if (a.state === 'walk') {
        this.walkTo(a, { x: ripe.x0 + ripe.wd / 2, z: ripe.z0 + ripe.dp / 2 }, dt, ctx.cm, () => { a.workT = 4.5; });
      } else {
        a.workT -= dt;
        a.phase += dt * 7;
        if (a.workT <= 0) {
          s.harvestFarm(ripe, 1.0, ctx);
          const edits = [];
          const midZ = ripe.z0 + (ripe.dp >> 1);
          for (let x = ripe.x0 + 1; x <= ripe.x0 + ripe.wd - 2; x++) {
            for (let z = ripe.z0 + 1; z <= ripe.z0 + ripe.dp - 2; z++) {
              if (z === midZ) continue;
              edits.push([x, ripe.g + 1, z, B.WHEAT, 1]);
              edits.push([x, ripe.g + 1, z, B.WHEAT_YOUNG, 0]);
            }
          }
          ctx.cm.applyPlantEdits(edits, { journal: false });
          a.workSite = null;
        }
      }
      return;
    }
    // 未成熟：照料随机一块未毁农田（与旧 filter+下标选取等价）
    let target = null;
    if (count) {
      let idx = (Math.random() * count) | 0;
      for (let i = 0; i < farms.length; i++) {
        const f = farms[i];
        if (f.destroyed) continue;
        if (idx-- === 0) { target = f; break; }
      }
    }
    if (target) {
      const cx = target.x0 + 1 + Math.random() * (target.wd - 2);
      const cz = target.z0 + 1 + Math.random() * (target.dp - 2);
      this.walkTo(a, { x: cx, z: cz }, dt, ctx.cm, () => {
        a.workT = 2.5 + Math.random() * 2;
        target.growth = Math.min(39.5, target.growth + 0.4);
      });
      if (a.state === 'work') {
        a.workT -= dt;
        a.phase += dt * 7;
        if (a.workT <= 0) a.target = null;
      }
    } else if (s.market && s.festival === ctx.clock.day) {
      this.wanderNear(a, s.market.x, s.market.z, 6, dt, ctx.cm);
    } else {
      this.wanderNear(a, s.x, s.z, 8, dt, ctx.cm);
    }
  }

  // ---------- 伐木工 ----------
  updateLumberjack(a, dt, ctx, s) {
    if (!s.grove || s.grove.stock <= 0.04) { this.wanderNear(a, s.x, s.z, 8, dt, ctx.cm); return; }
    if (a.data.tree) {
      const t = a.data.tree;
      const done = this.walkTo(a, { x: t.x + 1.2, z: t.z + 1.2 }, dt, ctx.cm, () => { a.workT = 5.5; });
      if (a.state === 'work') {
        a.workT -= dt;
        a.phase += dt * 8;
        if (a.workT <= 0) {
          // 真实砍伐：移除树干与部分树叶
          const w = new EditWriter();
          for (let y = t.y; y >= t.y - 7 && y > 0; y--) w.set(t.x, y, t.z, B.AIR);
          for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
            if (Math.abs(dx) + Math.abs(dz) + Math.abs(dy) > 3) continue;
            w.set(t.x + dx, t.y + dy, t.z + dz, B.AIR);
          }
          ctx.cm.applyBlockEdits(w.edits);
          s.wood += 4;
          s.grove.stock = Math.max(0, s.grove.stock - 0.015);
          // 部分概率补种
          if (Math.random() < 0.35) {
            const w2 = new EditWriter();
            const px = t.x + ((Math.random() * 7) | 0) - 3, pz = t.z + ((Math.random() * 7) | 0) - 3;
            const info = ctx.cm.terrain.sample(px, pz);
            if (info.h > SEA + 1) {
              stampTree(w2, px, pz, info.h, info.temp < -0.2 ? 2 : 0, Math.random);
              ctx.cm.applyBlockEdits(w2.edits);
            }
          }
          a.data.tree = null;
        }
      }
      return;
    }
    // 异步找树
    if (a.data.finding) return;
    a.data.finding = true;
    ctx.cm.findTrees(s.grove.x - 20, s.grove.z - 20, s.grove.x + 20, s.grove.z + 20, 30).then((list) => {
      a.data.finding = false;
      if (!list || !list.length) { s.grove.stock = Math.min(s.grove.stock, 0.03); return; }
      // 最近的一棵
      let bi = 0, bd = 1e9;
      for (let i = 0; i < list.length; i += 3) {
        const d = (list[i] - a.x) ** 2 + (list[i + 1] - a.z) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      a.data.tree = { x: list[bi], z: list[bi + 1], y: list[bi + 2] };
    });
    this.wanderNear(a, s.grove.x, s.grove.z, 6, dt, ctx.cm);
  }

  // ---------- 矿工 ----------
  updateMiner(a, dt, ctx, s) {
    if (!s.quarry) { this.wanderNear(a, s.x, s.z, 8, dt, ctx.cm); return; }
    const q = s.quarry;
    if (a.state !== 'work') {
      this.walkTo(a, { x: q.x + (Math.random() - 0.5) * 3, z: q.z + (Math.random() - 0.5) * 3 }, dt, ctx.cm, () => { a.workT = 6 + Math.random() * 3; });
    }
    if (a.state === 'work') {
      a.workT -= dt;
      a.phase += dt * 8;
      if (a.workT <= 0) {
        s.stone += 2;
        a.state = 'idle';
        if (ctx.onMine) ctx.onMine(q.x, q.y || 20, q.z);
      }
    }
  }

  // ---------- 工匠 ----------
  updateBuilder(a, dt, ctx, s) {
    const q = s.buildQueue[0];
    if (!q) {
      // 无工程 → 帮忙搬运（ behaves as villager）
      this.wanderNear(a, s.storage ? s.storage.x : s.x, s.storage ? s.storage.z : s.z, 7, dt, ctx.cm);
      return;
    }
    const cx = q.x0 + (q.type === 'walls' ? 4 : 2), cz = q.z0 + (q.type === 'walls' ? 4 : 2);
    if (a.state !== 'work') {
      this.walkTo(a, { x: cx + (Math.random() - 0.5) * 4, z: cz + (Math.random() - 0.5) * 4 }, dt, ctx.cm, () => { a.workT = 99; });
    }
    if (a.state === 'work') {
      a.phase += dt * 9;
      q.progress += dt * 1.15;
      if (q.progress >= q.need) {
        s.buildQueue.shift();
        s.completeBuild(q, ctx.sim.world, ctx.sim.history);
        a.state = 'idle';
      }
    }
  }

  // ---------- 渔夫 ----------
  updateFisher(a, dt, ctx, s) {
    if (!s.dock) { this.wanderNear(a, s.x, s.z, 8, dt, ctx.cm); return; }
    const spot = s.dock;
    if (a.state !== 'work') {
      this.walkTo(a, { x: spot.x + (Math.random() - 0.5), z: spot.z + (Math.random() - 0.5) }, dt, ctx.cm,
        () => { a.workT = 5 + Math.random() * 4; });
    }
    if (a.state === 'work') {
      a.workT -= dt;
      a.phase += dt * 2;
      if (a.workT <= 0) {
        s.food += 1.3;                     // 钓鱼收成
        if (Math.random() < 0.12) s.wealth += 1;
        a.state = 'idle';
      }
    }
  }

  // ---------- 猎人 ----------
  updateHunter(a, dt, ctx, s) {
    const wl = ctx.sim.wildlife;
    if (!wl) { this.wanderNear(a, s.x, s.z, 9, dt, ctx.cm); return; }
    if (a.data.prey && (a.data.prey.dead || !wl.animals.has(a.data.prey.id))) a.data.prey = null;
    const deer = a.data.prey || wl.nearestDeer(a.x, a.z, 80);
    if (!deer) { this.wanderNear(a, s.grove ? s.grove.x : s.x, s.grove ? s.grove.z : s.z, 12, dt, ctx.cm); return; }
    a.data.prey = deer;
    const d = Math.hypot(deer.x - a.x, deer.z - a.z);
    if (d > 2.0) {
      // 追踪（鹿会逃，形成追逐）
      this.walkTo(a, { x: deer.x, z: deer.z }, dt, ctx.cm, () => { a.workT = 3.5; });
      if (a.state === 'work') a.workT = 3.5;
    } else {
      a.state = 'work';
      a.phase += dt * 9;
      a.workT = (a.workT || 3.5) - dt;
      if (a.workT <= 0) {
        wl.kill(deer);
        s.food += 8;                      // 猎物
        s.wealth += 1;
        a.data.prey = null;
        a.workT = 0;
      }
    }
  }

  // ---------- 卫兵 ----------
  updateGuard(a, dt, ctx, s) {
    // 复用 scratch 数组（仅本调用内使用，不保留引用）
    const spots = this._spots || (this._spots = []);
    spots.length = 0;
    for (const t of s.watchtowers) spots.push(t);
    if (s.well) spots.push(s.well);
    if (s.market) spots.push(s.market);
    if (!spots.length) { this.wanderNear(a, s.x, s.z, 10, dt, ctx.cm); return; }
    if (a.state === 'work') {
      a.workT -= dt;
      a.phase += dt * 1.5;
      if (a.workT <= 0) a.target = null;
      return;
    }
    if (!a.target || !a.data._guard) {
      a.data._guard = (a.data._guard || 0);
      const spot = spots[(Math.random() * spots.length) | 0];
      a.target = { x: spot.x + (Math.random() - 0.5) * 5, z: spot.z + (Math.random() - 0.5) * 5 };
    }
    this.walkTo(a, a.target, dt, ctx.cm, () => { a.workT = 4 + Math.random() * 5; a.data._guard = 0; });
  }

  // ---------- 士兵（战争） ----------
  updateSoldier(a, dt, ctx, s) {
    const army = a.data.army;
    if (!army) { a.state = 'idle'; this.wanderNear(a, s.x, s.z, 6, dt, ctx.cm); return; }
    const st = army.state;
    if (st === 'march' || st === 'retreat') {
      const tgt = st === 'march' ? { x: army.tx, z: army.tz } : { x: s.x, z: s.z };
      this.walkTo(a, tgt, dt, ctx.cm, () => {
        army.reached = (army.reached || 0) + 1;
        a.state = 'idle';
      });
      // 行军途中遇敌近身即战斗
      const enemy = this.nearestEnemy(a, ctx);
      if (enemy && Math.hypot(enemy.x - a.x, enemy.z - a.z) < 2.2) {
        a.state = 'fight';
      }
    } else if (st === 'battle') {
      const enemy = this.nearestEnemy(a, ctx);
      if (enemy) {
        const d = Math.hypot(enemy.x - a.x, enemy.z - a.z);
        if (d > 1.6) {
          this.walkTo(a, { x: enemy.x, z: enemy.z }, dt, ctx.cm, null);
          a.state = 'walk';
        } else {
          a.state = 'fight';
          a.phase += dt * 10;
          enemy.hp -= dt * (2.2 + (a.data.power || 0));
        }
      } else {
        // 没有可见敌人：向敌方聚落中心推进
        this.walkTo(a, { x: army.tx, z: army.tz }, dt, ctx.cm, () => { a.state = 'idle'; });
      }
    } else {
      this.wanderNear(a, army.rx ?? s.x, army.rz ?? s.z, 5, dt, ctx.cm);
    }
  }

  nearestEnemy(a, ctx) {
    let best = null, bd = 16;
    for (const o of this.agents.values()) {
      if (o.job !== 'soldier' || o.settleId === a.settleId) continue;
      if (a.data.army && o.data.army && a.data.army.nationId === o.data.army.nationId) continue;
      const d = (o.x - a.x) ** 2 + (o.z - a.z) ** 2;
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  // ---------- 商队 ----------
  updateTrader(a, dt, ctx) {
    const d = a.data;
    if (a.state !== 'work') {
      this.walkTo(a, { x: d.tx, z: d.tz }, dt, ctx.cm, () => { a.workT = 3; });
    }
    if (a.state === 'work') {
      a.workT -= dt;
      a.phase += dt * 3;
      if (a.workT <= 0) {
        if (d.onArrive) d.onArrive();
        this.despawnAgent(a);
      }
    }
  }
}
