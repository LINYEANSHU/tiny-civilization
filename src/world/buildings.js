// ============================================================
// buildings.js — 建筑模板（体素印章）
// 所有建筑通过 EditWriter 产出方块/植物编辑，经 chunkManager 应用。
// 不同文化使用不同材质包 → 区域建筑风格差异。
// ============================================================
import { B } from './blocks.js';
import { SEA } from '../core/config.js';

// 编辑收集器
export class EditWriter {
  constructor() {
    this.edits = [];    // [x,y,z,id]
    this.plants = [];   // [x,y,z,pid,del]
  }
  set(x, y, z, id) { this.edits.push([x | 0, y | 0, z | 0, id]); }
  fill(x0, y0, z0, x1, y1, z1, id) {
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) this.set(x, y, z, id);
  }
  column(x, z, y0, y1, id) { for (let y = y0; y <= y1; y++) this.set(x, y, z, id); }
  plant(x, y, z, pid) { this.plants.push([x | 0, y | 0, z | 0, pid, 0]); }
  removePlant(x, y, z, pid) { this.plants.push([x | 0, y | 0, z | 0, pid, 1]); }
}

export const CULTURES = {
  wood: { key: 'wood', name: '木构', wall: B.PLANK, corner: B.LOG, roof: B.PLANK_DARK, trim: B.LOG },
  stone: { key: 'stone', name: '石砌', wall: B.COBBLE, corner: B.STONE, roof: B.STONEBRICK, trim: B.STONE },
  adobe: { key: 'adobe', name: '夯土', wall: B.SANDSTONE, corner: B.SANDSTONE, roof: B.THATCH, trim: B.THATCH },
  nordic: { key: 'nordic', name: '北地', wall: B.PLANK_DARK, corner: B.LOG_SPRUCE, roof: B.SNOW, trim: B.LOG_SPRUCE },
};

export function cultureForBiome(biome) {
  // biome: 0海 1滩 2平原 3森林 4沙漠 5苔原 6雪 7山 8稀树
  if (biome === 4) return CULTURES.adobe;
  if (biome === 5 || biome === 6) return CULTURES.nordic;
  if (biome === 7) return CULTURES.stone;
  return CULTURES.wood;
}

// 通用地基：整平 + 清空上方 + 打基础
function padColumn(w, x, z, g, top = B.GRASS) {
  w.set(x, g, z, top);
  w.set(x, g - 1, z, B.DIRT);
  w.set(x, g - 2, z, B.DIRT);
  for (let y = g + 1; y <= g + 8; y++) w.set(x, y, z, B.AIR);
}

/**
 * 民居（door: 0=+z 1=-z 2=+x 3=-x 朝向）
 * 返回 {door:[x,z], w, d}
 */
