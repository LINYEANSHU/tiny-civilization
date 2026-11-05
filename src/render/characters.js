// ============================================================
// characters.js — 村民/士兵/商队渲染
// 全部角色共享 7 个 InstancedMesh（头/身/双臂/双腿/手持物），
// 每帧仅更新矩阵 → ~7 draw calls 渲染数百个角色。
// body InstancedMesh 兼作点击拾取目标（instanceId → agentId）。
// ============================================================
import * as THREE from 'three';
import { JOBS } from '../sim/agents.js';

const MAX = 220;

const PARTS = {
  head: { size: [0.46, 0.46, 0.46], offset: [0, 1.62, 0] },
  body: { size: [0.52, 0.7, 0.32], offset: [0, 1.05, 0] },
  armL: { size: [0.15, 0.62, 0.15], offset: [-0.34, 1.36, 0] },
  armR: { size: [0.15, 0.62, 0.15], offset: [0.34, 1.36, 0] },
  legL: { size: [0.2, 0.72, 0.2], offset: [-0.13, 0.72, 0] },
  legR: { size: [0.2, 0.72, 0.2], offset: [0.13, 0.72, 0] },
  item: { size: [0.12, 0.52, 0.12], offset: [0.42, 1.1, 0.18] },
};

// 动物部件（鹿/狼共用，尺寸差异 + 颜色区分）
const ANIMAL_PARTS = {
  abody: { size: [0.44, 0.42, 0.95], offset: [0, 0.72, 0] },
  ahead: { size: [0.26, 0.3, 0.36], offset: [0, 1.0, 0.55] },
  aleg: { size: [0.44, 0.5, 0.38], offset: [0, 0.25, 0.02] },
};
const ANIMAL_COLOR = {
  deer: { body: 0x8a6a42, head: 0x9a7a52, leg: 0x5a4428 },
  wolf: { body: 0x767b86, head: 0x666b76, leg: 0x54575e },
};
const MAX_ANIMAL = 40;

const ITEM_COLORS = {
  lumberjack: 0x8a6a42, miner: 0x9a9aa2, builder: 0xb08a5a,
  soldier: 0xc8ccd4, guard: 0xaeb4bc, trader: 0x7a5a3a, farmer: 0x9a8a5a,
};

// 部件名缓存（sync/syncAnimals 每帧遍历，原实现每帧两次 Object.keys 分配）
const PART_NAMES = Object.keys(PARTS);
const ANIMAL_PART_NAMES = Object.keys(ANIMAL_PARTS);

