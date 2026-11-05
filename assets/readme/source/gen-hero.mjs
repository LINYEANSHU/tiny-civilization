// ============================================================
// gen-hero.mjs — 生成 README 首屏 hero（纯 SVG，体素文明主题）
// 运行：node assets/readme/source/gen-hero.mjs
// 输出：assets/readme/hero.svg（中文）与 hero-en.svg（英文）
// 等距（isometric 2:1）投影体素场景：草地台地、住宅、风车、
// 麦田、树木、村民、水井与海岸 —— 由 cube()/tile() 辅助生成。
// ============================================================
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- 调色板（体素文明：苔绿 / 暖木 / 羊皮纸） ----------
const P = {
  bg: '#121812', ink: '#ECE7DA', muted: '#9AA48E',
  grass1: '#7DBB54', grass2: '#74B14C', gTopL: '#5E9440', gTopR: '#6CA34A',
  dirt1: '#B08A5A', dirtL: '#8C6C44', dirtR: '#9E7B4F',
  sand1: '#D9C08A', sandL: '#B39A67', sandR: '#C6AC76',
  water: '#5A8FD0', waterL: '#3E6EA8', waterR: '#4A7CBB',
  plasterL: '#BFB6A0', plasterR: '#D2C9B3',
  roofL: '#8A3F2C', roofR: '#9E4A35',
  wood: '#C9974F',
  leaf: '#4E8A3C', leafL: '#3B6C2D', leafR: '#437634',
  wheat: '#E3C468', wheatStalk: '#B99A45',
  stone: '#AEB2A8', stoneL: '#8B8F86', stoneR: '#9CA096',
};

// ---------- 等距投影辅助 ----------
const HW = 22;            // 地块半宽
const HH = 11;            // 地块半高（2:1）
const BH = 16;            // 每格方块像素高
const OX = 960, OY = 100; // 场景原点（绘制网格 1,1 顶点）

function iso(x, y, h = 0) {
  return [OX + (x - y) * HW, OY + (x + y) * HH - h * BH];
}
function r1(v) { return Math.round(v * 10) / 10; }
function poly(pts, fill, extra = '') {
  const str = typeof pts === 'string' ? pts : pts.map(p => `${r1(p[0])},${r1(p[1])}`).join(' ');
  return `<polygon points="${str}" fill="${fill}" ${extra}/>`;
}

/** 一个完整方块（左右侧面 + 顶面菱形），锚点为顶面中心 */
function cube(x, y, h, top, left, right) {
  const [sx, sy] = iso(x, y, h);
  return poly(`${sx - HW},${sy + HH} ${sx},${sy + HH * 2} ${sx},${sy + HH * 2 + BH} ${sx - HW},${sy + HH + BH}`, left)
    + poly(`${sx + HW},${sy + HH} ${sx},${sy + HH * 2} ${sx},${sy + HH * 2 + BH} ${sx + HW},${sy + HH + BH}`, right)
    + poly(`${sx},${sy} ${sx + HW},${sy + HH} ${sx},${sy + HH * 2} ${sx - HW},${sy + HH}`, top);
}

/** 水面：只画顶面（低于地面，露出相邻地块侧面） */
function waterTile(x, y) {
  const [sx, sy] = iso(x, y, -0.5);
  return poly(`${sx},${sy} ${sx + HW},${sy + HH} ${sx},${sy + HH * 2} ${sx - HW},${sy + HH}`, P.water);
}