export function stampHouse(w, x0, z0, g, cul, wd = 5, dp = 5, door = 0, opts = {}) {
  const x1 = x0 + wd - 1, z1 = z0 + dp - 1;
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) padColumn(w, x, z, g);
  // 地板
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) w.set(x, g, z, B.PLANK);
  // 门位置
  let dx, dz;
  if (door === 0) { dx = x0 + (wd >> 1); dz = z1; }
  else if (door === 1) { dx = x0 + (wd >> 1); dz = z0; }
  else if (door === 2) { dx = x1; dz = z0 + (dp >> 1); }
  else { dx = x0; dz = z0 + (dp >> 1); }

  const isCorner = (x, z) => (x === x0 || x === x1) && (z === z0 || z === z1);
  const wallH = opts.tall ? 4 : 3;
  for (let y = g + 1; y <= g + wallH; y++) {
    for (let x = x0; x <= x1; x++) for (const z of [z0, z1]) {
      if (x === dx && z === dz && y <= g + 2) continue;
      w.set(x, y, z, isCorner(x, z) ? cul.corner : cul.wall);
    }
    for (let z = z0 + 1; z <= z1 - 1; z++) for (const x of [x0, x1]) {
      if (x === dx && z === dz && y <= g + 2) continue;
      w.set(x, y, z, isCorner(x, z) ? cul.corner : cul.wall);
    }
  }
  // 窗
  for (let x = x0 + 1; x <= x1 - 1; x += 2) {
    if (!(x === dx && (dz === z0 || dz === z1))) { w.set(x, g + 2, z0, B.GLASS); w.set(x, g + 2, z1, B.GLASS); }
  }
  for (let z = z0 + 1; z <= z1 - 1; z += 2) {
    if (!(z === dz && (dx === x0 || dx === x1))) { w.set(x0, g + 2, z, B.GLASS); w.set(x1, g + 2, z, B.GLASS); }
  }
  // 屋顶（四面内收）
  let ry = g + wallH + 1, ix = 0, iz = 0;
  while (x0 + ix <= x1 - ix && z0 + iz <= z1 - iz) {
    for (let x = x0 + ix; x <= x1 - ix; x++) { w.set(x, ry, z0 + iz, cul.roof); w.set(x, ry, z1 - iz, cul.roof); }
    for (let z = z0 + iz; z <= z1 - iz; z++) { w.set(x0 + ix, ry, z, cul.roof); w.set(x1 - ix, ry, z, cul.roof); }
    ix++; iz++; ry++;
  }
  // 烟囱
  if (opts.chimney) {
    for (let y = g + wallH + 1; y <= ry + 1; y++) w.set(x0 + 1, y, z0 + 1, B.COBBLE);
  }
  return { door: [dx, dz], w: wd, d: dp };
}

/** 农田（含灌溉水渠与作物） */
export function stampFarm(w, x0, z0, g, wd = 7, dp = 5) {
  const x1 = x0 + wd - 1, z1 = z0 + dp - 1;
  const midZ = z0 + (dp >> 1);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
    padColumn(w, x, z, g);
    const border = x === x0 || x === x1 || z === z0 || z === z1;
    if (border) w.set(x, g, z, B.LOG);
    else if (z === midZ) w.set(x, g, z, B.WATER);
    else {
      w.set(x, g, z, B.FARMLAND);
      w.plant(x, g + 1, z, B.WHEAT_YOUNG);
    }
  }
  return { cells: (wd - 2) * (dp - 2) - (wd - 2) };
}

/** 水井 */
export function stampWell(w, cx, cz, g) {
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    padColumn(w, cx + dx, cz + dz, g, B.PATH);
    if (dx === 0 && dz === 0) {
      w.set(cx, g, cz, B.WATER);
      w.set(cx, g - 1, cz, B.WATER);
    } else {
      w.set(cx + dx, g + 1, cz + dz, B.COBBLE);
    }
  }
  for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    w.set(cx + dx, g + 2, cz + dz, B.LOG);
    w.set(cx + dx, g + 3, cz + dz, B.LOG);
  }
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    w.set(cx + dx, g + 4, cz + dz, B.THATCH);
  }
}

/** 仓库 */
export function stampStorage(w, x0, z0, g, cul, wd = 6, dp = 5, door = 0) {
  const r = stampHouse(w, x0, z0, g, cul, wd, dp, door);
  const x1 = x0 + wd - 1, z1 = z0 + dp - 1;
  // 内部货箱
  for (let x = x0 + 1; x <= x1 - 1; x += 2) {
    for (let z = z0 + 1; z <= z1 - 1; z += 2) {
      if (x === r.door[0] && z === r.door[1]) continue;
      w.set(x, g + 1, z, B.PLANK_DARK);
      if ((x + z) % 2 === 0) w.set(x, g + 2, z, B.PLANK_DARK);
    }
  }
  return r;
}

