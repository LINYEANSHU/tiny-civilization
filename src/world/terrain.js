// ============================================================
// terrain.js — 纯函数化地形生成
// 任意 (x,z) 列可独立求值（不依赖邻域/全局校准），
// 主线程与 Worker 用相同种子构建相同实例 → 无限世界按需生成。
// ============================================================
import { B } from './blocks.js';
import { Perlin, fbm2, ridged2, lerp, clamp, smoothstep, hash2 } from '../core/noise.js';
import { seededRandom } from '../core/rng.js';
import { claimed } from './claims.js';
import { SY, SEA } from '../core/config.js';

export const BIOME = {
  OCEAN: 0, BEACH: 1, PLAINS: 2, FOREST: 3, DESERT: 4,
  TUNDRA: 5, SNOW: 6, MOUNTAIN: 7, SAVANNA: 8,
};
export const BIOME_NAME = ['海洋', '海滩', '平原', '森林', '沙漠', '苔原', '雪原', '山地', '稀树草原'];

export class TerrainGen {
  constructor(seedStr) {
    this.seedStr = seedStr;
    const r = seededRandom(seedStr, 'terrain');
    this.seedHash = seededRandom(seedStr, 'hash')() * 0xffffffff >>> 0;
    this.nCont = new Perlin(r);
    this.nHill = new Perlin(r);
    this.nM = new Perlin(r);
    this.nRidge = new Perlin(r);
    this.nWarp = new Perlin(r);
    this.nRiv = new Perlin(r);
    this.nLake = new Perlin(r);
    this.nTemp = new Perlin(r);
    this.nMoist = new Perlin(r);
    this.nForest = new Perlin(r);
    this.nDetail = new Perlin(r);
    this._scratch = { h: 0, biome: 0, temp: 0, moist: 0, riv: 0, slope: 0 };
  }

  // 核心采样：返回共享 scratch 对象 {h, biome, temp, moist, riv}
  sample(x, z) {
    const s = this._scratch;
    const cont = fbm2(this.nCont, x * 0.0015, z * 0.0015, 3);
    const hills = fbm2(this.nHill, x * 0.012, z * 0.012, 3);
    const mMask = smoothstep(0.16, 0.55, fbm2(this.nM, x * 0.00085, z * 0.00085, 2));
    const ridge = ridged2(this.nRidge, x * 0.0035, z * 0.0035, 4);

    let h = 31 + cont * 15 + hills * 4
      + mMask * Math.pow(ridge, 1.6) * 46
      + fbm2(this.nDetail, x * 0.06, z * 0.06, 2) * 1.3;

    // 河流：域扭曲 + 脊线取反，向海平面下切
    const wx = fbm2(this.nWarp, x * 0.001, z * 0.001, 2) * 220;
    const rv = 1 - Math.abs(fbm2(this.nRiv, (x + wx) * 0.0011 + 31.7, (z + wx * 0.7) * 0.0011 + 11.3, 2));
    const riv = smoothstep(0.962, 0.994, rv);

    // 湖盆
    const ln = fbm2(this.nLake, x * 0.0028, z * 0.0028, 3);
    const lake = smoothstep(0.34, 0.5, ln) * (h < 44 ? 1 : smoothstep(56, 44, h));

    if (riv > 0 && h > SEA - 3) {
      const target = SEA - 2;
      const depth = Math.min((h - target) * riv * 1.05, 24);
      h -= depth;
    }
    if (lake > 0) {
      h = lerp(h, Math.min(h, SEA + 0.5), lake * 0.92);
    }

    h = clamp(h, 4, SY - 8);
    const hi = Math.round(h);

    let temp = fbm2(this.nTemp, x * 0.0007, z * 0.0007, 2) * 1.15;
    temp -= Math.max(0, hi - 42) * 0.028;           // 海拔降温
    const moist = clamp((fbm2(this.nMoist, x * 0.0009, z * 0.0009, 2) + 1) * 0.62, 0, 1);

    s.h = hi; s.temp = temp; s.moist = moist; s.riv = Math.max(riv, lake * 0.8);
    s.slope = 0;
    s.biome = this.classify(hi, temp, moist, 0);
    return s;
  }

