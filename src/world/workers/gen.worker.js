// ============================================================
// gen.worker.js — 世界生成 Worker
// 持有噪声实例与区块数据 LRU；负责地形填充、植被、编辑应用、网格构建、查询。
// 不依赖 THREE，纯 TypedArray 输出（transferable 零拷贝）。
// ============================================================
import { TerrainGen, BIOME } from '../terrain.js';
import { meshChunk, packMesh, packWater } from '../mesher.js';
import { B, isCross, WOOD_IDS } from '../blocks.js';
import { restoreClaims } from '../claims.js';
import { SY, CHUNK } from '../../core/config.js';

let terrain = null;
const chunks = new Map();   // key -> { blocks, plants: Map(colKey->[plantIdx...]), plantList, lastUse }
const CAP = 1500;

const ckey = (cx, cz) => (cx + 512) * 1024 + (cz + 512);

// ---------- 区块构建 ----------
function buildChunk(cx, cz, blockEdits, plantEdits, borderEdits) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  const blocks = new Uint8Array(CHUNK * CHUNK * SY);
  const hmap = new Uint8Array(CHUNK * CHUNK);
  const wmap = new Uint8Array(CHUNK * CHUNK);

  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const h = terrain.fillColumn(blocks, (lx * CHUNK + lz) * SY, x0 + lx, z0 + lz);
      hmap[lx * CHUNK + lz] = h;
    }
  }
  // 水面高度
  for (let i = 0; i < hmap.length; i++) {
    const base = i * SY;
    const h = hmap[i];
    if (blocks[base + Math.min(h + 1, SY - 1)] === B.WATER) {
      let top = h + 1;
      while (top + 1 < SY && blocks[base + top + 1] === B.WATER) top++;
      wmap[i] = top;
    }
  }

  // 树木（含边缘 3 格余量，跨区块树冠）
  for (let tx = x0 - 3; tx < x0 + CHUNK + 3; tx++) {
    for (let tz = z0 - 3; tz < z0 + CHUNK + 3; tz++) {
      const info = terrain.sample(tx, tz);
      const sp = terrain.treeAt(tx, tz, info);
      if (sp) terrain.stampTree(blocks, x0, z0, tx, tz, sp, info);
    }
  }

  // 地表植物（十字面片）
  const plantList = [];
  const plantIdx = new Map(); // colKey -> index in plantList
  const colKey = (lx, lz) => lx * CHUNK + lz;
  for (let lx = 0; lx < CHUNK; lx++) {
    for (let lz = 0; lz < CHUNK; lz++) {
      const wx = x0 + lx, wz = z0 + lz;
      const ci = lx * CHUNK + lz;
      const h = hmap[ci];
      if (blocks[(ci) * SY + Math.min(h + 1, SY - 1)] !== B.AIR) continue;
      const info = terrain.sample(wx, wz);
      let pid = terrain.plantAt(wx, wz, info);
      if (!pid) pid = terrain.reedAt(wx, wz, info);
      if (pid) {
        plantIdx.set(colKey(lx, lz), plantList.length);
        plantList.push({ lx, lz, y: h + 1, id: pid });
      }
    }
  }

  // 应用邻居边缘编辑（仅用于正确的跨界剔除）
  if (borderEdits) {
    for (const [wx, y, wz, id] of borderEdits) {
      const lx = wx - x0, lz = wz - z0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
      blocks[(lx * CHUNK + lz) * SY + y] = id;
    }
  }

  const rec = { blocks, plantList, plantIdx, lastUse: frame++ };
  chunks.set(ckey(cx, cz), rec);

  // 应用本区块编辑（文明建筑/作物/灾害）
  applyEdits(cx, cz, rec, blockEdits, plantEdits);
  evict();
  return rec;
}