/** 伐木场（开放棚 + 原木堆） */
export function stampLumberCamp(w, x0, z0, g, cul) {
  for (let x = x0; x <= x0 + 4; x++) for (let z = z0; z <= z0 + 3; z++) padColumn(w, x, z, g, B.PATH);
  for (const [px, pz] of [[x0, z0], [x0 + 4, z0], [x0, z0 + 3], [x0 + 4, z0 + 3]]) {
    w.column(px, pz, g + 1, g + 2, B.LOG);
  }
  for (let x = x0; x <= x0 + 4; x++) for (let z = z0; z <= z0 + 3; z++) w.set(x, g + 3, z, B.THATCH);
  // 原木堆
  for (let i = 0; i < 3; i++) {
    w.set(x0 + 1, g + 1 + i, z0 + 5, B.LOG);
    w.set(x0 + 2, g + 1 + i, z0 + 5, B.LOG);
  }
}

/** 采石场（凹坑） */
export function stampQuarry(w, x0, z0, g) {
  for (let x = x0; x < x0 + 5; x++) for (let z = z0; z < z0 + 5; z++) {
    for (let y = g + 3; y >= g - 2; y--) w.set(x, y, z, y >= g - 2 ? B.STONE : B.AIR);
    for (let y = g + 4; y <= g + 8; y++) w.set(x, y, z, B.AIR);
    if ((x + z) % 3 === 0) w.set(x, g - 2, z, B.COBBLE);
  }
  // 入口坡道
  for (let i = 0; i < 3; i++) {
    w.set(x0 + 2, g - 2 + i + 1, z0 - 1, B.PATH);
    for (let y = g + 4; y <= g + 8; y++) w.set(x0 + 2, y, z0 - 1, B.AIR);
  }
}

/** 市场（三个摊位） */
export function stampMarket(w, x0, z0, g, cul) {
  for (let i = 0; i < 3; i++) {
    const sx = x0 + i * 4;
    for (let x = sx; x <= sx + 2; x++) for (let z = z0; z <= z0 + 2; z++) padColumn(w, x, z, g, B.PATH);
    for (const [px, pz] of [[sx, z0], [sx + 2, z0]]) w.column(px, pz, g + 1, g + 2, B.LOG);
    for (let x = sx; x <= sx + 2; x++) for (let z = z0; z <= z0 + 2; z++) w.set(x, g + 3, z, B.THATCH);
    // 货品
    w.set(sx + 1, g + 1, z0 + 1, i === 0 ? B.PUMPKIN : i === 1 ? B.GLOW : B.PLANK);
  }
}

/** 市政厅（两层石构） */
export function stampTownHall(w, x0, z0, g, cul, door = 0) {
  const r = stampHouse(w, x0, z0, g, CULTURES.stone, 7, 6, door, { tall: true, chimney: true });
  const cx = x0 + 3;
  // 旗帜塔
  w.column(cx, z0 + 2, g + 6, g + 9, B.LOG);
  w.set(cx, g + 10, z0 + 2, B.GLOW);
  return r;
}

/** 哨塔 */
export function stampWatchtower(w, x0, z0, g) {
  for (let x = x0; x <= x0 + 2; x++) for (let z = z0; z <= z0 + 2; z++) {
    padColumn(w, x, z, g, B.COBBLE);
  }
  for (let y = g + 1; y <= g + 5; y++) {
    for (let x = x0; x <= x0 + 2; x++) for (let z = z0; z <= z0 + 2; z++) {
      if (x === x0 + 1 && (z === z0 || z === z0 + 2) && y <= g + 2) continue; // 门
      const edge = x === x0 || x === x0 + 2 || z === z0 || z === z0 + 2;
      if (edge) w.set(x, y, z, (x === x0 + 1 && z === z0 + 1) ? B.COBBLE : B.COBBLE);
    }
  }
  for (let x = x0; x <= x0 + 2; x++) for (let z = z0; z <= z0 + 2; z++) w.set(x, g + 6, z, B.STONEBRICK);
  w.set(x0 + 1, g + 7, z0 + 1, B.GLOW);
}

/** 城墙段（沿 cells: [[x,z],...]） */
export function stampWall(w, cells, gOf) {
  for (const [x, z] of cells) {
    const g = gOf(x, z);
    w.set(x, g + 1, z, B.COBBLE);
    w.set(x, g + 2, z, B.COBBLE);
    w.set(x, g + 3, z, B.COBBLE);
    w.set(x, g + 4, z, B.STONEBRICK);
    for (let y = g + 5; y <= g + 7; y++) w.set(x, y, z, B.AIR);
  }
}

