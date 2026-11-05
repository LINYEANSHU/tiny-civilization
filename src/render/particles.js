// ============================================================
// particles.js — 天气粒子（雨/雪/沙尘）与火焰烟雾
// 粒子只在相机附近生成，数量受强度控制。
// ============================================================
import * as THREE from 'three';
import { clamp } from '../core/noise.js';

const RAIN_N = 1300;
const SNOW_N = 900;
const FIRE_N = 260;

export class Particles {
  constructor(scene) {
    this.scene = scene;
    this.intensity = 0;         // 当前混合强度
    this.targetI = 0;
    this.mode = 'none';         // none | rain | snow | dust

    // ---------- 降水/沙尘 ----------
    this._makeField('rain', RAIN_N, 0x7fa8d8, 0.09, 0.5);
    this._makeField('snow', SNOW_N, 0xffffff, 0.11, 0.75);
    this._makeField('dust', 500, 0xc8b088, 0.13, 0.55);
    this._active = null;

    // ---------- 火焰（加色） ----------
    const fgeo = new THREE.BufferGeometry();
    this._firePos = new Float32Array(FIRE_N * 3);
    this._fireSeed = new Float32Array(FIRE_N);
    for (let i = 0; i < FIRE_N; i++) { this._firePos[i * 3 + 1] = -999; this._fireSeed[i] = Math.random(); }
    fgeo.setAttribute('position', new THREE.BufferAttribute(this._firePos, 3));
    const fmat = new THREE.PointsMaterial({
      color: 0xff7a2a, size: 0.55, transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true,
    });
    this.fire = new THREE.Points(fgeo, fmat);
    this.fire.frustumCulled = false;
    this.fire.visible = false;
    scene.add(this.fire);

    this._t = 0;
  }

  _makeField(name, n, color, size, opacity) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    const vel = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 90;
      pos[i * 3 + 1] = Math.random() * 50;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 90;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color, size, transparent: true, opacity, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    pts.visible = false;
    pts.userData = { pos, vel, n };
    this.scene.add(pts);
    this[name] = pts;
  }

  // 由 main 每帧调用：weatherState → 粒子模式
  setWeather(state, intensity) {
    // state: 'clear'|'cloud'|'rain'|'storm'|'snow'|'blizzard'|'fog'|'sandstorm'
    let mode = 'none';
    if (state === 'rain' || state === 'storm') mode = 'rain';
    else if (state === 'snow' || state === 'blizzard') mode = 'snow';
    else if (state === 'sandstorm') mode = 'dust';
    this.mode = mode;
    this.targetI = mode === 'none' ? 0 : (state === 'storm' || state === 'blizzard' ? 1 : 0.65) * intensity;
  }

  update(dt, camPos, fireCells, windX) {
    this._t += dt;
    this.intensity += clamp(this.targetI - this.intensity, -dt * 0.7, dt * 0.7);

    // 切换活动场
    for (const name of ['rain', 'snow', 'dust']) {
      const pts = this[name];
      pts.visible = (name === this.mode && this.intensity > 0.02);
      if (pts.visible) {
        pts.material.opacity = (name === 'rain' ? 0.5 : name === 'snow' ? 0.75 : 0.55) * this.intensity;
        this._stepField(pts, dt, camPos, name);
      }
    }

    // 火焰
    this._stepFire(dt, fireCells || []);
  }

  _stepField(pts, dt, camPos, kind) {
    const { pos, vel, n } = pts.userData;
    const speed = kind === 'rain' ? 24 : kind === 'snow' ? 2.2 : 1.2;
    const wind = kind === 'rain' ? 4 : kind === 'snow' ? 2.2 : 14;
    for (let i = 0; i < n; i++) {
      let x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
      y -= speed * dt * (0.75 + (i % 7) * 0.08);
      x += Math.sin(this._t * (kind === 'snow' ? 1.1 : 3) + i) * wind * dt;
      z += Math.cos(this._t * 0.9 + i * 1.7) * wind * dt * (kind === 'dust' ? 2 : 0.4);
      // 回收：出界或落地
      const dx = x - camPos.x, dz = z - camPos.z;
      if (y < camPos.y - 14 || Math.abs(dx) > 48 || Math.abs(dz) > 48) {
        x = camPos.x + (Math.random() - 0.5) * 88;
        z = camPos.z + (Math.random() - 0.5) * 88;
        y = camPos.y + 18 + Math.random() * 26;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    pts.geometry.attributes.position.needsUpdate = true;
  }

  _stepFire(dt, cells) {
    const vis = cells.length > 0;
    this.fire.visible = vis;
    if (!vis) return;
    const n = FIRE_N;
    for (let i = 0; i < n; i++) {
      const cell = cells[i % cells.length];
      const s = this._fireSeed[i];
      let y = this._firePos[i * 3 + 1];
      if (y < -500 || y > cell.y + 2.5) {
        this._firePos[i * 3] = cell.x + (s - 0.5) * 1.6;
        this._firePos[i * 3 + 1] = cell.y - 1 + Math.random() * 0.5;
        this._firePos[i * 3 + 2] = cell.z + (((s * 7) % 1) - 0.5) * 1.6;
      } else {
        this._firePos[i * 3 + 1] += dt * (2.2 + s * 2);
        this._firePos[i * 3] += Math.sin(this._t * 3 + i) * dt * 0.6;
      }
    }
    this.fire.geometry.attributes.position.needsUpdate = true;
  }
}