function applyEdits(cx, cz, rec, blockEdits, plantEdits) {
  if (blockEdits) {
    // blockEdits: 打包整数 idx(15bit) | id(6bit<<15)，兼容旧版二元数组
    for (const v of blockEdits) {
      let lidx, id;
      if (typeof v === 'number') { lidx = v & 32767; id = v >>> 15; }
      else { lidx = v[0]; id = v[1]; }
      const col = (lidx / SY) | 0;
      const y = lidx - col * SY;
      const lx = (col / 16) | 0, lz = col % 16;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15 || y < 0 || y >= SY) continue;
      rec.blocks[(lx * CHUNK + lz) * SY + y] = id;
    }
  }
  if (plantEdits) {
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (const pe of plantEdits) {
      const [wx, y, wz, pid, del] = pe;
      const lx = wx - x0, lz = wz - z0;
      if (lx < 0 || lx > 15 || lz < 0 || lz > 15) continue;
      const ci = lx * CHUNK + lz;
      const idx = rec.plantIdx.get(ci);
      if (del) {
        if (idx !== undefined) {
          const p = rec.plantList[idx];
          if (p && p.y === y && p.id === pid) {
            rec.plantList[idx] = null;
            rec.plantIdx.delete(ci);
          }
        }
      } else {
        const at = idx !== undefined && rec.plantList[idx] ? idx : plantAppend(rec);
        rec.plantList[at] = { lx, lz, y, id: pid };
        rec.plantIdx.set(ci, at);
      }
    }
  }
}
function plantAppend(rec) { rec.plantList.push(null); return rec.plantList.length - 1; }

function evict() {
  // 批量老化：超过高水位（CAP+96）才触发一次排序淘汰，
  // 避免每次建块都做全表 O(n log n) 排序；缓存峰值多 96 块（约 2.5MB），策略不变。
  if (chunks.size <= CAP + 96) return;
  const arr = [...chunks.entries()].sort((a, b) => a[1].lastUse - b[1].lastUse);
  const kill = chunks.size - CAP;
  for (let i = 0; i < kill && i < arr.length; i++) chunks.delete(arr[i][0]);
}

// ---------- 邻居列采样（未加载时纯函数计算，含跨树冠） ----------
const _tmpCol = new Uint8Array(SY);
function columnBlocks(wx, wz) {
  _tmpCol.fill(0);
  const h = terrain.fillColumn(_tmpCol, 0, wx, wz);
  // 该列受 ±3 范围内树木影响
  for (let tx = wx - 3; tx <= wx + 3; tx++) {
    for (let tz = wz - 3; tz <= wz + 3; tz++) {
      const info = terrain.sample(tx, tz);
      const sp = terrain.treeAt(tx, tz, info);
      if (sp) terrain.stampTree(_tmpCol, wx, wz, tx, tz, sp, info);
    }
  }
  return _tmpCol;
}

let frame = 1;
function makeGetBlock(cx, cz, self, colCache) {
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  return (x, y, z) => {
    if (y < 0) return B.STONE;
    if (y >= SY) return B.AIR;
    if (x >= x0 && x < x0 + CHUNK && z >= z0 && z < z0 + CHUNK) {
      return self.blocks[((x - x0) * CHUNK + (z - z0)) * SY + y];
    }
    // 跨界取块：本次网格构建内按列缓存（未加载邻居的纯函数计算非常昂贵）
    const ck = x * 100003 + z;
    let col = colCache.get(ck);
    if (col === undefined) {
      const ncx = Math.floor(x / CHUNK), ncz = Math.floor(z / CHUNK);
      const nrec = chunks.get(ckey(ncx, ncz));
      if (nrec) {
        nrec.lastUse = frame;
        const lx = x - ncx * CHUNK, lz = z - ncz * CHUNK;
        col = nrec.blocks.slice((lx * CHUNK + lz) * SY, (lx * CHUNK + lz) * SY + SY);
      } else {
        col = columnBlocks(x, z).slice();
      }
      colCache.set(ck, col);
    }
    return col[y];
  };
}

