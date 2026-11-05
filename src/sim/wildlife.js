// ============================================================
// wildlife.js — 野生动物：鹿群（森林）与狼（寒冷/夜间）
// 轻量实体：仅相机附近维持少量个体；鹿可被猎人猎捕，
// 狼在夜间袭扰落单村民（真实伤害与编年史记录）。
// ============================================================
import { BIOME } from '../world/terrain.js';
import { SEA } from '../core/config.js';

const DEER_CAP = 16;
const WOLF_CAP = 4;
const DESPAWN_R = 280;
const KEEP_R = 170;

let NEXT_ID = 1;

export class Wildlife {
  constructor() {
    this.animals = new Map();   // id -> animal
    this._spawnT = 0;
    this._killFeed = [];        // 粒子/历史钩子用
  }

  nearestDeer(x, z, maxR = 70) {
    let best = null, bd = maxR * maxR;
    for (const a of this.animals.values()) {
      if (a.kind !== 'deer' || a.dead) continue;
      const d = (a.x - x) ** 2 + (a.z - z) ** 2;
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  kill(animal) {
    animal.dead = true;
    this._killFeed.push({ x: animal.x, y: animal.y, z: animal.z, t: 1.2 });
  }

  update(dt, ctx) {
    const { sim, cm } = ctx;
    const camX = ctx.camX, camZ = ctx.camZ;
    const night = sim.clock.isNight;

    // ---------- 生成 / 回收（低频） ----------
    this._spawnT -= dt;
    if (this._spawnT <= 0) {
      this._spawnT = 2;
      let deer = 0, wolf = 0;
      for (const a of this.animals.values()) {
        const d2 = (a.x - camX) ** 2 + (a.z - camZ) ** 2;
        if (d2 > DESPAWN_R * DESPAWN_R || a.dead) this.animals.delete(a.id);
        else if (a.kind === 'deer') deer++; else wolf++;
      }
      if (deer < DEER_CAP && Math.random() < 0.6) {
        const p = this._findSpawn(cm, camX, camZ, 60, 150, (inf) => inf.biome === BIOME.FOREST && inf.h > SEA + 1);
        if (p) {
          const herd = 2 + ((Math.random() * 3) | 0);
          for (let i = 0; i < herd && deer < DEER_CAP; i++, deer++) {
            this._spawn('deer', p.x + (Math.random() - 0.5) * 8, p.z + (Math.random() - 0.5) * 8, cm);
          }
        }
      }
      if (wolf < WOLF_CAP && Math.random() < 0.35) {
        const cold = (inf) => inf.temp < -0.05 || inf.biome === BIOME.FOREST;
        const p = this._findSpawn(cm, camX, camZ, 90, 170, cold);
        if (p) this._spawn('wolf', p.x, p.z, cm);
      }
    }

    // ---------- 行为 ----------
    for (const a of this.animals.values()) {
      if (a.dead) { this.animals.delete(a.id); continue; }
      a.phase += dt * (a.state === 'walk' ? 7 : 1.5);

      if (a.kind === 'deer') {
        // 靠近村民/狼则逃窜
        let threat = null, td = 36;
        for (const o of sim.agents.agents.values()) {
          if (o.hidden || o.state === 'sleep') continue;
          const d = (o.x - a.x) ** 2 + (o.z - a.z) ** 2;
          if (d < td) { td = d; threat = o; }
        }
        if (threat) {
          const dx = a.x - threat.x, dz = a.z - threat.z;
          const d = Math.hypot(dx, dz) || 1;
          this._move(a, dx / d, dz / d, 3.6, dt, cm);
          a.state = 'walk';
        } else {
          this._wander(a, dt, cm, 10);
        }
      } else {
        // 狼：夜间猎杀落单村民；远离卫兵
        let prey = null, pd = night ? 196 : 1e9;
        let guard = null, gd = 81;
        for (const o of sim.agents.agents.values()) {
          if (o.hidden || o.state === 'sleep' || o.settleId === -1) continue;
          const d = (o.x - a.x) ** 2 + (o.z - a.z) ** 2;
          if ((o.job === 'guard' || o.job === 'soldier') && d < gd) { gd = d; guard = o; }
          else if (d < pd) { pd = d; prey = o; }
        }
        if (guard && gd < 64) {
          const dx = a.x - guard.x, dz = a.z - guard.z;
          const d = Math.hypot(dx, dz) || 1;
          this._move(a, dx / d, dz / d, 3.4, dt, cm);
          a.state = 'walk';
        } else if (prey) {
          const d = Math.sqrt(pd);
          if (d > 1.3) {
            this._move(a, (prey.x - a.x) / d, (prey.z - a.z) / d, 3.0, dt, cm);
            a.state = 'walk';
          } else {
            a.state = 'work';
            prey.hp -= dt * 2.5;
            if (prey.hp <= 0) {
              prey.hp = -1;   // 标记：由 sim 主循环清理
              const s = sim.settleById(prey.settleId);
              if (s) sim.history.add('bad', 'ev.wolf', { settle: s.name, name: prey.name });
            }
          }
        } else {
          this._wander(a, dt, cm, 14);
        }
      }
    }

    // 猎杀点粒子衰减
    for (let i = this._killFeed.length - 1; i >= 0; i--) {
      this._killFeed[i].t -= dt;
      if (this._killFeed[i].t <= 0) this._killFeed.splice(i, 1);
    }
  }

  _spawn(kind, x, z, cm) {
    const a = {
      id: NEXT_ID++, kind,
      x, z, y: cm ? cm.surfaceY(Math.round(x), Math.round(z)) : 30,
      yaw: Math.random() * Math.PI * 2,
      state: 'idle', phase: Math.random() * 10,
      target: null, dead: false,
    };
    this.animals.set(a.id, a);
  }

  _findSpawn(cm, cx, cz, rMin, rMax, cond) {
    for (let tries = 0; tries < 8; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const r = rMin + Math.random() * (rMax - rMin);
      const x = Math.round(cx + Math.cos(ang) * r), z = Math.round(cz + Math.sin(ang) * r);
      const inf = cm.terrain.sample(x, z);
      if (cond(inf)) return { x, z };
    }
    return null;
  }

  _wander(a, dt, cm, r) {
    if (!a.target) {
      const ang = Math.random() * Math.PI * 2;
      a.target = { x: a.x + Math.cos(ang) * r * Math.random(), z: a.z + Math.sin(ang) * r * Math.random() };
      a._pause = 1 + Math.random() * 3;
    }
    if (a.state === 'work') {
      a._pause -= dt;
      if (a._pause <= 0) { a.target = null; a.state = 'idle'; }
      return;
    }
    const dx = a.target.x - a.x, dz = a.target.z - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.8) { a.state = 'work'; a._pause = 1 + Math.random() * 3; return; }
    this._move(a, dx / d, dz / d, a.kind === 'wolf' ? 1.6 : 1.3, dt, cm);
    a.state = 'walk';
  }

  _move(a, dx, dz, sp, dt, cm) {
    a.yaw = Math.atan2(dx, dz);
    const nx = a.x + dx * sp * dt, nz = a.z + dz * sp * dt;
    const g = cm.groundAt(Math.round(nx), Math.round(nz));
    const w = cm.waterTopAt(Math.round(nx), Math.round(nz));
    if (!(w > 0 && w > g) && Math.abs(g - a.y) < 2.5) {
      a.x = nx; a.z = nz;
    } else {
      a.yaw += 1.6;
    }
    a.y += (cm.surfaceY(Math.round(a.x), Math.round(a.z)) - a.y) * Math.min(1, dt * 8);
  }
}
