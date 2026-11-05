// ============================================================
// chunkManager.js — 主线程区块管理
// · 视野驱动的加载/卸载队列（按距离优先）
// · 编辑日志（文明建筑/作物/灾害的真实世界改动，持久化并可重放）
// · 高度/水面缓存（寻路、模拟、小地图用）
// · Worker 查询（找树 / 小地图采样）
// ============================================================
import * as THREE from 'three';
import { SEA, CHUNK, SY, VIEW_NEAR, VIEW_FAR } from '../core/config.js';
import { TerrainGen } from './terrain.js';
import { listClaims } from './claims.js';

const ckey = (cx, cz) => (cx + 512) * 1024 + (cz + 512);

// 观察环偏移（常量，按距离排序）—— 每帧零分配
const VIEW_RING = (() => {
  const R = VIEW_NEAR, out = [];
  for (let dx = -R; dx <= R; dx++) {
    for (let dz = -R; dz <= R; dz++) {
      const d2 = dx * dx + dz * dz;
      if (d2 <= R * R + R) out.push({ dx, dz });
    }
  }
  out.sort((a, b) => (a.dx * a.dx + a.dz * a.dz) - (b.dx * b.dx + b.dz * b.dz));
  return out;
})();

export class ChunkManager {
  constructor(scene, solidMat, waterMat, seedStr) {
    this.scene = scene;
    this.solidMat = solidMat;
    this.waterMat = waterMat;
    this.terrain = new TerrainGen(seedStr);   // 主线程镜像实例（选址/寻路采样）

    this.worker = new Worker(new URL('./workers/gen.worker.js', import.meta.url), { type: 'module' });
    this.ready = false;
    this._rid = 1;
    this._pending = new Map();  // rid -> resolve
    this.worker.onmessage = (e) => this._onMsg(e.data);
    this.worker.postMessage({ t: 'init', seed: seedStr });

    this.loaded = new Map();    // key -> {cx, cz, group, meshS, meshW, hmap, wmap, state}
    this.heightCache = new Map(); // key -> {hmap, wmap}  （卸载后仍保留，供模拟）
    this._queued = new Set();
    this._genRids = new Set();   // 未完成的 gen 请求（占用加载配额）
    this._setRids = new Set();   // 未完成的 set 请求（不占配额）
    this._lastSweep = 0;
    this.maxInflight = 6;

    // 编辑日志：key -> { blocks: [[idx,id]...], plants: [[x,y,z,pid,del]...] }（局部坐标）
    this.journal = new Map();

    this.stats = { chunks: 0, queued: 0 };
    this.group = new THREE.Group();
    this.group.name = 'chunks';
    scene.add(this.group);
  }

  whenReady() {
    return new Promise((res) => {
      if (this.ready) res();
      else this._readyRes = res;
    });
  }

  _onMsg(m) {
    if (m.t === 'ready') {
      this.ready = true;
      if (this._readyRes) this._readyRes();
      return;
    }
    if (m.t === 'chunk') {
      this._genRids.delete(m.rid);
      this._setRids.delete(m.rid);
      this._applyMesh(m);
      const p = this._pending.get(m.rid);
      if (p) { this._pending.delete(m.rid); p(); }
    } else if (m.t === 'set-done') {
      const wasGen = this._genRids.delete(m.rid);
      const wasSet = this._setRids.delete(m.rid);
      if (m.error) {
        (window.__workerErrs = window.__workerErrs || []).push(m.error.slice(0, 300));
        if (wasGen) {
          // 生成失败的区块：丢弃占位，允许视野更新重试
          // （Map 迭代中删除当前元素是安全的，无需复制数组）
          for (const [key, rec] of this.loaded) {
            if (rec.state === 'loading') this._unload(key, rec);
          }
        }
      }
    } else if (m.t === 'genMs') {
      // Worker 网格构建耗时（滚动平均）
      this.stats.genMs = this.stats.genMs === undefined ? m.ms : this.stats.genMs * 0.9 + m.ms * 0.1;
    } else if (m.t === 'findTrees-done' || m.t === 'minimap-done') {
      const p = this._pending.get(m.rid);
      if (p) { this._pending.delete(m.rid); p(m); }
    }
  }

