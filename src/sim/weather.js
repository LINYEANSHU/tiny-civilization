// ============================================================
// weather.js — 天气：天气胞元（400 格）+ 季节/生物群系调制
// 相同 (胞元, 日期) 结果确定 → 可复现；不同区域可同时有不同天气
// ============================================================
import { hash2 } from '../core/rng.js';
import { clamp } from '../core/noise.js';

export const WSTATE = {
  CLEAR: 0, CLOUD: 1, RAIN: 2, STORM: 3, SNOW: 4, BLIZZARD: 5, FOG: 6, SANDSTORM: 7,
};
export const WSTATE_NAME = ['晴', '多云', '降雨', '雷暴', '降雪', '暴风雪', '大雾', '沙尘暴'];

const CELL = 400;

export class Weather {
  constructor(seedStr, terrain) {
    this.seed = 0;
    for (let i = 0; i < seedStr.length; i++) this.seed = (Math.imul(this.seed ^ seedStr.charCodeAt(i), 16777619)) >>> 0;
    this.terrain = terrain;
    this._cache = new Map();  // (cellKey*100000 + day) -> state
  }

  _cellInfo(cx, cz) {
    const x = cx * CELL + 200, z = cz * CELL + 200;
    const info = this.terrain.sample(x, z);
    return { temp: info.temp, biome: info.biome, h: info.h };
  }

  // 该位置当天的天气状态
  stateAt(x, z, day) {
    if (this.override) return this.override.state;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    return this.stateForCell(cx, cz, day);
  }

  stateForCell(cx, cz, day) {
    const key = ((cx + 128) * 512 + (cz + 128)) * 100000 + (day % 100000);
    let v = this._cache.get(key);
    if (v !== undefined) return v;
    const { temp, biome } = this._cellInfo(cx, cz);
    const season = Math.floor((((day - 1) % 48) / 12)) | 0;  // 0春1夏2秋3冬
    const epoch = Math.floor(day / 2);
    const r1 = hash2(cx * 31 + 7, cz * 17 - 3, this.seed ^ (epoch * 2654435761));
    const r2 = hash2(cx * 13 - 5, cz * 29 + 11, this.seed ^ (day * 40503));

    // 基础权重（按季节）
    let w = [30, 26, 12, 5, 0, 0, 8, 0]; // 晴 多云 雨 暴雨 雪 雪暴 雾 沙尘
    if (season === 1) w = [34, 24, 14, 12, 0, 0, 3, 0];
    else if (season === 2) w = [26, 24, 10, 3, 0, 0, 16, 0];
    else if (season === 3) w = [16, 22, 6, 0, 24, 7, 8, 0];
    // 沙漠/炎热
    if (biome === 4) { w[2] = 0; w[3] = 0; w[4] = 0; w[5] = 0; w[7] = season === 1 ? 26 : 14; w[6] = 10; }
    // 寒冷 → 雨变雪
    if (temp < -0.18 || biome === 5 || biome === 6) {
      w[2] = 0; w[3] = 0; w[4] += 14; w[5] += season === 3 ? 8 : 2;
    }
    // 高山
    if (biome === 7 && temp < 0) { w[2] = 0; w[4] += 10; }

    const total = w.reduce((a, b) => a + b, 0);
    let pick = (r1 < 0.22 ? r2 : r1) * total;  // 22% 概率偏离两天期基线
    let state = WSTATE.CLEAR;
    for (let i = 0; i < w.length; i++) {
      pick -= w[i];
      if (pick <= 0) { state = i; break; }
    }
    this._cache.set(key, state);
    if (this._cache.size > 20000) this._cache.clear();
    return state;
  }

  // 视觉强度：0..1（供粒子/雾效渐变）
  intensity(state) {
    switch (state) {
      case WSTATE.CLOUD: return 0.35;
      case WSTATE.FOG: return 0.75;
      case WSTATE.RAIN: return 0.55;
      case WSTATE.STORM: return 1.0;
      case WSTATE.SNOW: return 0.6;
      case WSTATE.BLIZZARD: return 1.0;
      case WSTATE.SANDSTORM: return 0.9;
      default: return 0;
    }
  }
}