export class Characters {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);

    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.meshes = {};
    this._idToAgent = [];
    for (const name of PART_NAMES) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const im = new THREE.InstancedMesh(geo, mat, MAX);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.castShadow = true;
      im.receiveShadow = false;
      im.count = 0;
      im.frustumCulled = false;
      im.name = `char_${name}`;
      this.group.add(im);
      this.meshes[name] = im;
    }
    // 阴影：身体投影即可
    this.meshes.body.castShadow = true;
    this.meshes.head.castShadow = true;

    // 动物实例
    for (const name of ANIMAL_PART_NAMES) {
      const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
      const im = new THREE.InstancedMesh(geo, mat, MAX_ANIMAL);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0;
      im.frustumCulled = false;
      this.group.add(im);
      this.meshes[name] = im;
    }

    // 临时对象
    this._m = new THREE.Matrix4();
    this._root = new THREE.Matrix4();
    this._rot = new THREE.Matrix4();
    this._loc = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._e = new THREE.Euler();
    this._v = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._col = new THREE.Color();
  }

  // 每帧同步所有 Agent
  sync(agents, time) {
    const bodyM = this.meshes.body;
    const ids = this._ids || (this._ids = []);   // 复用数组，避免每帧分配
    ids.length = 0;
    let n = 0;
    for (const a of agents.values()) {
      if (n >= MAX) break;
      if (a.hidden) continue;

      const moving = a.state === 'walk';
      const working = a.state === 'work';
      const fighting = a.state === 'fight';
      const swinging = working || fighting;
      const swing = moving ? Math.sin(a.phase * 2.4) * 0.55 : 0;
      const workSwing = swinging ? Math.sin(time * 9 + a.id) * (fighting ? 1.1 : 0.85) : 0;
      const bob = moving ? Math.abs(Math.sin(a.phase * 2.4)) * 0.045 : working ? Math.abs(Math.sin(time * 9)) * 0.02 : 0;
      const scale = a.job === 'child' ? 0.72 : a.job === 'elder' ? 0.92 : 1;

      this._root.makeRotationY(a.yaw);
      this._root.setPosition(a.x, a.y + bob, a.z);
      ids.push(a.id);

      const jobDef = JOBS[a.job] || JOBS.villager;
      const robe = a.data?.color ?? jobDef.robe;
      const itemC = ITEM_COLORS[a.job] ?? 0;

      this._setPart('head', n, 0, 0, scale, a.skin);
      this._setPart('body', n, 0, 0, scale, robe);
      this._setPart('armL', n, -swing * 0.8 + (swinging ? -workSwing * 0.3 : 0), 0, scale, robe);
      this._setPart('armR', n, swing * 0.8 + (swinging ? workSwing : 0), 0, scale, robe);
      this._setPart('legL', n, -swing, 0, scale, 0x4a4038);
      this._setPart('legR', n, swing, 0, scale, 0x4a4038);
      const showItem = swinging || a.job === 'guard' || a.job === 'soldier' || a.job === 'trader';
      if (showItem) this._setPart('item', n, a.job === 'trader' ? 0 : -0.9 + workSwing, 0, scale, itemC, !showItem);
      else this._hide('item', n);
      n++;
    }
    for (const name of PART_NAMES) {
      const im = this.meshes[name];
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
    this._idToAgent = ids;
    bodyM.userData.ids = ids;
  }

  _setPart(name, i, rotX, rotY, scale, color, hide = false) {
    const im = this.meshes[name];
    const P = PARTS[name];
    this._e.set(rotX, rotY, 0);
    this._q.setFromEuler(this._e);
    this._v.set(P.offset[0], P.offset[1] * scale, P.offset[2]);
    if (hide) this._s.set(0.0001, 0.0001, 0.0001);
    else this._s.set(P.size[0] * scale, P.size[1] * scale, P.size[2] * scale);
    this._loc.compose(this._v, this._q, this._s);
    this._m.multiplyMatrices(this._root, this._loc);
    im.setMatrixAt(i, this._m);
    this._col.setHex(color);
    im.setColorAt(i, this._col);
  }

  _hide(name, i) {
    const im = this.meshes[name];
    this._v.set(0, -100, 0);
    this._q.identity();
    this._s.set(0.0001, 0.0001, 0.0001);
    this._loc.compose(this._v, this._q, this._s);
    im.setMatrixAt(i, this._loc);
    im.setColorAt(i, this._col.setHex(0xffffff));
  }

  // 每帧同步动物（鹿/狼）
  syncAnimals(animals) {
    let n = 0;
    for (const a of animals.values()) {
      if (n >= MAX_ANIMAL) break;
      const scale = a.kind === 'wolf' ? 0.72 : 1;
      const bob = a.state === 'walk' ? Math.abs(Math.sin(a.phase)) * 0.05 : 0;
      this._root.makeRotationY(a.yaw);
      this._root.setPosition(a.x, a.y + bob, a.z);
      const C = ANIMAL_COLOR[a.kind];
      this._setAnim('abody', n, scale, C.body);
      this._setAnim('ahead', n, scale, C.head);
      this._setAnim('aleg', n, scale, C.leg);
      n++;
    }
    for (const name of ANIMAL_PART_NAMES) {
      const im = this.meshes[name];
      im.count = n;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
    }
  }

  _setAnim(name, i, scale, color) {
    const im = this.meshes[name];
    const P = ANIMAL_PARTS[name];
    this._q.identity();
    this._v.set(P.offset[0], P.offset[1] * scale, P.offset[2] * scale);
    this._s.set(P.size[0] * scale, P.size[1] * scale, P.size[2] * scale);
    this._loc.compose(this._v, this._q, this._s);
    this._m.multiplyMatrices(this._root, this._loc);
    im.setMatrixAt(i, this._m);
    im.setColorAt(i, this._col.setHex(color));
  }

  // 拾取：返回 agentId 或 null
  pick(raycaster) {
    const im = this.meshes.body;
    if (!im.count) return null;
    const hits = raycaster.intersectObject(im, false);
    if (hits.length && hits[0].instanceId !== undefined) {
      return this._idToAgent[hits[0].instanceId] ?? null;
    }
    return null;
  }
}
