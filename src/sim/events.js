// ============================================================
// events.js — 自然灾害：干旱 / 洪水 / 野火 / 暴风雪 / 疫病
// 所有灾害都修改真实模拟状态与体素世界，并记录编年史。
// ============================================================
import { SEA } from '../core/config.js';
import { B } from '../world/blocks.js';
import { EditWriter, stampTree } from '../world/buildings.js';
import { hash2 } from '../core/rng.js';

export class Disasters {
  constructor() {
    this.active = [];     // {kind, x, z, settleId, untilDay, data}
    this.fireCells = [];  // 供粒子系统 {x,y,z,t}
  }

  // 每日掷骰
  dailyRoll(env) {
    const { clock, settlements, history } = env;
    if (settlements.length === 0) return;
    const roll = (p) => Math.random() < p;

    if (roll(0.016)) {
      const s = this.pickSettle(settlements, (s) => s.biome === 4 || s.biome === 8 || clock.season === 2);
      if (s) this.trigger('drought', s.x, s.z, env, s);
    }
    if (roll(0.014)) {
      const s = this.pickSettle(settlements, (s) => s.biome !== 4 && s.biome !== 6 && this.nearWater(s, env));
      if (s) this.trigger('flood', s.x, s.z, env, s);
    }
    if (roll(0.02)) {
      const s = this.pickSettle(settlements, (s) => s.biome === 3 || s.grove);
      if (s) this.trigger('fire', s.grove ? s.grove.x : s.x + 20, s.grove ? s.grove.z : s.z + 20, env, s);
    }
    if (clock.season === 3 && roll(0.02)) {
      const s = this.pickSettle(settlements, (s) => s.biome === 5 || s.biome === 6 || s.biome === 7);
      if (s) this.trigger('blizzard', s.x, s.z, env, s);
    }
    if (roll(0.006)) {
      const s = this.pickSettle(settlements, () => true);
      if (s) this.trigger('plague', s.x, s.z, env, s);
    }
  }

  pickSettle(settlements, cond) {
    const cands = settlements.filter(cond);
    if (!cands.length) return null;
    return cands[(Math.random() * cands.length) | 0];
  }

  nearWater(s, env) {
    for (const [dx, dz] of [[10, 0], [-10, 0], [0, 10], [0, -10], [18, 8], [-18, -8]]) {
      const h = env.cm.terrain.sample(s.x + dx, s.z + dz);
      if (h.h < SEA) return true;
    }
    return false;
  }

  // 触发（随机或上帝工具）
  trigger(kind, x, z, env, settle) {
    const { clock, history } = env;
    const day = clock.day;
    switch (kind) {
      case 'drought': {
        if (!settle || settle.hasEffect('drought')) return false;
        settle.addEffect('drought', day + 12 + ((Math.random() * 20) | 0));
        // 作物枯萎（视觉）
        const edits = [];
        for (const f of settle.farms) {
          if (f.destroyed) continue;
          const midZ = f.z0 + (f.dp >> 1);
          for (let fx = f.x0 + 1; fx <= f.x0 + f.wd - 2; fx++) {
            for (let fz = f.z0 + 1; fz <= f.z0 + f.dp - 2; fz++) {
              if (fz === midZ || Math.random() < 0.55) continue;
              edits.push([fx, f.g + 1, fz, B.WHEAT_YOUNG, 1]);
              edits.push([fx, f.g + 1, fz, B.WHEAT, 1]);
              edits.push([fx, f.g + 1, fz, B.DEADBUSH, 0]);
            }
          }
        }
        env.cm.applyPlantEdits(edits, { journal: false });
        settle.morale -= 8;
        history.add('bad', 'ev.drought', { name: settle.name }, day, clock.year);
        this.active.push({ kind, x, z, settleId: settle.id, untilDay: day + 14 });
        return true;
      }
      case 'flood': {
        if (!settle || settle.hasEffect('flood')) return false;
        const cells = [];
        const R = 13;
        for (let dx = -R; dx <= R; dx += 1) {
          for (let dz = -R; dz <= R; dz += 1) {
            if (dx * dx + dz * dz > R * R) continue;
            const wx = settle.x + dx, wz = settle.z + dz;
            const g = env.cm.groundAt(wx, wz);
            if (g >= SEA - 2 && g <= SEA + 2.5 && g < 40) cells.push([wx, g, wz]);
          }
        }
        if (cells.length < 12) return false;
        const edits = [];
        for (const [wx, g, wz] of cells) {
          edits.push([wx, g + 1, wz, B.WATER]);
          if (Math.random() < 0.4) edits.push([wx, g + 2, wz, B.WATER]);
        }
        env.cm.applyBlockEdits(edits);
        // 淹坏农田
        let destroyed = 0;
        for (const f of settle.farms) {
          if (Math.hypot(f.x0 + 3 - settle.x, f.z0 + 2 - settle.z) < R + 4) {
            f.destroyed = true;
            destroyed++;
            const pedits = [];
            const midZ = f.z0 + (f.dp >> 1);
            for (let fx = f.x0 + 1; fx <= f.x0 + f.wd - 2; fx++) {
              for (let fz = f.z0 + 1; fz <= f.z0 + f.dp - 2; fz++) {
                if (fz === midZ) continue;
                pedits.push([fx, f.g + 1, fz, B.WHEAT, 1]);
                pedits.push([fx, f.g + 1, fz, B.WHEAT_YOUNG, 1]);
              }
            }
            env.cm.applyPlantEdits(pedits, { journal: false });
          }
        }
        settle.food *= 0.65;
        settle.morale -= 12;
        settle.addEffect('flood', day + 2);
        // 15 天后农田自行恢复
        this.active.push({
          kind, x: settle.x, z: settle.z, settleId: settle.id, untilDay: day + 2,
          data: { cells, restoreDay: day + 15, farmsDestroyed: destroyed },
        });
        history.add('bad', 'ev.flood', { name: settle.name, n: destroyed }, day, clock.year);
        return true;
      }
      case 'fire': {
        const event = { kind, x, z, settleId: settle ? settle.id : -1, untilDay: day + 2, data: { r: 1, x, z, burnT: 0 } };
        this.active.push(event);
        history.add('bad', settle ? 'ev.fireNear' : 'ev.fire', { name: settle.name }, day, clock.year);
        return true;
      }
      case 'blizzard': {
        if (!settle || settle.hasEffect('blizzard')) return false;
        settle.addEffect('blizzard', day + 2 + ((Math.random() * 3) | 0));
        settle.morale -= 6;
        history.add('bad', 'ev.blizzard', { name: settle.name }, day, clock.year);
        this.active.push({ kind, x, z, settleId: settle.id, untilDay: day + 4 });
        return true;
      }
      case 'plague': {
        if (!settle || settle.hasEffect('plague')) return false;
        settle.addEffect('plague', day + 8 + ((Math.random() * 10) | 0));
        history.add('bad', 'ev.plague', { name: settle.name }, day, clock.year);
        this.active.push({ kind, x, z, settleId: settle.id, untilDay: day + 18 });
        return true;
      }
    }
    return false;
  }

