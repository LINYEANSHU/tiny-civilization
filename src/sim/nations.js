// ============================================================
// nations.js — 国家 / 外交 / 贸易 / 战争
// 聚落按地缘聚合成国家；关系受贸易、边境、历史影响；战争有抽象
// 战略层（远距）与可见战斗层（近距）两套表现，共享同一战力状态。
// ============================================================
import { SEA } from '../core/config.js';
import { t } from '../i18n.js';

export const NATION_COLORS = [0xd95f4b, 0x4b8ad9, 0x53b06b, 0xc9a23a, 0x8a5ad9, 0xd95a9e, 0x4ab8b8, 0xb0783a, 0x7a9c4e, 0x9a6ab8];
// 时代名称已迁入 i18n 字典（tech.0~tech.3，见 src/i18n.js）

let ARMY_ID = 1;

export class Nation {
  constructor(id, name, color) {
    this.id = id;
    this.name = name;
    this.color = color;
    this.capitalId = -1;
    this.members = [];
    this.techPoints = 0;
    this.relations = new Map();  // otherNationId -> score
  }
  get tech() {
    return this.techPoints > 700 ? 3 : this.techPoints > 300 ? 2 : this.techPoints > 100 ? 1 : 0;
  }
}

export class Nations {
  constructor() {
    this.list = [];
    this.wars = [];      // {a, b, startDay, truceUntil}
    this.armies = [];    // {id, nationId, targetSettleId, ax, az, tx, tz, power, power0, state, agents: [], defenders: []}
  }