  // 坡度感知的生物群系（生成填充时用）
  // 性能：sample() 是最重的热路径（每次约 20 次 Perlin 求值），邻居列各采样一次。
  // 修复（精进阶段 F1）：旧实现采样邻居列时会覆写共享 _scratch，导致返回的
  // {h,temp,moist,riv} 实际是最后一个邻居列 (x,z-1) 的数据——整张高度场沿 +z
  // 平移 1 格。现在先暂存本列字段，采样完邻居后写回，返回值恒为本列数据。
  sampleSloped(x, z) {
    const s = this.sample(x, z);
    const h = s.h, temp = s.temp, moist = s.moist, riv = s.riv;
    const dhL = Math.abs(h - this.sample(x - 1, z).h);
    const dhU = Math.abs(h - this.sample(x, z - 1).h);
    s.h = h; s.temp = temp; s.moist = moist; s.riv = riv;
    s.slope = dhL > dhU ? dhL : dhU;
    s.biome = this.classify(h, temp, moist, s.slope);
    return s;
  }

  classify(h, temp, moist, slope) {
    if (h < SEA - 1) return BIOME.OCEAN;
    const snowLine = 50 + temp * 14;
    const rockLine = 45 + temp * 6;
    if (h >= snowLine || temp < -0.42) return BIOME.SNOW;
    if (h >= rockLine || slope >= 3) return BIOME.MOUNTAIN;
    if (h <= SEA + 1.4) return BIOME.BEACH;
    if (temp > 0.34 && moist < 0.36) return BIOME.DESERT;
    if (temp < -0.22) return BIOME.TUNDRA;
    if (temp > 0.3 && moist < 0.52) return BIOME.SAVANNA;
    if (moist > 0.55) return BIOME.FOREST;
    return BIOME.PLAINS;
  }

  // ---------- 树木 / 植被密度 ----------
  forestDensity(x, z) {
    return (fbm2(this.nForest, x * 0.014 + 91, z * 0.014 + 37, 3) + 1) * 0.5;
  }

  // 该列是否有树（纯函数；返回 0=无，否则物种 id）
  treeAt(x, z, info) {
    if (claimed(x, z)) return 0;   // 聚落领地内不长树
    const inf = info || this.sample(x, z);
    const b = inf.biome;
    if (inf.h <= SEA + 1 || inf.riv > 0.45) return 0;
    const d = this.forestDensity(x, z);
    const r = hash2(x, z, this.seedHash + 33);
    let p = 0;
    let species = 0; // 0 oak 1 birch 2 spruce 3 cactus
    if (b === BIOME.FOREST) p = 0.085 + d * 0.10;
    else if (b === BIOME.PLAINS) p = d > 0.6 ? 0.006 : 0.0022;
    else if (b === BIOME.TUNDRA) p = 0.014;
    else if (b === BIOME.SNOW) p = 0.018;
    else if (b === BIOME.SAVANNA) p = 0.008;
    else if (b === BIOME.MOUNTAIN) p = inf.h < 52 && d > 0.5 ? 0.006 : 0;
    else if (b === BIOME.DESERT) { p = 0.006; species = 3; }
    if (p === 0 || r > p) return 0;
    const r2 = hash2(x, z, this.seedHash + 34);
    if (species === 3) return 3;
    if (b === BIOME.SNOW || b === BIOME.TUNDRA || inf.h > 46) return 2;
    if (r2 < 0.16) return 1;
    return 0;
  }

  // 树的确定形态参数
  treeShape(x, z, species) {
    const r1 = hash2(x, z, this.seedHash + 35);
    const r2 = hash2(x, z, this.seedHash + 36);
    if (species === 2) return { th: 6 + ((r1 * 4) | 0) };            // spruce 6-9
    if (species === 1) return { th: 5 + ((r1 * 2) | 0) };            // birch 5-6
    if (species === 3) return { th: 2 + ((r1 * 2) | 0) };            // cactus 2-3
    return { th: 4 + ((r1 * 3) | 0) };                                // oak 4-6
  }