// ---------- 地形（绘制网格 1..7；cell = 绘制坐标 -1） ----------
// 高度：左后 3×3 台地 +1
const H = [
  [1, 1, 1, 0, 0, 0, 0],
  [1, 1, 1, 0, 0, 0, 0],
  [1, 1, 1, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
  [0, 0, 0, 0, 0, 0, 0],
];
// 类型：g 草 / d 土路 / w 水 / f 麦田 / s 沙
const T = [
  'g g g g g w w'.split(' '),
  'g g g g g w w'.split(' '),
  'g g d g g w w'.split(' '),
  'g d d f f w w'.split(' '),
  'g g d f f w w'.split(' '),
  'g g g g g w w'.split(' '),
  's s s s s w w'.split(' '),
];

function cellAt(cx, cy) { return (T[cy] && T[cy][cx]) || 'g'; }
function hAt(cx, cy) { return (H[cy] && H[cy][cx]) || 0; }
function topColor(cx, cy) {
  const t = cellAt(cx, cy);
  if (t === 'w') return P.water;
  if (t === 'd') return P.dirt1;
  if (t === 'f') return P.wheat;
  if (t === 's') return P.sand1;
  return (cx + cy) % 2 === 0 ? P.grass1 : P.grass2;
}
function sideColors(cx, cy) {
  const t = cellAt(cx, cy);
  if (t === 'd') return [P.dirtL, P.dirtR];
  if (t === 'f') return ['#C0A050', '#D1B25C'];
  if (t === 's') return [P.sandL, P.sandR];
  return [P.gTopL, P.gTopR];
}

function ground() {
  let s = '';
  for (let cy = 0; cy < 7; cy++) {
    for (let cx = 0; cx < 7; cx++) {
      const x = cx + 1, y = cy + 1;
      if (cellAt(cx, cy) === 'w') { s += waterTile(x, y); continue; }
      const [l, rr] = sideColors(cx, cy);
      s += cube(x, y, hAt(cx, cy), topColor(cx, cy), l, rr);
    }
  }
  return s;
}

// 麦浪：麦田格上画细小麦秆
function wheat() {
  let s = '';
  for (let cy = 0; cy < 7; cy++) {
    for (let cx = 0; cx < 7; cx++) {
      if (cellAt(cx, cy) !== 'f') continue;
      const [sx, sy] = iso(cx + 1, cy + 1, hAt(cx, cy));
      s += `<g stroke="${P.wheatStalk}" stroke-width="1.6" stroke-linecap="round">`;
      for (const [dx, dy] of [[-8, -3], [0, 0], [8, 3]]) {
        s += `<line x1="${r1(sx + dx)}" y1="${r1(sy + HH + dy - 9)}" x2="${r1(sx + dx)}" y2="${r1(sy + HH + dy - 2)}"/>`;
      }
      s += '</g>';
    }
  }
  return s;
}

// 住宅：2×2 台地上的墙体 + 坡屋顶 + 门
function house() {
  const [sx, sy] = iso(2.5, 2.5, 1);
  const W = 44, D = 22, wallH = 30;
  let s = '';
  s += poly(`${sx - W},${sy + D / 2} ${sx},${sy + D} ${sx},${sy + D + wallH} ${sx - W},${sy + D / 2 + wallH}`, P.plasterL);
  s += poly(`${sx + W},${sy + D / 2} ${sx},${sy + D} ${sx},${sy + D + wallH} ${sx + W},${sy + D / 2 + wallH}`, P.plasterR);
  const ridgeY = sy + D / 2 - 30;
  s += poly(`${sx - W},${sy + D / 2} ${sx},${sy + D} ${sx},${ridgeY + 15}`, P.roofL);
  s += poly(`${sx + W},${sy + D / 2} ${sx},${sy + D} ${sx},${ridgeY + 15}`, P.roofR);
  s += `<rect x="${r1(sx + 7)}" y="${r1(sy + D / 2 + wallH - 19)}" width="11" height="19" rx="1.5" fill="#6B4A2E"/>`;
  s += `<rect x="${r1(sx - 30)}" y="${r1(sy + D / 2 + wallH - 15)}" width="9" height="11" rx="1" fill="#9C8F76"/>`;
  return s;
}

// 水井：一格石块 + 深色井口
function well() {
  let s = cube(4.45, 3.45, 0, P.stone, P.stoneL, P.stoneR);
  const [sx, sy] = iso(4.45, 3.45, 0);
  s += `<rect x="${r1(sx - 4.5)}" y="${r1(sy + HH - 1)}" width="9" height="10" rx="1.2" fill="#4A4E46"/>`;
  return s;
}

// 风车：石塔 + 四叶
function windmill() {
  const [sx, sy] = iso(5.6, 1.7, 0);
  let s = '';
  const topW = 15, botW = 24, h = 64;
  s += poly(`${sx - botW},${sy + 7} ${sx},${sy + 14} ${sx},${sy + 14 + h} ${sx - botW},${sy + 7 + h}`, P.stoneL);
  s += poly(`${sx + botW},${sy + 7} ${sx},${sy + 14} ${sx},${sy + 14 + h} ${sx + botW},${sy + 7 + h}`, P.stoneR);
  s += poly(`${sx - topW},${sy + 7} ${sx + topW},${sy + 7} ${sx},${sy - 20}`, P.roofR);
  s += `<g transform="translate(${r1(sx)} ${r1(sy + 10)})">`
    + `<g fill="${P.wood}" stroke="#8A6430" stroke-width="1">`
    + `<rect x="-3" y="-37" width="6" height="35" rx="2.5"/>`
    + `<rect x="-3" y="2" width="6" height="35" rx="2.5"/>`
    + `<rect x="-37" y="-3" width="35" height="6" rx="2.5"/>`
    + `<rect x="2" y="-3" width="35" height="6" rx="2.5"/>`
    + `</g><circle r="4" fill="#E4DCC8" stroke="#8A6430"/></g>`;
  return s;
}

// 乔木：木干 + 两层叶立方
function tree(x, y, h) {
  const [sx, sy] = iso(x, y, h);
  let s = `<rect x="${r1(sx - 3)}" y="${r1(sy - 3)}" width="6" height="12" fill="#7A5A34"/>`;
  s += cube(x, y, h + 0.6, P.leaf, P.leafL, P.leafR);
  s += `<g transform="translate(${r1(sx)} ${r1(sy - 26)})">${cube(0, 0, 0, P.leaf, P.leafL, P.leafR)}</g>`;
  return s;
}

// 村民：长袍小方块 + 头
function villager(x, y, robe) {
  const [sx, sy] = iso(x, y, 0);
  return `<g><rect x="${r1(sx - 4)}" y="${r1(sy - 15)}" width="8" height="13" rx="2.6" fill="${robe}"/>`
    + `<rect x="${r1(sx - 3)}" y="${r1(sy - 21.8)}" width="6" height="6.6" rx="2" fill="#E8C39A"/></g>`;
}

// ---------- 组装 ----------
function heroText(lang) {
  const zh = lang === 'zh';
  const eyebrow = zh ? '浏览器原生 · 体素文明沙盒 · 可观察可干预' : 'BROWSER-NATIVE · VOXEL GOD GAME · OBSERVE OR NUDGE';
  const desc1 = zh ? '程序生成的大陆上，一群小人采集、耕作、建村、建国，'
    : 'On a procedurally generated continent, tiny villagers gather, farm,';
  const desc2 = zh ? '贸易、战争与历史都自己发生 —— 你只负责观察，或轻拨命运。'
    : 'found nations, trade and go to war — you just watch, or nudge fate.';
  const meta = zh ? 'Three.js r169 · Vite 5 · Worker 网格生成 · 中 / EN 双语'
    : 'Three.js r169 · Vite 5 · Worker meshing · 10,000 × 10,000 world';
  return `
  <g id="title-block" transform="translate(64 74)">
    <text x="0" y="0" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" letter-spacing="3" fill="${P.muted}">${eyebrow}</text>
    <text x="-2" y="66" font-family="-apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="60" font-weight="800" fill="${P.ink}" letter-spacing="1">TINY CIVILIZATION</text>
    ${zh ? `<text x="0" y="112" font-family="'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="27" font-weight="600" fill="${P.ink}" opacity="0.92">微 缩 文 明</text>`
    : `<text x="0" y="112" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="17" fill="${P.ink}" opacity="0.92" letter-spacing="1.5">A VILLAGE-SIM THAT PLAYS ITSELF IN YOUR BROWSER</text>`}
    <text x="0" y="162" font-family="-apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="19" fill="${P.muted}">${desc1}</text>
    <text x="0" y="190" font-family="-apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="19" fill="${P.muted}">${desc2}</text>
    <text x="0" y="248" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="15" fill="${P.muted}" opacity="0.85">${meta}</text>
  </g>`;
}

function heroSvg(lang) {
  const zh = lang === 'zh';
  const title = zh ? 'Tiny Civilization · 微缩文明' : 'Tiny Civilization';
  const desc = zh
    ? '等距体素场景：程序生成的大陆上有住宅、风车、麦田、树木与村民，一切自主运转。'
    : 'An isometric voxel scene: houses, a windmill, wheat fields, trees and villagers running on their own.';
  const scene = ground()
    + wheat()
    + windmill()
    + house()
    + well()
    + tree(1.7, 4.7, 0) + tree(1.4, 6.3, 0) + tree(4.8, 2.3, 0)
    + villager(3.5, 4.3, '#7A9C4E') + villager(2.7, 5.5, '#8A6A42') + villager(4.9, 5.1, '#5A6A8A');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="380" viewBox="0 0 1200 380" role="img" aria-labelledby="ht hd">
  <title id="ht">${title}</title>
  <desc id="hd">${desc}</desc>
  <defs>
    <radialGradient id="vg" cx="72%" cy="38%" r="80%">
      <stop offset="0%" stop-color="#1C261B"/>
      <stop offset="100%" stop-color="${P.bg}"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="380" rx="24" fill="url(#vg)"/>
  <ellipse cx="${OX}" cy="${OY + 152}" rx="185" ry="42" fill="#000000" opacity="0.28"/>
  <g id="project-proof">${scene}</g>
  ${heroText(lang)}
</svg>`;
}

writeFileSync(join(OUT, 'hero.svg'), heroSvg('zh'));
writeFileSync(join(OUT, 'hero-en.svg'), heroSvg('en'));
console.log('written hero.svg / hero-en.svg');
