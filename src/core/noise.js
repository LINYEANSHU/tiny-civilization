// ============================================================
// noise.js — Perlin / fBm / ridged 噪声（移植自 WorldForge）
// ============================================================
import { mulberry32 } from './rng.js';

// 兼容再导出（hash 函数定义在 rng.js）
export { hash2, hash3, xmurShort } from './rng.js';

export function lerp(a, b, t) { return a + (b - a) * t; }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function smoothstep(a, b, t) {
  t = clamp((t - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

export class Perlin {
  constructor(rand) {
    if (typeof rand === 'number') rand = mulberry32(rand);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = (rand() * (i + 1)) | 0;
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  static fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  static grad(hash, x, y) {
    switch (hash & 7) {
      case 0: return x + y;
      case 1: return x - y;
      case 2: return -x + y;
      case 3: return -x - y;
      case 4: return x;
      case 5: return -x;
      case 6: return y;
      default: return -y;
    }
  }

  // 返回约 [-1, 1]
  noise2(x, y) {
    // Math.floor 只算一次（原实现每个坐标求值两次；本函数是全游戏调用最频繁的热点）
    const fx = Math.floor(x), fy = Math.floor(y);
    const X = fx & 255, Y = fy & 255;
    const xf = x - fx, yf = y - fy;
    const u = Perlin.fade(xf), v = Perlin.fade(yf);
    const p = this.perm;
    const aa = p[p[X] + Y], ab = p[p[X] + Y + 1];
    const ba = p[p[X + 1] + Y], bb = p[p[X + 1] + Y + 1];
    const x1 = lerp(Perlin.grad(aa, xf, yf), Perlin.grad(ba, xf - 1, yf), u);
    const x2 = lerp(Perlin.grad(ab, xf, yf - 1), Perlin.grad(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v) * 0.7;
  }
}

// 分形布朗运动：多个倍频叠加
export function fbm2(perlin, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += perlin.noise2(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// ridged 噪声：山脊形态，返回约 [0,1]
export function ridged2(perlin, x, y, octaves = 4) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(perlin.noise2(x * freq, y * freq));
    sum += n * n * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / norm;
}
