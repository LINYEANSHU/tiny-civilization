// ============================================================
// mesher.js — 区块网格生成（纯数据，无 THREE 依赖，可在 Worker 运行）
// · 面剔除 + 逐顶点 AO + 四叉翻转（移植自 WorldForge）
// · 材质通道 aMat：0 地表 / 1 植被 / 2 木质 / 3 石质 / 4 发光
//   （供季节着色、冬季积雪、夜晚发光使用）
// · 十字植物合并进 solid 网格（同一图集 + alphaTest），顶端摇摆
// ============================================================
import { B, isOccluder, tilesOf, PLANTS, LEAF_IDS, WOOD_IDS } from './blocks.js';
import { hash3 } from '../core/rng.js';

export const CHUNK = 16;
const TILE_N = 16;
const UV_TILE = 1 / TILE_N;
const UV_EPS = 0.0005;
const AO_BRIGHT = [0.42, 0.62, 0.82, 1.0];

// 六个面：法线 n、切向 U/V（保证 U×V=n，CCW 绕序）、起始角 O
const FACES = [
  { n: [1, 0, 0], U: [0, 0, -1], V: [0, 1, 0], O: [1, 0, 1] },
  { n: [-1, 0, 0], U: [0, 0, 1], V: [0, 1, 0], O: [0, 0, 0] },
  { n: [0, 1, 0], U: [0, 0, 1], V: [1, 0, 0], O: [0, 1, 0] },
  { n: [0, -1, 0], U: [1, 0, 0], V: [0, 0, 1], O: [0, 0, 0] },
  { n: [0, 0, 1], U: [1, 0, 0], V: [0, 1, 0], O: [0, 0, 1] },
  { n: [0, 0, -1], U: [-1, 0, 0], V: [0, 1, 0], O: [1, 0, 0] },
];

const _matClassCache = [];
export function matClassOf(id) {
  let m = _matClassCache[id];
  if (m !== undefined) return m;
  if (LEAF_IDS.has(id) || id === B.CACTUS) m = 1;
  else if (WOOD_IDS.has(id) || id === B.PLANK || id === B.PLANK_DARK
    || id === B.THATCH || id === B.CHARRED) m = 2;
  else if (id === B.STONE || id === B.COBBLE || id === B.BRICK || id === B.SANDSTONE
    || id === B.STONEBRICK || id === B.GLASS) m = 3;
  else if (id === B.GLOW) m = 4;
  else m = 0;
  _matClassCache[id] = m;
  return m;
}

// AO 亮度表（emitSolidFace 复用的 scratch，单线程顺序调用无重入）
const _ao = [0, 0, 0, 0];
const br8 = (v) => Math.min(255, (v * 255) | 0);

// getBlock(wx, y, wz) → 方块 id；plants: [{lx,lz,y,id}]
// yTop: 扫描高度上限（可选，默认 96=SY）。调用方可传入「区块内最高非空方块 +1」，
// 上方全为 AIR，跳过它们与全量扫描结果完全一致（gen.worker 已按此约定传入）。
// 输出坐标为区块局部坐标（0..16），主线程把 Mesh 定位到 (cx*16, 0, cz*16)
export function meshChunk(getBlock, x0, z0, plants, seedHash, yTop = 96) {
  const solid = { pos: [], nor: [], uv: [], col: [], mat: [], sway: [], idx: [] };
  const water = { pos: [], nor: [], uv: [], idx: [], wave: [] };

  const occl = (x, y, z) => isOccluder(getBlock(x, y, z));

  for (let lx = 0; lx < CHUNK; lx++) {
    const x = x0 + lx;
    for (let lz = 0; lz < CHUNK; lz++) {
      const z = z0 + lz;
      for (let y = 0; y < yTop; y++) {
        const b = getBlock(x, y, z);
        if (b === B.AIR) continue;
        if (b === B.WATER) { emitWater(getBlock, x0, z0, x, y, z, water); continue; }

        const tiles = tilesOf(b);
        const mClass = matClassOf(b);
        const jitter = 0.945 + hash3(x, y, z, seedHash) * 0.1;

        for (let f = 0; f < 6; f++) {
          const F = FACES[f];
          const nb = getBlock(x + F.n[0], y + F.n[1], z + F.n[2]);
          if (isOccluder(nb)) continue;
          if (b === B.GLASS && nb === B.GLASS) continue;
          emitSolidFace(solid, occl, x0, z0, x, y, z, f, tiles[f], jitter, mClass);
        }
      }
    }
  }

  if (plants) {
    for (const p of plants) {
      const def = PLANTS[p.id];
      if (!def) continue;
      emitPlant(solid, p.lx + 0.5, p.y, p.lz + 0.5, def, seedHash);
    }
  }

  return { solid, water };
}