  // 由聚落聚类建国
  createFromSettlements(settlements, nameGen, history) {
    const n = settlements.length;
    const parent = settlements.map((_, i) => i);
    const find = (i) => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const d = Math.hypot(settlements[i].x - settlements[j].x, settlements[i].z - settlements[j].z);
        if (d < 430) parent[find(i)] = find(j);
      }
    }
    const clusters = new Map();
    settlements.forEach((s, i) => {
      const r = find(i);
      if (!clusters.has(r)) clusters.set(r, []);
      clusters.get(r).push(s);
    });
    let id = 0;
    for (const members of clusters.values()) {
      const nation = new Nation(id, nameGen.nation(), NATION_COLORS[id % NATION_COLORS.length]);
      nation.members = members.map((m) => m.id);
      nation.capitalId = members.reduce((a, b) => (a.pop > b.pop ? a : b)).id;
      for (const m of members) m.nationId = id;
      this.list.push(nation);
      id++;
    }
    history.add('good', 'ev.nationsRise', { n: this.list.length });
  }

  get(nid) { return this.list[nid] ?? null; }
  nationOf(settle) { return settle && settle.nationId >= 0 ? this.list[settle.nationId] : null; }

  relation(a, b) {
    if (a === b) return 100;
    const na = this.list[a], nb = this.list[b];
    if (!na || !nb) return 0;
    let v = na.relations.get(b);
    if (v === undefined) { v = 5 + ((a * 31 + b * 17) % 30) - 15; na.relations.set(b, v); }
    return v;
  }
  setRelation(a, b, v) {
    const na = this.list[a], nb = this.list[b];
    if (!na || !nb) return;
    na.relations.set(b, v);
    nb.relations.set(a, v);
  }
  adjustRelation(a, b, d) { this.setRelation(a, b, Math.max(-100, Math.min(100, this.relation(a, b) + d))); }

  warBetween(a, b) {
    return this.wars.find(w => (w.a === a && w.b === b) || (w.a === b && w.b === a)) || null;
  }
  isAtWar(nationId) {
    return this.wars.some(w => w.a === nationId || w.b === nationId);
  }

  membersOf(nid) {
    const n = this.get(nid);
    return n ? n.members : [];
  }

  // ---------- 每日 tick ----------
  dailyTick(env) {
    const { clock, history, settlements, agents, cm } = env;
    const day = clock.day;

    // 科技增长
    for (const n of this.list) {
      const pop = n.members.reduce((s, id) => s + (settlements[id]?.pop || 0), 0);
      const wealth = n.members.reduce((s, id) => s + (settlements[id]?.wealth || 0), 0);
      n.techPoints += 0.03 * pop * 0.1 + wealth * 0.001;
    }

    // 外交漂移（邻国）
    for (let i = 0; i < this.list.length; i++) {
      for (let j = i + 1; j < this.list.length; j++) {
        const a = this.list[i], b = this.list[j];
        const ca = settlements[a.capitalId], cb = settlements[b.capitalId];
        if (!ca || !cb) continue;
        const d = Math.hypot(ca.x - cb.x, ca.z - cb.z);
        if (d > 1100) continue;
        const war = this.warBetween(a.id, b.id);
        if (war) continue;
        let drift = (Math.random() - 0.56) * 1.1;
        if (d < 420) drift -= 0.09;   // 边境压力
        this.adjustRelation(a.id, b.id, drift);
      }
    }

    // 宣战判定
    if (Math.random() < 0.05) {
      for (let i = 0; i < this.list.length; i++) {
        for (let j = i + 1; j < this.list.length; j++) {
          const a = this.list[i], b = this.list[j];
          if (this.relation(a.id, b.id) > -34) continue;
          const truce = this.wars.find(w => w.truceUntil > day && ((w.a === a.id && w.b === b.id) || (w.a === b.id && w.b === a.id)));
          if (truce) continue;
          const pa = this.power(a.id), pb = this.power(b.id);
          const ratio = pa / Math.max(1, pb);
          if (ratio > 0.45 && ratio < 2.6 && Math.random() < 0.3) {
            this.declareWar(a.id, b.id, env);
          }
        }
      }
    }

    // 战争推演
    this.resolveWars(env);

    // 贸易（每 3 天）
    if (day % 3 === 0) this.tradeTick(env);
  }

  power(nid) {
    const n = this.get(nid);
    if (!n) return 0;
    let p = 0;
    for (const mid of n.members) {
      const s = this._settlements[mid];
      if (s) p += s.pop * 0.5 + (s.wallsBuilt ? 12 : 0) + (s.watchtowers.length * 5);
    }
    return p * (1 + n.tech * 0.18);
  }

  declareWar(a, b, env) {
    if (this.warBetween(a, b)) return;
    this.wars.push({ a, b, startDay: env.clock.day, truceUntil: 0 });
    this.adjustRelation(a, b, -40);
    const na = this.get(a), nb = this.get(b);
    env.history.add('war', 'ev.warDeclare', { a: na?.name, b: nb?.name }, env.clock.day, env.clock.year);
  }

  // 找一个敌方聚落作为进攻目标（最近的）
  pickTarget(nid, enemyNid, settlements) {
    let best = null, bd = 1e9;
    for (const mid of this.membersOf(enemyNid)) {
      const s = settlements[mid];
      if (!s || s.pop < 2) continue;
      const cap = settlements[this.get(nid)?.capitalId];
      if (!cap) continue;
      const d = Math.hypot(s.x - cap.x, s.z - cap.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  resolveWars(env) {
    const { clock, history, settlements } = env;
    this._settlements = settlements;
    const day = clock.day;

    for (let wi = this.wars.length - 1; wi >= 0; wi--) {
      const w = this.wars[wi];
      // 开战：为每个交战方向组建军队（简单：战争爆发 1 天后进攻方出兵）
      if (day - w.startDay === 1) {
        const attacker = Math.random() < 0.5 ? w.a : w.b;
        const defender = attacker === w.a ? w.b : w.a;
        const from = settlements[this.get(attacker)?.capitalId];
        const target = this.pickTarget(attacker, defender, settlements);
        if (from && target && from.id !== target.id) {
          this.raiseArmy(attacker, from, target, env);
        }
      }
      // 战争疲劳：60 天白和
      if (day - w.startDay > 60) {
        this.endWar(w, env, 'truce');
        continue;
      }
      // 结束条件在 armies 推演里处理
    }

    // 军队推演
    for (let ai = this.armies.length - 1; ai >= 0; ai--) {
      const army = this.armies[ai];
      const target = settlements[army.targetSettleId];
      const fromS = settlements[army.fromSettleId];
      if (!target || !fromS) { this.armies.splice(ai, 1); continue; }

      // 可见性切换：近处由 Agent 表现
      this.syncArmyAgents(army, env);

      if (army.state === 'march') {
        const dx = target.x - army.ax, dz = target.z - army.az;
        const d = Math.hypot(dx, dz);
        if (army.agents.length) {
          // 可见行军：以 Agent 平均位置推进抽象坐标
          let mx = 0, mz = 0;
          for (const a of army.agents) { mx += a.x; mz += a.z; }
          army.ax = mx / army.agents.length; army.az = mz / army.agents.length;
        } else if (d >= 40) {
          const step = Math.min(d, 55);
          army.ax += dx / d * step; army.az += dz / d * step;
        }
        if (d < 40) army.state = 'battle';
      } else if (army.state === 'battle') {
        // 抽象战斗（每日结算；近距由 Agent 战斗同步削减 power）
        const defPow = target.pop * 0.55 + (target.wallsBuilt ? 22 : 0);
        const atkPow = army.power;
        army.power -= defPow * 0.05 * (0.5 + Math.random());
        target.pop = Math.max(1, target.pop - atkPow * 0.012 * (0.5 + Math.random()));
        target.morale -= 1.5;
        if (Math.random() < 0.3) {
          history.add('war', 'ev.assault', { nation: this.get(army.nationId)?.name, target: target.name }, day, clock.year);
        }
        if (target.pop <= 2.5) {
          // 征服
          const victor = this.get(army.nationId);
          target.nationId = army.nationId;
          const n = this.get(victor.id);
          if (n && !n.members.includes(target.id)) n.members.push(target.id);
          const loserN = this.list.find(nn => nn.members.includes(target.id) && nn.id !== army.nationId);
          target.wood *= 0.7; target.stone *= 0.7; target.food *= 0.7;
          target.morale = 30;
          history.add('war', 'ev.conquered', { target: target.name, victor: victor?.name }, day, clock.year);
          fromS.wealth += 20;
          this.endWar(this.warBetween(army.nationId, loserN?.id ?? -1) || this.wars.find(ww => ww.a === army.nationId || ww.b === army.nationId), env, 'conquest');
          this.despawnArmy(army, env);
          this.armies.splice(ai, 1);
          continue;
        }
        if (army.power < army.power0 * 0.32) {
          history.add('war', 'ev.repelled', { target: target.name, nation: this.get(army.nationId)?.name }, day, clock.year);
          target.morale += 15;
          target.wealth += 8;
          this.endWar(this.wars.find(ww => ww.a === army.nationId || ww.b === army.nationId), env, 'victory');
          army.state = 'retreat';
        }
      } else if (army.state === 'retreat') {
        const dx = fromS.x - army.ax, dz = fromS.z - army.az;
        const d = Math.hypot(dx, dz);
        if (army.agents.length) {
          let mx = 0, mz = 0;
          for (const a of army.agents) { mx += a.x; mz += a.z; }
          army.ax = mx / army.agents.length; army.az = mz / army.agents.length;
          if (d < 35) {
            this.despawnArmy(army, env);
            this.armies.splice(ai, 1);
            continue;
          }
        } else if (d < 40) {
          this.despawnArmy(army, env);
          this.armies.splice(ai, 1);
          continue;
        } else {
          army.ax += dx / d * 55; army.az += dz / d * 55;
        }
      }

      // 军队覆灭
      if (army.power <= 0.5) {
        this.despawnArmy(army, env);
        this.armies.splice(ai, 1);
      }
    }
  }

  endWar(w, env, why) {
    if (!w) return;
    const idx = this.wars.indexOf(w);
    if (idx >= 0) this.wars.splice(idx, 1);
    this.setRelation(w.a, w.b, -15);
    w.truceUntil = env.clock.day + 360;
    // why: 'truce'（战争疲劳白和）| 'conquest'（征服）| 'victory'（守城胜利）
    const key = why === 'conquest' ? 'ev.warEndConquest' : why === 'victory' ? 'ev.warEndVictory' : 'ev.warEndTruce';
    env.history.add(why === 'victory' || why === 'conquest' ? 'war' : 'good',
      key, { a: this.get(w.a)?.name, b: this.get(w.b)?.name }, env.clock.day, env.clock.year);
    // 剩余军队撤退
    for (const army of this.armies) {
      if (army.nationId === w.a || army.nationId === w.b) army.state = 'retreat';
    }
  }

  raiseArmy(attackerNid, fromSettle, targetSettle, env) {
    const nation = this.get(attackerNid);
    const power = Math.min(46, fromSettle.pop * 0.35 + nation.tech * 5 + 4);
    if (power < 3) return null;
    const army = {
      id: ARMY_ID++,
      nationId: attackerNid,
      fromSettleId: fromSettle.id,
      targetSettleId: targetSettle.id,
      ax: fromSettle.x, az: fromSettle.z,
      tx: targetSettle.x, tz: targetSettle.z,
      power, power0: power,
      state: 'march',
      agents: [],
      defenders: [],
    };
    this.armies.push(army);
    env.history.add('war', 'ev.march', { nation: nation?.name, target: targetSettle.name }, env.clock.day, env.clock.year);
    fromSettle.morale -= 5;
    return army;
  }

  armyColor(army) {
    const n = this.get(army.nationId);
    return n ? n.color : 0x999999;
  }

  // 近距时生成/回收士兵 Agent
  syncArmyAgents(army, env) {
    const { camX, camZ, agents, settlements } = env;
    const d2cam = Math.hypot(army.ax - camX, army.az - camZ);
    if (d2cam < 420 && !army.agents.length) {
      const count = Math.max(3, Math.min(18, Math.round(army.power * 0.5)));
      const color = this.armyColor(army);
      for (let i = 0; i < count; i++) {
        const a = agents.spawn('soldier', -1, t('job.soldier'), army.ax + (Math.random() - 0.5) * 8, 40, army.az + (Math.random() - 0.5) * 8);
        a.data.army = army;
        a.data.color = color;
        a.hp = 10;
        a.speed = 2.7;
        army.agents.push(a);
      }
    } else if (d2cam > 520 && army.agents.length) {
      // 回收：记下抽象位置
      let mx = 0, mz = 0;
      for (const a of army.agents) { mx += a.x; mz += a.z; }
      army.ax = mx / army.agents.length; army.az = mz / army.agents.length;
      for (const a of army.agents) agents.despawnAgent(a);
      army.agents.length = 0;
    }
    // 守军
    const target = settlements[army.targetSettleId];
    if (army.state === 'battle' && target) {
      const d2t = Math.hypot(target.x - camX, target.z - camZ);
      if (d2t < 420 && !army.defenders.length && target.pop > 3) {
        const count = Math.max(2, Math.min(12, Math.round(target.pop * 0.4)));
        const color = this.armyColor({ nationId: target.nationId });
        for (let i = 0; i < count; i++) {
          const a = agents.spawn('soldier', -1, t('job.defender'), target.x + (Math.random() - 0.5) * 10, 40, target.z + (Math.random() - 0.5) * 10);
          a.data.army = { nationId: target.nationId, state: 'battle', tx: army.ax, tz: army.az, isDefender: true, power: 999 };
          a.data.color = color;
          army.defenders.push(a);
        }
      } else if ((army.state !== 'battle' || d2t > 520) && army.defenders.length) {
        for (const a of army.defenders) agents.despawnAgent(a);
        army.defenders.length = 0;
      }
    }
  }

  // Agent 战斗死亡 → 削减军队战力
  onSoldierDeath(agent, env) {
    for (const army of this.armies) {
      const i = army.agents.indexOf(agent);
      if (i >= 0) {
        army.agents.splice(i, 1);
        army.power -= 1.1;
        env.agents.despawnAgent(agent);
        return;
      }
      const j = army.defenders.indexOf(agent);
      if (j >= 0) {
        army.defenders.splice(j, 1);
        env.agents.despawnAgent(agent);
        return;
      }
    }
  }

  despawnArmy(army, env) {
    for (const a of army.agents) env.agents.despawnAgent(a);
    army.agents.length = 0;
    for (const a of army.defenders) env.agents.despawnAgent(a);
    army.defenders.length = 0;
  }

  // ---------- 贸易 ----------
  tradeTick(env) {
    const { settlements, agents, history, clock, camX, camZ } = env;
    for (const a of settlements) {
      if (a.pop < 6 || a.isStarving) continue;
      for (const b of settlements) {
        if (a.id >= b.id || b.pop < 6) continue;
        if (a.nationId !== b.nationId) {
          const rel = this.relation(a.nationId, b.nationId);
          if (rel < 0 || this.isAtWar(a.nationId)) continue;
        }
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d > 750 || d < 60) continue;

        let give = null; // {type, amt} a→b
        if (a.food > a.pop * 3.2 && b.food < b.pop * 1.6) give = { type: 'food', amt: 15 };
        else if (a.wood > 130 && b.wood < 50) give = { type: 'wood', amt: 22 };
        else if (a.stone > 90 && b.stone < 35) give = { type: 'stone', amt: 16 };
        if (!give) continue;

        const pay = give.type === 'food' ? { type: 'wood', amt: 12 } : { type: 'food', amt: 12 };
        // 扣款
        if (give.type === 'food') { if (a.food < give.amt) continue; a.food -= give.amt; }
        if (give.type === 'wood') { if (a.wood < give.amt) continue; a.wood -= give.amt; }
        if (give.type === 'stone') { if (a.stone < give.amt) continue; a.stone -= give.amt; }

        const exec = () => {
          if (pay.type === 'wood') b.wood = Math.max(0, b.wood - pay.amt);
          if (pay.type === 'food') b.food = Math.max(0, b.food - pay.amt);
          if (give.type === 'food') b.food += give.amt * 0.85;
          if (give.type === 'wood') b.wood += give.amt * 0.85;
          if (give.type === 'stone') b.stone += give.amt * 0.85;
          a.wealth += 4; b.wealth += 3;
          a.morale += 1; b.morale += 1;
          a.tradePartners.set(b.id, (a.tradePartners.get(b.id) || 0) + give.amt);
          if (a.nationId !== b.nationId) this.adjustRelation(a.nationId, b.nationId, 1.5);
        };

        const near = Math.hypot(a.x - camX, a.z - camZ) < 460 || Math.hypot(b.x - camX, b.z - camZ) < 460;
        if (near && agents) {
          const trader = agents.spawn('trader', -1, t('job.trader'), a.x + 2, a.g + 1, a.z + 2);
          trader.data = {
            tx: b.x, tz: b.z,
            onArrive: () => {
              exec();
              if (Math.random() < 0.25) {
                const key = give.type === 'food' ? 'ev.tradeFood' : give.type === 'wood' ? 'ev.tradeWood' : 'ev.tradeStone';
                history.add('trade', key, { a: a.name, b: b.name }, clock.day, clock.year);
              }
            },
          };
          trader.speed = 2.1;
          trader.data.start = { x: a.x, z: a.z };
        } else {
          exec();
        }
      }
    }
  }

  serialize() {
    return {
      list: this.list.map(n => ({
        id: n.id, name: n.name, color: n.color, capitalId: n.capitalId,
        members: n.members, techPoints: n.techPoints,
        relations: [...n.relations.entries()],
      })),
      wars: this.wars,
      armies: this.armies.map(a => ({
        ...a, agents: [], defenders: [],
      })),
      nextArmyId: ARMY_ID,
    };
  }

  static deserialize(d, settlements) {
    const n = new Nations();
    n.list = (d.list || []).map(x => {
      const nn = new Nation(x.id, x.name, x.color);
      nn.capitalId = x.capitalId;
      nn.members = x.members;
      nn.techPoints = x.techPoints;
      nn.relations = new Map(x.relations);
      return nn;
    });
    n.wars = d.wars || [];
    n.armies = (d.armies || []).map(a => ({ ...a, agents: [], defenders: [] }));
    if (d.nextArmyId) ARMY_ID = d.nextArmyId;
    return n;
  }
}