/** 城门（两柱 + 横梁 + 灯） */
export function stampGate(w, x, z, g, axis) {
  if (axis === 'x') {
    for (const dz of [-1, 1]) {
      w.column(x, z + dz, g + 1, g + 4, B.COBBLE);
      for (let y = g + 5; y <= g + 7; y++) w.set(x, y, z + dz, B.AIR);
    }
    w.set(x, g + 5, z, B.STONEBRICK);
    w.set(x, g + 6, z, B.GLOW);
  } else {
    for (const dx of [-1, 1]) {
      w.column(x + dx, z, g + 1, g + 4, B.COBBLE);
      for (let y = g + 5; y <= g + 7; y++) w.set(x + dx, y, z, B.AIR);
    }
    w.set(x, g + 5, z, B.STONEBRICK);
    w.set(x, g + 6, z, B.GLOW);
  }
}

/** 道路（cells + 各自地面高度） */
export function stampRoad(w, cells, hOf) {
  for (const [x, z] of cells) {
    const h = hOf(x, z);
    w.set(x, h, z, B.PATH);
    for (let y = h + 1; y <= h + 2; y++) w.set(x, y, z, B.AIR);
  }
}

/** 路灯 */
export function stampLamp(w, x, z, g) {
  w.set(x, g + 1, z, B.LOG);
  w.set(x, g + 2, z, B.LOG);
  w.set(x, g + 3, z, B.GLOW);
  for (let y = g + 4; y <= g + 5; y++) w.set(x, y, z, B.AIR);
}

/** 渔码头（伸入水面的木栈桥，dir = 入水方向单位向量） */
export function stampDock(w, x, z, g, dx, dz) {
  // 栈桥面：5 块木板沿海平面向水中延伸
  for (let i = 0; i < 5; i++) {
    const px = x + dx * i, pz = z + dz * i;
    w.set(px, SEA, pz, B.PLANK);
    for (let y = SEA + 1; y <= SEA + 2; y++) w.set(px, y, pz, B.AIR);
    // 桥柱：从桥面到水底
    for (let y = SEA - 1; y >= Math.max(4, SEA - 6); y--) {
      w.set(px, y, pz, B.LOG);
    }
  }
  // 端点灯柱
  const ex = x + dx * 4, ez = z + dz * 4;
  w.set(ex, SEA + 1, ez, B.LOG);
  w.set(ex, SEA + 2, ez, B.GLOW);
}

/** 纪念碑（城市奇观）：石基 + 砂岩柱 + 顶灯 */
export function stampMonument(w, x0, z0, g) {
  for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) {
    w.set(x0 + dx, g, z0 + dz, B.STONEBRICK);
    w.set(x0 + dx, g - 1, z0 + dz, B.STONE);
    for (let y = g + 1; y <= g + 6; y++) w.set(x0 + dx, y, z0 + dz, B.AIR);
  }
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
    w.column(x0 + dx, z0 + dz, g + 1, g + 2, B.COBBLE);
  }
  for (let y = g + 1; y <= g + 5; y++) w.set(x0 + 1, y, z0 + 1, B.SANDSTONE);
  w.set(x0 + 1, g + 6, z0 + 1, B.GLOW);
}

