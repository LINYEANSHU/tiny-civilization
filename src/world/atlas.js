// ============================================================
// atlas.js — 程序化生成 16×16 像素风纹理图集（Canvas 2D）
// 移植自 WorldForge 并扩展文明贴图
// ============================================================
import * as THREE from 'three';
import { T } from './blocks.js';
import { seededRandom } from '../core/rng.js';

const TS = 16;      // 单格像素
const GRID = 16;    // 16×16 格
const SIZE = TS * GRID;

export function buildAtlas(seedStr) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d');

  const rand = seededRandom(seedStr, 'atlas');

  const ox = (t) => (t % GRID) * TS;
  const oy = (t) => Math.floor(t / GRID) * TS;

  function px(t, x, y, c, a = 1) {
    if (a < 1) ctx.globalAlpha = a;
    ctx.fillStyle = c;
    ctx.fillRect(ox(t) + x, oy(t) + y, 1, 1);
    ctx.globalAlpha = 1;
  }
  function rect(t, x, y, w, h, c) {
    ctx.fillStyle = c;
    ctx.fillRect(ox(t) + x, oy(t) + y, w, h);
  }
  function clear(t) { ctx.clearRect(ox(t), oy(t), TS, TS); }

  function speckle(t, palette, weights = null) {
    for (let y = 0; y < TS; y++) {
      for (let x = 0; x < TS; x++) {
        let c;
        if (weights) {
          let r = rand(), acc = 0;
          c = palette[palette.length - 1];
          for (let i = 0; i < palette.length; i++) {
            acc += weights[i];
            if (r <= acc) { c = palette[i]; break; }
          }
        } else {
          c = palette[(rand() * palette.length) | 0];
        }
        px(t, x, y, c);
      }
    }
  }
  function stripes(t, cols) {
    for (let x = 0; x < TS; x++) {
      const base = cols[(rand() * cols.length) | 0];
      for (let y = 0; y < TS; y++) {
        const c = rand() < 0.18 ? cols[(rand() * cols.length) | 0] : base;
        px(t, x, y, c);
      }
    }
  }
  function jitterLine(t, x0, y0, len, dir, c) {
    for (let i = 0; i < len; i++) {
      const x = dir === 'h' ? x0 + i : x0;
      const y = dir === 'h' ? y0 : y0 + i;
      if (x >= 0 && x < TS && y >= 0 && y < TS) px(t, x, y, c);
    }
  }

  // ---------- 地形贴图 ----------
  speckle(T.GRASS_TOP, ['#6cae44', '#63a03c', '#75b84c', '#5c9638', '#6fb647', '#68a941']);

  speckle(T.DIRT, ['#8a6a44', '#7d5e3c', '#93724b', '#755736', '#86663f']);
  for (let i = 0; i < 10; i++) px(T.DIRT, (rand() * TS) | 0, (rand() * TS) | 0, '#6a4d30');

  ctx.drawImage(cv, ox(T.DIRT), oy(T.DIRT), TS, TS, ox(T.GRASS_SIDE), oy(T.GRASS_SIDE), TS, TS);
  for (let x = 0; x < TS; x++) {
    const h = 2 + ((rand() * 3) | 0);
    for (let y = 0; y < h; y++) {
      px(T.GRASS_SIDE, x, y, ['#6cae44', '#63a03c', '#75b84c'][(rand() * 3) | 0]);
    }
    px(T.GRASS_SIDE, x, h, '#55902f');
  }

  speckle(T.STONE, ['#8f9598', '#84898d', '#9aa1a4', '#7c8286', '#93999c']);
  for (let i = 0; i < 5; i++) {
    jitterLine(T.STONE, (rand() * TS) | 0, (rand() * TS) | 0, 2 + ((rand() * 3) | 0), rand() < 0.5 ? 'h' : 'v', '#6f7579');
  }

  speckle(T.SAND, ['#e0d7a6', '#d7cd97', '#e8dfb2', '#cfc48d', '#ddd39f']);
  for (let i = 0; i < 8; i++) px(T.SAND, (rand() * TS) | 0, (rand() * TS) | 0, '#c2b57c');

  // 砂岩（文明扩展：水平层理）
  speckle(T.SANDSTONE, ['#d9cf9f', '#d0c694', '#e0d6a8', '#c8bd88']);
  for (const y of [3, 7, 11, 15]) rect(T.SANDSTONE, 0, y, TS, 1, '#b3a878');
  for (let i = 0; i < 5; i++) px(T.SANDSTONE, (rand() * TS) | 0, (rand() * TS) | 0, '#c2b57c');

  stripes(T.LOG_SIDE, ['#6b4e2e', '#63472a', '#715332', '#5d4429']);
  for (let i = 0; i < 3; i++) {
    const x = (rand() * TS) | 0, y = (rand() * 10) | 0;
    rect(T.LOG_SIDE, x, y, 1, 3, '#4e3a20');
  }
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    const ring = ((d | 0) % 2 === 0) ? '#a3814f' : '#8f7040';
    px(T.LOG_TOP, x, y, d > 6.5 ? '#63472a' : ring);
  }

  speckle(T.BIRCH_SIDE, ['#e5e2d7', '#dedbd0', '#ece9df', '#d8d5ca']);
  for (let i = 0; i < 7; i++) {
    const x = (rand() * 13) | 0, y = (rand() * TS) | 0, w = 2 + ((rand() * 3) | 0);
    rect(T.BIRCH_SIDE, x, y, w, 1, '#3a3a34');
    if (rand() < 0.5) rect(T.BIRCH_SIDE, x + 1, Math.min(TS - 1, y + 1), 1, 1, '#565650');
  }

  stripes(T.SPRUCE_SIDE, ['#503b26', '#48351f', '#584230', '#40301d']);

  speckle(T.LEAVES, ['#4d8a33', '#447c2c', '#56953b', '#3f7327', '#4b8630']);
  for (let i = 0; i < 14; i++) px(T.LEAVES, (rand() * TS) | 0, (rand() * TS) | 0, '#63a445');
  for (let i = 0; i < 8; i++) px(T.LEAVES, (rand() * TS) | 0, (rand() * TS) | 0, '#356a20');

  speckle(T.LEAVES_SPRUCE, ['#2f5d33', '#2a532e', '#356639', '#254a29', '#316035']);
  for (let i = 0; i < 10; i++) px(T.LEAVES_SPRUCE, (rand() * TS) | 0, (rand() * TS) | 0, '#3d7442');

  function planks(t, base, seam, nail) {
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      px(t, x, y, base[(rand() * base.length) | 0]);
    }
    for (const y of [3, 7, 11, 15]) rect(t, 0, y, TS, 1, seam);
    rect(t, 4, 0, 1, 4, seam); rect(t, 11, 4, 1, 4, seam);
    rect(t, 6, 8, 1, 4, seam); rect(t, 13, 12, 1, 4, seam);
    px(t, 2, 1, nail); px(t, 9, 5, nail); px(t, 4, 9, nail); px(t, 11, 13, nail);
  }
  planks(T.PLANK, ['#b08a5a', '#a88355', '#b89261', '#a07d4f'], '#8a6a42', '#8f6f45');
  planks(T.PLANK_DARK, ['#7d5c38', '#755634', '#856345', '#6d4f2f'], '#57402a', '#5e462d');

  // 茅草（文明扩展：斜向草茎）
  speckle(T.THATCH, ['#c2a45c', '#b69850', '#ccb066', '#aa8c48']);
  for (let i = 0; i < 12; i++) {
    const x = (rand() * TS) | 0, y = (rand() * TS) | 0, len = 3 + ((rand() * 5) | 0);
    for (let j = 0; j < len; j++) {
      const xx = x + j, yy = y + j;
      if (xx < TS && yy < TS) px(T.THATCH, xx, yy, '#a0803e');
    }
  }

  // 焦木（文明扩展）
  speckle(T.CHARRED, ['#3a332e', '#2e2824', '#453d36', '#241f1c']);
  for (let i = 0; i < 6; i++) {
    const x = (rand() * TS) | 0, y = (rand() * TS) | 0;
    rect(T.CHARRED, x, y, 1, 2 + ((rand() * 3) | 0), '#57493c');
  }

  // 仙人掌
  speckle(T.CACTUS_SIDE, ['#3e7d3a', '#377234', '#468841']);
  for (const x of [2, 7, 12]) {
    for (let y = 0; y < TS; y++) {
      if (y % 3 !== 2) px(T.CACTUS_SIDE, x + ((y >> 2) % 2), y, '#5aa253');
    }
  }
  for (let i = 0; i < 5; i++) px(T.CACTUS_SIDE, (rand() * TS) | 0, (rand() * TS) | 0, '#e8e2c8');
  speckle(T.CACTUS_TOP, ['#4a8a44', '#427e3d', '#52954b']);
  ctx.drawImage(cv, ox(T.CACTUS_SIDE), oy(T.CACTUS_SIDE), TS, TS, ox(T.CACTUS_TOP), oy(T.CACTUS_TOP), TS, TS);

  {
    const pts = [];
    for (let i = 0; i < 8; i++) pts.push([rand() * TS, rand() * TS, 0.82 + rand() * 0.3]);
    for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
      let bd = 1e9, b2 = 1e9, bi = 0;
      for (let i = 0; i < pts.length; i++) {
        let dx = Math.abs(x - pts[i][0]); dx = Math.min(dx, TS - dx);
        let dy = Math.abs(y - pts[i][1]); dy = Math.min(dy, TS - dy);
        const d = dx * dx + dy * dy;
        if (d < bd) { b2 = bd; bd = d; bi = i; } else if (d < b2) b2 = d;
      }
      const shade = pts[bi][2];
      const g = Math.round(140 * shade);
      const edge = Math.sqrt(b2) - Math.sqrt(bd) < 0.9;
      const c = edge ? '#6c7073' : `rgb(${g + 12},${g + 16},${g + 18})`;
      px(T.COBBLE, x, y, c);
    }
  }

  // 石砖（文明扩展：整齐大块）
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const row = (y / 8) | 0;
    const offset = row % 2 === 0 ? 0 : 4;
    const isMortar = y % 8 === 7 || (x + offset) % 8 === 7;
    px(T.STONEBRICK, x, y, isMortar ? '#5f6468' : ['#8b9296', '#93999d', '#848b8f'][(rand() * 3) | 0]);
  }

  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const row = (y / 4) | 0;
    const offset = row % 2 === 0 ? 0 : 4;
    const isMortar = y % 4 === 3 || (x + offset) % 8 === 7;
    px(T.BRICK, x, y, isMortar ? '#cfc6bb' : ['#9e5638', '#a75d3d', '#96502f', '#a25a3a'][(rand() * 4) | 0]);
  }

  speckle(T.SNOW, ['#f4f7fa', '#eef2f6', '#fafcfe', '#e9eef3']);
  ctx.drawImage(cv, ox(T.DIRT), oy(T.DIRT), TS, TS, ox(T.SNOW_SIDE), oy(T.SNOW_SIDE), TS, TS);
  for (let x = 0; x < TS; x++) {
    const h = 3 + ((rand() * 3) | 0);
    for (let y = 0; y < h; y++) px(T.SNOW_SIDE, x, y, ['#f4f7fa', '#eef2f6', '#fafcfe'][(rand() * 3) | 0]);
  }

  clear(T.GLASS);
  rect(T.GLASS, 0, 0, TS, 1, '#dfeef2');
  rect(T.GLASS, 0, TS - 1, TS, 1, '#cfe2e8');
  rect(T.GLASS, 0, 0, 1, TS, '#d5e7ec');
  rect(T.GLASS, TS - 1, 0, 1, TS, '#cfe2e8');
  for (let i = 0; i < 5; i++) px(T.GLASS, 4 + i, 10 - i, '#ffffff', 0.55);
  for (let i = 0; i < 3; i++) px(T.GLASS, 9 + i, 13 - i, '#ffffff', 0.4);
  px(T.GLASS, 1, 1, '#eaf5f8'); px(T.GLASS, TS - 2, 1, '#c8dce2');
  px(T.GLASS, 1, TS - 2, '#c8dce2'); px(T.GLASS, TS - 2, TS - 2, '#bcd4db');

  speckle(T.GLOW, ['#e8a33c', '#dd9a35', '#f0b04a']);
  for (let i = 0; i < 10; i++) {
    const x = (rand() * TS) | 0, y = (rand() * TS) | 0;
    rect(T.GLOW, x, y, 2, 2, '#f7c95c');
    px(T.GLOW, x, y, '#ffe9a8');
  }

  speckle(T.GRAVEL, ['#97918a', '#8a847d', '#a49e96', '#7d7770', '#8f8579']);
  for (let i = 0; i < 9; i++) {
    const x = (rand() * 14) | 0, y = (rand() * 14) | 0;
    rect(T.GRAVEL, x, y, 2, 2, ['#aca69e', '#746e67'][(rand() * 2) | 0]);
  }

  speckle(T.PATH_TOP, ['#b59a5f', '#ab9055', '#bfa468', '#a08550', '#b6995c']);
  for (let i = 0; i < 7; i++) px(T.PATH_TOP, (rand() * TS) | 0, (rand() * TS) | 0, '#cbb37e');
  ctx.drawImage(cv, ox(T.DIRT), oy(T.DIRT), TS, TS, ox(T.PATH_SIDE), oy(T.PATH_SIDE), TS, TS);
  for (let x = 0; x < TS; x++) {
    const h = 2 + ((rand() * 2) | 0);
    for (let y = 0; y < h; y++) px(T.PATH_SIDE, x, y, ['#b59a5f', '#ab9055'][(rand() * 2) | 0]);
  }

  // 耕地
  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const furrow = y % 4 === 1 || y % 4 === 2;
    px(T.FARMLAND, x, y, furrow ? ['#4a311d', '#523822'][(rand() * 2) | 0] : ['#5c3f26', '#66482c', '#583c24'][(rand() * 3) | 0]);
  }
  // 干裂耕地（干旱状态）
  speckle(T.DRYFARM, ['#96805a', '#8b7650', '#a08a60']);
  for (let i = 0; i < 8; i++) {
    let x = (rand() * TS) | 0, y = (rand() * TS) | 0;
    for (let j = 0; j < 5; j++) {
      px(T.DRYFARM, x, y, '#6b5a38');
      x = (x + 1) % TS; y = (y + ((j % 2) ? 1 : 0)) % TS;
    }
  }

  for (let y = 0; y < TS; y++) for (let x = 0; x < TS; x++) {
    const ridge = x % 5 === 0;
    px(T.PUMPKIN_SIDE, x, y, ridge ? '#c4741f' : ['#d8842c', '#dd8a31', '#d07d27'][(rand() * 3) | 0]);
  }
  speckle(T.PUMPKIN_TOP, ['#c97726', '#c27122', '#d07d28']);
  rect(T.PUMPKIN_TOP, 6, 6, 3, 3, '#8f6f2a');
  rect(T.PUMPKIN_TOP, 7, 5, 1, 5, '#7a8f3d'); rect(T.PUMPKIN_TOP, 5, 7, 5, 1, '#7a8f3d');
  px(T.PUMPKIN_TOP, 7, 7, '#9aad4e');

  speckle(T.WATER, ['#3f76e4', '#3a70dd', '#4580ea', '#366ad4']);

  // ---------- 十字植物（透明背景） ----------
  function blades(t, colors, n, hMin, hMax, lean = 2) {
    clear(t);
    for (let i = 0; i < n; i++) {
      let x = 1 + ((rand() * (TS - 2)) | 0);
      const h = hMin + ((rand() * (hMax - hMin)) | 0);
      const c = colors[(rand() * colors.length) | 0];
      const dir = rand() < 0.5 ? -1 : 1;
      for (let j = 0; j < h; j++) {
        const y = TS - 1 - j;
        if (j > h * 0.55 && j % 3 === 0) x += (dir * lean > 0 ? 1 : -1) * (rand() < 0.7 ? 1 : 0);
        if (x < 0) x = 0; if (x > TS - 1) x = TS - 1;
        px(t, x, y, j === h - 1 ? colors[0] : c);
      }
    }
  }
  blades(T.TALLGRASS, ['#5da13f', '#549537', '#67ad48', '#4c8a30'], 8, 7, 13);

  function flower(t, petal, center) {
    clear(t);
    for (let y = 8; y < TS; y++) px(t, 7, y, '#3f7d2a');
    px(t, 6, 11, '#4c8a30'); px(t, 8, 12, '#4c8a30');
    const cx = 7, cy = 5;
    for (const [dx, dy] of [[0, -2], [0, 2], [-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      px(t, cx + dx, cy + dy, petal);
    }
    px(t, cx, cy, center);
    px(t, cx, cy - 1, petal); px(t, cx, cy + 1, petal);
    px(t, cx - 1, cy, petal); px(t, cx + 1, cy, petal);
  }
  flower(T.FLOWER_RED, '#d64545', '#f4d03f');
  flower(T.FLOWER_YELLOW, '#ecc94b', '#b8860b');

  // 小麦（成熟）
  clear(T.WHEAT);
  for (const x of [2, 5, 8, 11, 14]) {
    const h = 10 + ((rand() * 4) | 0);
    for (let j = 0; j < h; j++) px(T.WHEAT, x, TS - 1 - j, j > h * 0.4 ? '#d4b45a' : '#b99a42');
    for (let j = h - 6; j < h; j += 2) {
      px(T.WHEAT, x - 1, TS - 1 - j, '#e0c46e');
      px(T.WHEAT, x + 1, TS - 1 - j, '#e0c46e');
    }
  }

  // 麦苗（文明扩展：矮而嫩绿）
  clear(T.WHEAT_YOUNG);
  for (const x of [3, 6, 9, 12]) {
    const h = 4 + ((rand() * 3) | 0);
    for (let j = 0; j < h; j++) px(T.WHEAT_YOUNG, x, TS - 1 - j, j === h - 1 ? '#8cc46a' : '#6aa848');
  }

  // 枯灌木（文明扩展）
  clear(T.DEADBUSH);
  for (const bx of [4, 7, 10]) {
    let x = bx;
    const h = 5 + ((rand() * 4) | 0);
    for (let j = 0; j < h; j++) {
      const y = TS - 1 - j;
      px(T.DEADBUSH, x, y, '#8a6a3a');
      if (j > 2 && rand() < 0.5) px(T.DEADBUSH, x + (rand() < 0.5 ? 1 : -1), y, '#7a5c30');
      if (j === 2) px(T.DEADBUSH, x - 2, y - 1, '#7a5c30');
      if (j === 3) px(T.DEADBUSH, x + 2, y - 1, '#8a6a3a');
    }
  }

  function mushroom(t, cap, dot) {
    clear(t);
    rect(t, 7, 11, 2, 4, '#e8e2d0');
    rect(t, 4, 8, 8, 3, cap);
    rect(t, 5, 7, 6, 1, cap);
    if (dot) {
      px(t, 6, 8, '#f2ece2'); px(t, 9, 9, '#f2ece2'); px(t, 10, 8, '#f2ece2');
    }
  }
  mushroom(T.MUSHROOM_RED, '#c94a3a', true);
  mushroom(T.MUSHROOM_BROWN, '#9a7b52', false);

  clear(T.REED);
  for (const x of [3, 7, 11, 14]) {
    for (let j = 0; j < TS; j++) {
      px(T.REED, x, TS - 1 - j, j % 5 === 4 ? '#8cc46a' : '#5f9e3e');
    }
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

// 单独的平铺水纹（32×32，可动画 offset）
export function buildWaterTexture(seedStr) {
  const S = 32;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const rand = seededRandom(seedStr, 'water');
  const pal = ['#3f76e4', '#3a70dd', '#4580ea', '#366ad4', '#427ae6'];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    ctx.fillStyle = pal[(rand() * pal.length) | 0];
    ctx.fillRect(x, y, 1, 1);
  }
  for (let i = 0; i < 26; i++) {
    const x = (rand() * S) | 0, y = (rand() * S) | 0, len = 3 + ((rand() * 5) | 0);
    ctx.fillStyle = rand() < 0.5 ? '#5b8cf0' : '#6d9af4';
    ctx.fillRect(x, y, Math.min(len, S - x), 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