function computeWaterMap(rec) {
  const wmap = new Uint8Array(CHUNK * CHUNK);
  for (let i = 0; i < wmap.length; i++) {
    const base = i * SY;
    if (rec.blocks[base] === 0 && rec.blocks[base + 1] === 0 && rec.blocks[base + 2] === 0) { /* empty col */ }
    let h = SY - 1;
    while (h > 0 && rec.blocks[base + h] === B.AIR) h--;
    if (rec.blocks[base + h] === B.WATER) wmap[i] = h;
  }
  return wmap;
}
function groundMap(rec) {
  const hmap = new Uint8Array(CHUNK * CHUNK);
  for (let i = 0; i < hmap.length; i++) {
    const base = i * SY;
    let h = SY - 1;
    while (h > 0) {
      const b = rec.blocks[base + h];
      if (b !== B.AIR && b !== B.WATER) break;
      h--;
    }
    hmap[i] = h;
  }
  return hmap;
}

function meshAndPost(cx, cz, extra = {}) {
  const rec = chunks.get(ckey(cx, cz));
  if (!rec) return;
  rec.lastUse = frame;
  const t0 = performance.now();
  const x0 = cx * CHUNK, z0 = cz * CHUNK;
  // 本区块最高非空方块 → 裁剪 meshChunk 的 y 扫描范围。
  // 上方全为 AIR，跳过后网格结果与全量扫描完全一致（典型省去约一半 y 循环）。
  const bl = rec.blocks;
  let topY = 0;
  for (let col = 0; col < bl.length; col += SY) {
    for (let y = SY - 1; y > topY; y--) {
      if (bl[col + y] !== 0) { topY = y; break; }
    }
  }
  const getBlock = makeGetBlock(cx, cz, rec, new Map());
  const plants = rec.plantList.filter(Boolean);
  const m = meshChunk(getBlock, x0, z0, plants, terrain.seedHash, topY + 1);
  const solid = packMesh(m.solid);
  const water = packWater(m.water);
  const hmap = groundMap(rec);
  const wmap = computeWaterMap(rec);
  const ms = Math.round((performance.now() - t0) * 10) / 10;
  self.postMessage({ t: 'genMs', ms });
  const transfer = [solid.pos.buffer, solid.nor.buffer, solid.uv.buffer, solid.col.buffer, solid.mat.buffer, solid.sway.buffer, solid.idx.buffer,
    water.pos.buffer, water.nor.buffer, water.uv.buffer, water.wave.buffer, water.idx.buffer,
    hmap.buffer, wmap.buffer];
  self.postMessage({ t: 'chunk', cx, cz, solid, water, hmap, wmap, ...extra }, transfer);
}

// ---------- 消息处理 ----------
self.onmessage = (e) => {
  const msg = e.data;
  try {
    handle(msg);
  } catch (err) {
    // 兜底：任何异常都必须回应，否则主线程 in-flight 配额泄漏
    self.postMessage({ t: 'set-done', rid: msg.rid, error: String((err && err.stack) || err).slice(0, 600) });
  }
};

// ---------- 脏区块合并重网格：连续多条 set 只重网格一次 ----------
const dirtyChunks = new Set();
let dirtyScheduled = false;
function markDirty(cx, cz) {
  dirtyChunks.add(ckey(cx, cz));
  if (!dirtyScheduled) {
    dirtyScheduled = true;
    setTimeout(() => {
      dirtyScheduled = false;
      const batch = [...dirtyChunks];
      dirtyChunks.clear();
      for (const key of batch) {
        if (!chunks.has(key)) continue;
        const cx = Math.floor(key / 1024) - 512;
        const cz = (key % 1024) - 512;
        meshAndPost(cx, cz, {});
      }
    }, 0);
  }
}