  // 把位于 (tx,tz) 的树写入 chunk（只写落在 chunk 范围内的部分）
  stampTree(blocks, chunkX0, chunkZ0, tx, tz, species, info) {
    const inf = info || this.sample(tx, tz);
    const gy = inf.h;
    if (gy + 2 >= SY) return;
    const { th } = this.treeShape(tx, tz, species);
    const put = (wx, y, wz, id, keep) => {
      const lx = wx - chunkX0, lz = wz - chunkZ0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= SY) return;
      const i = (lx * 16 + lz) * SY + y;
      if (keep && blocks[i] !== B.AIR) return;
      blocks[i] = id;
    };
    const leaf = species === 2 ? B.LEAVES_SPRUCE : B.LEAVES;
    const log = species === 2 ? B.LOG_SPRUCE : species === 1 ? B.LOG_BIRCH : B.LOG;

    if (species === 3) { // cactus
      for (let i = 1; i <= th; i++) put(tx, gy + i, tz, B.CACTUS);
      return;
    }
    for (let i = 1; i <= th; i++) put(tx, gy + i, tz, log);

    // 叶团（确定性伪随机裁角：以列哈希代替 PRNG）
    const cut = (dx, dz, r, cx, cy) => {
      if (Math.abs(dx) === r && Math.abs(dz) === r && hash2(tx * 31 + dx, tz * 17 + dz, this.seedHash + cy) < 0.6) return true;
      return false;
    };
    if (species === 2) {
      for (let yy = gy + 2; yy <= gy + th; yy++) {
        const fromTop = gy + th - yy;
        const rr = fromTop === 0 ? 1 : (fromTop % 2 === 1 ? 1 : 2);
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > rr + 1) continue;
          if (dx === 0 && dz === 0) continue;
          put(tx + dx, yy, tz + dz, leaf, true);
        }
      }
      put(tx, gy + th + 1, tz, leaf, true);
    } else {
      const layers = species === 1
        ? [[gy + th - 1, 2], [gy + th, 1], [gy + th + 1, 0]]
        : [[gy + th - 1, 2], [gy + th, 2], [gy + th + 1, 1], [gy + th + 2, 0]];
      for (const [cy, rr] of layers) {
        if (rr === 0) { put(tx, cy, tz, leaf, true); continue; }
        for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
          if (dx * dx + dz * dz > rr * rr + 0.6) continue;
          if (cut(dx, dz, rr, tx, cy)) continue;
          put(tx + dx, cy, tz + dz, leaf, true);
        }
      }
    }
  }

  // ---------- 地表植物（十字面片） ----------
  plantAt(x, z, info) {
    const inf = info || this.sample(x, z);
    const b = inf.biome;
    if (inf.h <= SEA) return 0;
    if (inf.riv > 0.45) return 0;
    const r = hash2(x, z, this.seedHash + 41);
    const d = this.forestDensity(x, z);
    if (b === BIOME.DESERT) {
      if (r < 0.01) return B.DEADBUSH;
      return 0;
    }
    if (b === BIOME.SNOW || b === BIOME.OCEAN) return 0;
    if (b === BIOME.PLAINS || b === BIOME.FOREST || b === BIOME.SAVANNA || b === BIOME.TUNDRA) {
      if (r < (0.035 + d * 0.115)) return B.TALLGRASS;
      if (r < 0.055 && b !== BIOME.TUNDRA) return hash2(x, z, this.seedHash + 42) < 0.5 ? B.FLOWER_RED : B.FLOWER_YELLOW;
      if (r < 0.062 && d > 0.55) return hash2(x, z, this.seedHash + 43) < 0.6 ? B.MUSHROOM_BROWN : B.MUSHROOM_RED;
    }
    return 0;
  }

  // 水边芦苇（单独判定，因为需要知道邻列是水）
  reedAt(x, z, info) {
    const inf = info || this.sample(x, z);
    if (inf.h !== SEA || (inf.biome !== BIOME.BEACH && inf.biome !== BIOME.PLAINS && inf.biome !== BIOME.FOREST)) return 0;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.sample(x + dx, z + dz);
      if (n.h < SEA) {
        return hash2(x, z, this.seedHash + 44) < 0.16 ? B.REED : 0;
      }
    }
    return 0;
  }

  // ---------- 单列填充 ----------
  // blocks: Uint8Array，colBase = (lx*16+lz)*SY；返回地面高度
  fillColumn(blocks, colBase, x, z) {
    const s = this.sampleSloped(x, z);
    const h = s.h;
    const snowLine = 50 + s.temp * 14;
    const rockLine = 45 + s.temp * 6;
    const seed = this.seedHash;

    let top;
    if (h < SEA) {
      top = h <= SEA - 4 ? (hash2(x, z, seed + 13) < 0.45 ? B.GRAVEL : B.DIRT) : B.SAND;
    } else if (h <= SEA + 1.4) {
      top = B.SAND;
    } else if (s.biome === BIOME.SNOW) {
      top = h >= snowLine + 2 ? B.SNOW : B.SNOWGRASS;
    } else if (s.biome === BIOME.MOUNTAIN) {
      top = B.STONE;
    } else if (s.biome === BIOME.DESERT) {
      top = B.SAND;
    } else {
      top = B.GRASS;
    }

    for (let y = 0; y <= h; y++) {
      let b;
      if (y === h) b = top;
      else if (y >= h - 3) {
        b = (top === B.SAND) ? B.SAND
          : (top === B.GRASS || top === B.SNOWGRASS) ? B.DIRT
          : (top === B.GRAVEL) ? B.GRAVEL
          : B.STONE;
      } else b = B.STONE;
      blocks[colBase + y] = b;
    }
    if (h < SEA) {
      for (let y = h + 1; y <= SEA; y++) blocks[colBase + y] = B.WATER;
    }
    return h;
  }

  // ---------- 小地图颜色 ----------
  minimapColor(x, z, out) {
    const s = this.sampleSloped(x, z);
    // 修复（精进阶段 F1）：riv/h 一并暂存——下方 sample(x+2,z+2) 会覆写共享
    // scratch，旧实现读到的 s.riv 是 (x+2,z+2) 邻列的河流值。
    const { h, biome, temp, riv } = s;
    let r, g, b;
    if (h < SEA - 1) {
      const d = clamp((SEA - h) / 14, 0, 1);
      r = 60 - d * 22; g = 110 - d * 42; b = 190 - d * 40;
    } else if (biome === BIOME.BEACH) { r = 216; g = 200; b = 150; }
    else if (biome === BIOME.DESERT) { r = 222; g = 202; b = 138; }
    else if (biome === BIOME.SNOW) { r = 232; g = 238; b = 244; }
    else if (biome === BIOME.TUNDRA) { r = 176; g = 188; b = 178; }
    else if (biome === BIOME.MOUNTAIN) { r = 138; g = 138; b = 140; }
    else if (biome === BIOME.FOREST) {
      const d = this.forestDensity(x, z);
      r = 46 + (1 - d) * 20; g = 108 + (1 - d) * 18; b = 44;
    } else if (biome === BIOME.SAVANNA) { r = 168; g = 172; b = 92; }
    else { r = 96; g = 158; b = 66; }
    // 河流加亮（使用本列暂存的 riv）
    if (riv > 0.5 && h >= SEA - 2) { r = 80; g = 140; b = 200; }
    // 高度光照（坡向阴影）
    const sh = clamp(1 + (this.sample(x + 2, z + 2).h - h) * 0.028, 0.72, 1.22);
    out[0] = clamp(r * sh, 0, 255); out[1] = clamp(g * sh, 0, 255); out[2] = clamp(b * sh, 0, 255);
    return s;
  }
}

// 坡度采样需要 detail 噪声，这里做个惰性兼容（sample 里已处理）