/** 风车（磨坊）：3×3 石塔 + 茅草锥顶 + 顶灯。效果：本聚落农田生长 +15% */
export function stampWindmill(w, x0, z0, g) {
  // 整平 + 塔身（下两圈圆石、上两圈砂岩）
  for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) {
    padColumn(w, x0 + dx, z0 + dz, g, B.PATH);
  }
  for (let y = g + 1; y <= g + 4; y++) {
    for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) {
      const edge = dx === 0 || dx === 2 || dz === 0 || dz === 2;
      if (!edge) continue;
      w.set(x0 + dx, y, z0 + dz, y <= g + 2 ? B.COBBLE : B.SANDSTONE);
    }
  }
  // 茅草锥顶（3 层内收）
  let ry = g + 5;
  for (let r = 2; r >= 0; r--, ry++) {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      w.set(x0 + 1 + dx, ry, z0 + 1 + dz, B.THATCH);
    }
  }
  w.set(x0 + 1, ry, z0 + 1, B.LOG);        // 风车杆
  w.set(x0 + 1, ry + 1, z0 + 1, B.GLOW);   // 顶灯（夜间地标）
}

/** 谷仓：3×3 架空木仓（防潮短柱 + 双色板墙）+ 茅草四坡顶。效果：本聚落食物消耗 -12% */
export function stampGranary(w, x0, z0, g) {
  // 整平 + 地坪
  for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) {
    padColumn(w, x0 + dx, z0 + dz, g, B.PATH);
  }
  // 四角架空短柱（防潮通风）
  for (const [dx, dz] of [[0, 0], [2, 0], [0, 2], [2, 2]]) {
    w.set(x0 + dx, g + 1, z0 + dz, B.LOG);
  }
  // 仓体（两层双色板墙）
  for (let y = g + 2; y <= g + 3; y++) {
    for (let dx = 0; dx < 3; dx++) for (let dz = 0; dz < 3; dz++) {
      const edge = dx === 0 || dx === 2 || dz === 0 || dz === 2;
      if (edge) w.set(x0 + dx, y, z0 + dz, y === g + 2 ? B.PLANK : B.PLANK_DARK);
    }
  }
  // 茅草四坡顶（两层内收）
  let ry = g + 4;
  for (let r = 2; r >= 1; r--, ry++) {
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
      w.set(x0 + 1 + dx, ry, z0 + 1 + dz, B.THATCH);
    }
  }
  w.set(x0 + 1, ry, z0 + 1, B.PUMPKIN);    // 仓顶南瓜（丰收标记）
}

/** 种树（上帝工具 / 森林恢复）：直接体素 */
export function stampTree(w, x, z, gy, species, seedFn) {
  const leaf = species === 2 ? B.LEAVES_SPRUCE : B.LEAVES;
  const log = species === 2 ? B.LOG_SPRUCE : species === 1 ? B.LOG_BIRCH : B.LOG;
  const r1 = seedFn(), r2 = seedFn();
  const th = species === 2 ? 6 + ((r1 * 4) | 0) : 4 + ((r1 * 3) | 0);
  if (species === 3) {
    for (let i = 1; i <= 2 + ((r1 * 2) | 0); i++) w.set(x, gy + i, z, B.CACTUS);
    return;
  }
  for (let i = 1; i <= th; i++) w.set(x, gy + i, z, log);
  if (species === 2) {
    for (let yy = gy + 2; yy <= gy + th; yy++) {
      const fromTop = gy + th - yy;
      const rr = fromTop === 0 ? 1 : (fromTop % 2 === 1 ? 1 : 2);
      for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
        if (Math.abs(dx) + Math.abs(dz) > rr + 1) continue;
        if (dx === 0 && dz === 0) continue;
        w.set(x + dx, yy, z + dz, leaf);
      }
    }
    w.set(x, gy + th + 1, z, leaf);
  } else {
    const layers = species === 1
      ? [[gy + th - 1, 2], [gy + th, 1], [gy + th + 1, 0]]
      : [[gy + th - 1, 2], [gy + th, 2], [gy + th + 1, 1], [gy + th + 2, 0]];
    for (const [cy, rr] of layers) {
      for (let dx = -rr; dx <= rr; dx++) for (let dz = -rr; dz <= rr; dz++) {
        if (dx * dx + dz * dz > rr * rr + 0.6) continue;
        if (Math.abs(dx) === rr && Math.abs(dz) === rr && r2 > 0.4) continue;
        w.set(x + dx, cy, z + dz, leaf);
      }
    }
  }
}