function handle(msg) {
  switch (msg.t) {
    case 'init': {
      terrain = new TerrainGen(msg.seed);
      if (msg.claims) restoreClaims(msg.claims);
      self.postMessage({ t: 'ready' });
      break;
    }
    case 'claims': {
      // 领地更新：重建登记并丢弃全部缓存（受影响区块按需重生成）
      restoreClaims(msg.list);
      chunks.clear();
      break;
    }
    case 'gen': {
      if (!terrain) return;
      const rec = chunks.get(ckey(msg.cx, msg.cz));
      // noEdits: 该缓存由 findTrees 等无编辑路径建立，需带编辑重建
      if (!rec || rec.noEdits) {
        buildChunk(msg.cx, msg.cz, msg.blockEdits, msg.plantEdits, msg.borderEdits);
      }
      meshAndPost(msg.cx, msg.cz, { rid: msg.rid });
      break;
    }
    case 'set': {
      // 就地区块编辑：合并到脏批次重网格（避免连续编辑重复建网格）
      const rec = chunks.get(ckey(msg.cx, msg.cz));
      if (rec) {
        applyEdits(msg.cx, msg.cz, rec, msg.blockEdits, msg.plantEdits);
        markDirty(msg.cx, msg.cz);
      }
      self.postMessage({ t: 'set-done', rid: msg.rid });
      break;
    }
    case 'drop': {
      chunks.delete(ckey(msg.cx, msg.cz));
      break;
    }
    case 'findTrees': {
      const { x0, z0, x1, z1, max } = msg;
      const out = [];
      const c0x = Math.floor(x0 / CHUNK), c1x = Math.floor(x1 / CHUNK);
      const c0z = Math.floor(z0 / CHUNK), c1z = Math.floor(z1 / CHUNK);
      for (let cx = c0x; cx <= c1x && out.length < max; cx++) {
        for (let cz = c0z; cz <= c1z && out.length < max; cz++) {
          let rec = chunks.get(ckey(cx, cz));
          if (!rec) {
            // 未加载：纯函数生成（无编辑，标记待重建）
            rec = buildChunk(cx, cz, null, null, null);
            rec.noEdits = true;
          }
          const bx0 = cx * CHUNK, bz0 = cz * CHUNK;
          const lx0 = Math.max(0, x0 - bx0), lx1 = Math.min(CHUNK - 1, x1 - bx0);
          const lz0 = Math.max(0, z0 - bz0), lz1 = Math.min(CHUNK - 1, z1 - bz0);
          for (let lx = lx0; lx <= lx1; lx++) {
            for (let lz = lz0; lz <= lz1; lz++) {
              const base = (lx * CHUNK + lz) * SY;
              let top = -1;
              for (let y = SY - 1; y >= 0; y--) {
                if (WOOD_IDS.has(rec.blocks[base + y])) { top = y; break; }
              }
              if (top > 0) {
                out.push(bx0 + lx, bz0 + lz, top);
                if (out.length >= max * 3) break;
              }
            }
          }
        }
      }
      self.postMessage({ t: 'findTrees-done', rid: msg.rid, list: out });
      break;
    }
    case 'minimap': {
      // 分片采样：不阻塞 gen 消息（单线程 Worker 的公平调度）
      const { x0, z0, step, n } = msg;
      const rgb = new Uint8Array(n * n * 3);
      const out = [0, 0, 0];
      let row = 0;
      const slice = () => {
        try {
          const end = Math.min(n, row + 32);
          for (; row < end; row++) {
            for (let i = 0; i < n; i++) {
              terrain.minimapColor(x0 + i * step, z0 + row * step, out);
              const o = (row * n + i) * 3;
              rgb[o] = out[0]; rgb[o + 1] = out[1]; rgb[o + 2] = out[2];
            }
          }
        } catch (err) { /* 采样失败以黑色补齐 */ }
        if (row < n) setTimeout(slice, 0);
        else self.postMessage({ t: 'minimap-done', rid: msg.rid, rgb }, [rgb.buffer]);
      };
      slice();
      break;
    }
  }
}