  // 每小时推进（野火蔓延 / 洪水消退）
  updateHour(env) {
    const { clock, settlements, history } = env;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      const s = e.settleId >= 0 ? settlements.find(q => q.id === e.settleId) : null;

      if (e.kind === 'fire') {
        e.data.burnT++;
        // 每小时烧 2-3 棵树（半径扩散）
        if (e.data.burnT % 1 === 0) {
          const R = e.data.r;
          env.cm.findTrees(e.data.x - R, e.data.z - R, e.data.x + R, e.data.z + R, 3).then((list) => {
            if (!list || !list.length) return;
            const edits = [];
            for (let k = 0; k < list.length; k += 3) {
              const tx = list[k], tz = list[k + 1], ty = list[k + 2];
              edits.push([tx, ty, tz, Math.random() < 0.35 ? B.CHARRED : B.AIR]);
              for (let y = ty - 1; y > ty - 6 && y > 0; y--) edits.push([tx, y, tz, B.AIR]);
              for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
                if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 3) continue;
                edits.push([tx + dx, ty + dy, tz + dz, B.AIR]);
              }
              this.fireCells.push({ x: tx, y: ty, z: tz, t: 2.5 });
            }
            if (edits.length) env.cm.applyBlockEdits(edits);
          });
          e.data.r += 0.9;
          if (s) { s.wood = Math.max(0, s.wood - 3); s.grove && (s.grove.stock = Math.max(0, s.grove.stock - 0.02)); s.morale -= 0.4; }
        }
        if (e.data.r > 15 || clock.day >= e.untilDay) {
          if (s) s.morale -= 5;
          this.active.splice(i, 1);
        }
      } else if (e.kind === 'flood') {
        if (clock.day >= e.untilDay && !e.data.restored) {
          // 退水
          const edits = [];
          for (const [wx, g, wz] of (e.data.cells || [])) {
            edits.push([wx, g + 1, wz, B.AIR]);
            edits.push([wx, g + 2, wz, B.AIR]);
          }
          env.cm.applyBlockEdits(edits);
          e.data.restored = true;
        }
        if (e.data.restoreDay && clock.day >= e.data.restoreDay) {
          // 农田恢复
          if (s) for (const f of s.farms) f.destroyed = false;
          this.active.splice(i, 1);
        }
      } else if (e.kind === 'plague' && s) {
        if (Math.random() < 0.03) s.pop = Math.max(2, s.pop - 1);
        s.morale -= 0.3;
      }

      // 到期清理（非 fire/flood）
      if (clock.day >= e.untilDay && e.kind !== 'fire' && e.kind !== 'flood') {
        this.active.splice(i, 1);
      }
    }
    // 火焰粒子寿命
    for (let i = this.fireCells.length - 1; i >= 0; i--) {
      this.fireCells[i].t -= 0.05;
      if (this.fireCells[i].t <= 0) this.fireCells.splice(i, 1);
    }
  }

  serialize() {
    return {
      active: this.active.map(e => ({ ...e })),
    };
  }
  static deserialize(d) {
    const ds = new Disasters();
    ds.active = (d && d.active) || [];
    return ds;
  }
}