function emitSolidFace(buf, occl, x0, z0, x, y, z, f, tile, jitter, mClass) {
  const F = FACES[f];
  const base = buf.pos.length / 3;
  const tu = (tile % TILE_N) * UV_TILE;
  const tv = 1 - (Math.floor(tile / TILE_N) + 1) * UV_TILE;

  const ao = _ao;
  for (let k = 0; k < 4; k++) {
    const a = (k === 1 || k === 2) ? 1 : 0;
    const b = (k === 2 || k === 3) ? 1 : 0;
    const sa = a ? 1 : -1, sb = b ? 1 : -1;

    const s1 = occl(x + F.n[0] + F.U[0] * sa, y + F.n[1] + F.U[1] * sa, z + F.n[2] + F.U[2] * sa);
    const s2 = occl(x + F.n[0] + F.V[0] * sb, y + F.n[1] + F.V[1] * sb, z + F.n[2] + F.V[2] * sb);
    const c = occl(
      x + F.n[0] + F.U[0] * sa + F.V[0] * sb,
      y + F.n[1] + F.U[1] * sa + F.V[1] * sb,
      z + F.n[2] + F.U[2] * sa + F.V[2] * sb,
    );
    ao[k] = (s1 && s2) ? 0 : 3 - (s1 + s2 + c);

    buf.pos.push(
      x - x0 + F.O[0] + F.U[0] * a + F.V[0] * b,
      y + F.O[1] + F.U[1] * a + F.V[1] * b,
      z - z0 + F.O[2] + F.U[2] * a + F.V[2] * b,
    );
    buf.nor.push(F.n[0] * 127, F.n[1] * 127, F.n[2] * 127);
    const br = AO_BRIGHT[ao[k]] * jitter;
    buf.col.push(br8(br), br8(br), br8(br));
    // 材质类缩放到 0..255（aMat normalized 传入着色器 → vMat*4 还原类别）
    buf.mat.push(Math.min(255, (mClass * 63.75) | 0));
    buf.sway.push(0);
    buf.uv.push(
      tu + UV_EPS + a * (UV_TILE - 2 * UV_EPS),
      tv + UV_EPS + b * (UV_TILE - 2 * UV_EPS),
    );
  }

  if (ao[0] + ao[2] >= ao[1] + ao[3]) {
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  } else {
    buf.idx.push(base + 1, base + 2, base + 3, base + 1, base + 3, base);
  }
}

// 十字植物：两片对角交叉面片，顶端摇摆，亮度微随机（局部坐标 0..1）
function emitPlant(buf, lx, y, lz, def, seedHash) {
  const tu = (def.tile % TILE_N) * UV_TILE;
  const tv = 1 - (Math.floor(def.tile / TILE_N) + 1) * UV_TILE;
  const e = 0.146, E = 1 - 0.146;
  const br = 0.92 + hash3((lx * 16 + lz) | 0, y | 0, 17, seedHash + 77) * 0.14;
  const br8 = Math.min(255, (br * 255) | 0);
  const h = def.h;

  const quads = [
    [[e, e], [E, E]],
    [[e, E], [E, e]],
  ];
  for (const [[x1, z1], [x2, z2]] of quads) {
    const base = buf.pos.length / 3;
    buf.pos.push(lx + x1 - 0.5, y, lz + z1 - 0.5);
    buf.pos.push(lx + x2 - 0.5, y, lz + z2 - 0.5);
    buf.pos.push(lx + x2 - 0.5, y + h, lz + z2 - 0.5);
    buf.pos.push(lx + x1 - 0.5, y + h, lz + z1 - 0.5);
    for (let i = 0; i < 4; i++) buf.nor.push(0, 127, 0);
    const u0 = tu + UV_EPS, u1 = tu + UV_TILE - UV_EPS;
    const v0 = tv + UV_EPS, v1 = tv + UV_TILE - UV_EPS;
    buf.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
    for (let i = 0; i < 4; i++) {
      buf.col.push(br8, br8, br8);
      buf.mat.push(64);
      buf.sway.push(i >= 2 ? 255 : 0);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

function emitWater(getBlock, x0, z0, x, y, z, buf) {
  const above = getBlock(x, y + 1, z);
  const isSurface = above !== B.WATER;
  const topY = isSurface ? 0.875 : 1;

  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    const nb = getBlock(x + F.n[0], y + F.n[1], z + F.n[2]);
    let visible;
    if (f === 2) visible = nb !== B.WATER;
    else if (f === 3) visible = nb === B.AIR;
    else visible = nb === B.AIR || nb === B.GLASS;
    if (!visible) continue;

    const base = buf.pos.length / 3;
    for (let k = 0; k < 4; k++) {
      const a = (k === 1 || k === 2) ? 1 : 0;
      const b = (k === 2 || k === 3) ? 1 : 0;
      let py = y + F.O[1] + F.U[1] * a + F.V[1] * b;
      if (py === y + 1 && topY !== 1) py = y + topY;
      buf.pos.push(
        x - x0 + F.O[0] + F.U[0] * a + F.V[0] * b,
        py,
        z - z0 + F.O[2] + F.U[2] * a + F.V[2] * b,
      );
      buf.nor.push(F.n[0] * 127, F.n[1] * 127, F.n[2] * 127);
      buf.uv.push(a, b);
      buf.wave.push(py !== Math.round(py) ? 1 : 0);
    }
    buf.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
}

// 把 JS 数组缓冲转成紧凑 TypedArray（配合 transferable 零拷贝传输）
export function packMesh(m) {
  return {
    pos: new Float32Array(m.pos),
    nor: new Int8Array(m.nor),
    uv: new Float32Array(m.uv),
    col: new Uint8Array(m.col),
    mat: new Uint8Array(m.mat),
    sway: new Uint8Array(m.sway),
    idx: new Uint32Array(m.idx),
  };
}

export function packWater(m) {
  return {
    pos: new Float32Array(m.pos),
    nor: new Int8Array(m.nor),
    uv: new Float32Array(m.uv),
    wave: new Uint8Array(m.wave),
    idx: new Uint32Array(m.idx),
  };
}