  _post(msg, transfer) {
    this.worker.postMessage(msg, transfer || []);
  }

  _applyMesh(m) {
    const key = ckey(m.cx, m.cz);
    let rec = this.loaded.get(key);
    if (!rec) {
      // 区块可能在网格返回前被卸载 → 丢弃
      return;
    }
    // 高度缓存
    this.heightCache.set(key, { hmap: m.hmap, wmap: m.wmap });
    if (this.heightCache.size > 30000) {
      const it = this.heightCache.keys();
      for (let i = 0; i < 2000; i++) { const k = it.next().value; if (k !== undefined) this.heightCache.delete(k); }
    }

    // solid geometry
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.solid.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.solid.nor, 3, true));
    g.setAttribute('uv', new THREE.BufferAttribute(m.solid.uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(m.solid.col, 3, true));
    g.setAttribute('aMat', new THREE.BufferAttribute(m.solid.mat, 1, true));
    g.setAttribute('aSway', new THREE.BufferAttribute(m.solid.sway, 1, true));
    g.setIndex(new THREE.BufferAttribute(m.solid.idx, 1));
    g.computeBoundingSphere();
    if (rec.meshS) {
      rec.meshS.geometry.dispose();
      rec.meshS.geometry = g;
    } else {
      const mesh = new THREE.Mesh(g, this.solidMat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.position.set(m.cx * CHUNK, 0, m.cz * CHUNK);
      rec.group.add(mesh);
      rec.meshS = mesh;
    }

    // water geometry
    if (m.water.idx.length) {
      const gw = new THREE.BufferGeometry();
      gw.setAttribute('position', new THREE.BufferAttribute(m.water.pos, 3));
      gw.setAttribute('normal', new THREE.BufferAttribute(m.water.nor, 3, true));
      gw.setAttribute('uv', new THREE.BufferAttribute(m.water.uv, 2));
      gw.setAttribute('aWave', new THREE.BufferAttribute(m.water.wave, 1, true));
      gw.setIndex(new THREE.BufferAttribute(m.water.idx, 1));
      gw.computeBoundingSphere();
      if (rec.meshW) {
        rec.meshW.geometry.dispose();
        rec.meshW.geometry = gw;
      } else {
        const mesh = new THREE.Mesh(gw, this.waterMat);
        mesh.receiveShadow = true;
        mesh.renderOrder = 1;
        rec.group.add(mesh);
        rec.meshW = mesh;
      }
    } else if (rec.meshW) {
      rec.meshW.geometry.dispose();
      rec.group.remove(rec.meshW);
      rec.meshW = null;
    }
    rec.state = 'ready';
    this._queued.delete(ckey(m.cx, m.cz));
    if (this.onChunkReady) this.onChunkReady(m.cx, m.cz);
  }

  // ---------- 视野更新 ----------
  update(camX, camZ) {
    const ccx = Math.floor(camX / CHUNK), ccz = Math.floor(camZ / CHUNK);

    // 入队缺失（预计算环序，近处优先，零分配）
    if (this._genRids.size < this.maxInflight) {
      for (const o of VIEW_RING) {
        if (this._genRids.size >= this.maxInflight) break;
        const cx = ccx + o.dx, cz = ccz + o.dz;
        if (cx < -313 || cx > 313 || cz < -313 || cz > 313) continue;
        const key = ckey(cx, cz);
        if (this.loaded.has(key) || this._queued.has(key)) continue;
        this._queued.add(key);
        const rec = { cx, cz, group: new THREE.Group(), meshS: null, meshW: null, state: 'loading' };
        this.loaded.set(key, rec);
        this.group.add(rec.group);
        this._requestGen(cx, cz);
      }
    }

    // 卸载远处（降频检查：每 500ms 一次）
    const now = performance.now();
    if (now - this._lastSweep > 500) {
      this._lastSweep = now;
      const farR = VIEW_FAR * VIEW_FAR;
      // Map 迭代中删除当前元素安全，避免每 500ms 复制整个 loaded 数组
      for (const [key, rec] of this.loaded) {
        const dx = rec.cx - ccx, dz = rec.cz - ccz;
        if (dx * dx + dz * dz > farR) this._unload(key, rec);
      }
      this.stats.chunks = this.loaded.size;
      this.stats.queued = this._genRids.size + this._setRids.size;
    }
  }

  _requestGen(cx, cz) {
    const rid = this._rid++;
    const pending = new Promise((res) => this._pending.set(rid, res));
    this._genRids.add(rid);
    const { blocks, plants } = this._editsFor(cx, cz);
    const border = this._borderEditsFor(cx, cz);
    this._post({ t: 'gen', cx, cz, rid, blockEdits: blocks, plantEdits: plants, borderEdits: border });
    return pending;
  }

  _unload(key, rec) {
    if (rec.meshS) { rec.meshS.geometry.dispose(); rec.meshS = null; }
    if (rec.meshW) { rec.meshW.geometry.dispose(); rec.meshW = null; }
    this.group.remove(rec.group);
    this.loaded.delete(key);
    this._queued.delete(key);   // 允许将来再次进入视野时重新加载
    this._post({ t: 'drop', cx: rec.cx, cz: rec.cz });
  }

  // ---------- 编辑日志 ----------
  _journalFor(cx, cz, create) {
    const key = ckey(cx, cz);
    let j = this.journal.get(key);
    if (!j && create) { j = { blocks: [], plants: [] }; this.journal.set(key, j); }
    return j;
  }

  _editsFor(cx, cz) {
    const j = this.journal.get(ckey(cx, cz));
    // 直接引用（postMessage 结构化克隆，Worker 只读不改写这些数组）
    return j ? { blocks: j.blocks, plants: j.plants } : { blocks: null, plants: null };
  }

  _borderEditsFor(cx, cz) {
    const out = [];
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const j = this.journal.get(ckey(cx + dx, cz + dz));
      if (!j) continue;
      const nx0 = (cx + dx) * CHUNK, nz0 = (cz + dz) * CHUNK;
      for (const packed of j.blocks) {
        const lidx = packed & 32767, id = packed >>> 15;
        const col = (lidx / SY) | 0;
        const y = lidx - col * SY;
        const lx2 = (col / 16) | 0, lz2 = col % 16;
        const wx = nx0 + lx2, wz = nz0 + lz2;
        // 仅保留靠近本区块边缘 3 格内的编辑
        if (wx >= x0 - 3 && wx <= x0 + CHUNK + 2 && wz >= z0 - 3 && wz <= z0 + CHUNK + 2) {
          out.push([wx, y, wz, id]);
        }
      }
    }
    return out.length ? out : null;
  }

  /**
   * 应用方块编辑：写日志 + 通知 worker（加载中的区块自动重网格）
   * edits: [[wx, y, wz, id], ...]
   * 返回受影响区块 key 集合
   */
  applyBlockEdits(edits) {
    const touched = new Set();
    const byChunk = new Map();
    for (const [wx, y, wz, id] of edits) {
      if (y < 0 || y >= SY) continue;
      const cx = Math.floor(wx / CHUNK), cz = Math.floor(wz / CHUNK);
      const key = ckey(cx, cz);
      touched.add(key);
      const j = this._journalFor(cx, cz, true);
      const lx = wx - cx * CHUNK, lz = wz - cz * CHUNK;
      const idx = (lx * CHUNK + lz) * SY + y;
      const packed = idx | (id << 15);   // idx 15bit + id 6bit
      // 日志去重：同一局部索引只保留最后一次编辑。
      // Worker 顺序应用时「后写覆盖先写」，仅保留末次结果与完整重放等价，
      // 可防止火灾/洪水/反复砍种等场景令日志与存档体积无界增长。
      if (!j.blockIdx) {
        j.blockIdx = new Map();
        for (let i = 0; i < j.blocks.length; i++) j.blockIdx.set(j.blocks[i] & 32767, i);
      }
      const at = j.blockIdx.get(idx);
      if (at === undefined) { j.blockIdx.set(idx, j.blocks.length); j.blocks.push(packed); }
      else j.blocks[at] = packed;
      if (!byChunk.has(key)) byChunk.set(key, []);
      byChunk.get(key).push(packed);
    }
    for (const [key, list] of byChunk) {
      const rec = this.loaded.get(key);
      if (rec && rec.state === 'ready') {
        const cx = rec.cx, cz = rec.cz;
        const rid = this._rid++;
        this._setRids.add(rid);
        this._post({ t: 'set', cx, cz, rid, blockEdits: list, plantEdits: null });
      }
    }
    return touched;
  }

  /** plantEdits: [[wx, y, wz, plantId, del], ...] */
  /** plantEdits: [wx, y, wz, plantId, del], ...]
   * opts.journal=false 表示临时视觉编辑（作物生长等），不入日志，靠状态重同步恢复 */
  applyPlantEdits(edits, opts) {
    const doJournal = !opts || opts.journal !== false;
    const byChunk = new Map();
    for (const e of edits) {
      const [wx, , wz] = e;
      const cx = Math.floor(wx / CHUNK), cz = Math.floor(wz / CHUNK);
      if (doJournal) {
        const j = this._journalFor(cx, cz, true);
        j.plants.push(e);
      }
      const key = ckey(cx, cz);
      if (!byChunk.has(key)) byChunk.set(key, []);
      byChunk.get(key).push(e);
    }
    for (const [key, list] of byChunk) {
      const rec = this.loaded.get(key);
      if (rec && rec.state === 'ready') {
        const rid = this._rid++;
        this._setRids.add(rid);
        this._post({ t: 'set', cx: rec.cx, cz: rec.cz, rid, blockEdits: null, plantEdits: list });
      }
    }
  }

  // ---------- 查询 ----------
  groundAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const hc = this.heightCache.get(ckey(cx, cz));
    if (hc) {
      const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
      return hc.hmap[lx * CHUNK + lz];
    }
    return this.terrain.sample(x, z).h;
  }

  waterTopAt(x, z) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    const hc = this.heightCache.get(ckey(cx, cz));
    if (hc) {
      const lx = x - cx * CHUNK, lz = z - cz * CHUNK;
      return hc.wmap[lx * CHUNK + lz] || 0;
    }
    return this.terrain.sample(x, z).h < SEA ? SEA : 0;
  }

  surfaceY(x, z) {
    const w = this.waterTopAt(x, z);
    if (w > 0) return w;
    return this.groundAt(x, z);
  }

  biomeAt(x, z) {
    return this.terrain.sample(x, z).biome;
  }

  findTrees(x0, z0, x1, z1, max = 24) {
    const rid = this._rid++;
    return new Promise((res) => {
      this._pending.set(rid, (m) => res(m.list));
      this._post({ t: 'findTrees', rid, x0, z0, x1, z1, max });
    });
  }

  requestMinimap(x0, z0, step, n) {
    const rid = this._rid++;
    return new Promise((res) => {
      this._pending.set(rid, (m) => res(m.rgb));
      this._post({ t: 'minimap', rid, x0, z0, step, n });
    });
  }

  /** 区块内原始方块查询（点选建筑用）：返回该列顶方块与聚落标记 */
  /** 把聚落领地登记同步到 Worker，并重建受影响区块 */
  syncClaimsToWorker() {
    const claims = listClaims();
    this._post({ t: 'claims', list: claims.map(c => ({ x: c.x, z: c.z, r: c.r })) });
    // Map 迭代中删除当前元素安全（_unload 内部会 delete）
    for (const [key, rec] of this.loaded) {
      const x0 = rec.cx * CHUNK, z0 = rec.cz * CHUNK;
      const x1 = x0 + CHUNK - 1, z1 = z0 + CHUNK - 1;
      for (const c of claims) {
        const R = c.r + 4; // 树冠余量
        if (x1 >= c.x - R && x0 <= c.x + R && z1 >= c.z - R && z0 <= c.z + R) {
          this._unload(key, rec);
          break;
        }
      }
    }
  }

  dispose() {
    this.worker.terminate();
    for (const [, rec] of this.loaded) {
      if (rec.meshS) rec.meshS.geometry.dispose();
      if (rec.meshW) rec.meshW.geometry.dispose();
    }
  }
}
