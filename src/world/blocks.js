// ============================================================
// blocks.js — 方块注册表（移植 WorldForge 并扩展文明方块）
// ============================================================

// 图集槽位（16×16 格图集中的索引）
export const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, SAND: 4,
  LOG_SIDE: 5, LOG_TOP: 6, BIRCH_SIDE: 7, SPRUCE_SIDE: 8, LEAVES: 9,
  LEAVES_SPRUCE: 10, PLANK: 11, PLANK_DARK: 12, COBBLE: 13, BRICK: 14,
  SNOW: 15, SNOW_SIDE: 16, GLASS: 17, GLOW: 18, GRAVEL: 19,
  PATH_TOP: 20, PATH_SIDE: 21, FARMLAND: 22, PUMPKIN_SIDE: 23, PUMPKIN_TOP: 24,
  WATER: 25, TALLGRASS: 26, FLOWER_RED: 27, FLOWER_YELLOW: 28, WHEAT: 29,
  MUSHROOM_RED: 30, MUSHROOM_BROWN: 31, REED: 32,
  // 文明扩展
  SANDSTONE: 33, THATCH: 34, CHARRED: 35, CACTUS_SIDE: 36, CACTUS_TOP: 37,
  WHEAT_YOUNG: 38, DEADBUSH: 39, STONEBRICK: 40, DRYFARM: 41,
};

// 方块 ID
export const B = {
  AIR: 0,
  GRASS: 1, DIRT: 2, STONE: 3, SAND: 4, WATER: 5,
  LOG: 6, LEAVES: 7, SNOWGRASS: 8, SNOW: 9, PLANK: 10,
  COBBLE: 11, LOG_BIRCH: 12, LEAVES_SPRUCE: 13, GLASS: 14, GLOW: 15,
  GRAVEL: 16, PATH: 17, FARMLAND: 18, BRICK: 19, PLANK_DARK: 20,
  PUMPKIN: 21, LOG_SPRUCE: 22,
  // 文明扩展
  SANDSTONE: 23, THATCH: 24, CHARRED: 25, CACTUS: 26, STONEBRICK: 27,
  // 十字植物（不进体素网格，见 PLANTS）
  TALLGRASS: 30, FLOWER_RED: 31, FLOWER_YELLOW: 32, WHEAT: 33,
  MUSHROOM_RED: 34, MUSHROOM_BROWN: 35, REED: 36,
  WHEAT_YOUNG: 37, DEADBUSH: 38,
};

// 是否为十字形植物（实例化渲染，不参与体素网格）
export function isCross(id) { return id >= 30; }

// 树木方块集合（砍伐/燃烧判定）
export const WOOD_IDS = new Set([B.LOG, B.LOG_BIRCH, B.LOG_SPRUCE]);
export const LEAF_IDS = new Set([B.LEAVES, B.LEAVES_SPRUCE]);

// 方块元数据：six tiles 顺序 [+X, -X, +Y(顶), -Y(底), +Z, -Z]
const DEF = [];
function def(id, name, opts) {
  DEF[id] = { name, solid: true, opaque: true, ...opts };
}

def(B.AIR, '空气', { solid: false, opaque: false });
def(B.GRASS, '草方块', { top: T.GRASS_TOP, side: T.GRASS_SIDE, bottom: T.DIRT });
def(B.DIRT, '泥土', { all: T.DIRT });
def(B.STONE, '石头', { all: T.STONE });
def(B.SAND, '沙子', { all: T.SAND });
def(B.WATER, '水', { solid: false, opaque: false });
def(B.LOG, '橡木', { top: T.LOG_TOP, side: T.LOG_SIDE, bottom: T.LOG_TOP });
def(B.LEAVES, '橡树叶', { all: T.LEAVES });
def(B.SNOWGRASS, '雪草方块', { top: T.SNOW, side: T.SNOW_SIDE, bottom: T.DIRT });
def(B.SNOW, '雪块', { all: T.SNOW });
def(B.PLANK, '木板', { all: T.PLANK });
def(B.COBBLE, '圆石', { all: T.COBBLE });
def(B.LOG_BIRCH, '白桦木', { top: T.LOG_TOP, side: T.BIRCH_SIDE, bottom: T.LOG_TOP });
def(B.LEAVES_SPRUCE, '云杉叶', { all: T.LEAVES_SPRUCE });
def(B.GLASS, '玻璃', { all: T.GLASS, opaque: false });
def(B.GLOW, '萤石', { all: T.GLOW });
def(B.GRAVEL, '砂砾', { all: T.GRAVEL });
def(B.PATH, '土径', { top: T.PATH_TOP, side: T.PATH_SIDE, bottom: T.DIRT });
def(B.FARMLAND, '耕地', { top: T.FARMLAND, side: T.DIRT, bottom: T.DIRT });
def(B.BRICK, '红砖', { all: T.BRICK });
def(B.PLANK_DARK, '深色木板', { all: T.PLANK_DARK });
def(B.PUMPKIN, '南瓜', { top: T.PUMPKIN_TOP, side: T.PUMPKIN_SIDE, bottom: T.PUMPKIN_TOP });
def(B.LOG_SPRUCE, '云杉木', { top: T.LOG_TOP, side: T.SPRUCE_SIDE, bottom: T.LOG_TOP });
def(B.SANDSTONE, '砂岩', { all: T.SANDSTONE });
def(B.THATCH, '茅草', { all: T.THATCH });
def(B.CHARRED, '焦木', { all: T.CHARRED });
def(B.CACTUS, '仙人掌', { top: T.CACTUS_TOP, side: T.CACTUS_SIDE, bottom: T.CACTUS_TOP });
def(B.STONEBRICK, '石砖', { all: T.STONEBRICK });
def(B.DRYFARM, '干裂耕地', { top: T.DRYFARM, side: T.DIRT, bottom: T.DIRT });

export const BLOCKS = DEF;

// 预计算查询表：mesher 热路径每方块/每面都会查询，
// 用 TypedArray 直接索引代替「取对象 + 取属性」链（结果与原实现完全一致）
const OPAQUE_T = new Uint8Array(64);
const SOLID_T = new Uint8Array(64);
for (let i = 0; i < DEF.length; i++) {
  const d = DEF[i];
  if (!d) continue;
  if (d.opaque) OPAQUE_T[i] = 1;
  if (d.solid) SOLID_T[i] = 1;
}

export function isOccluder(id) {
  return OPAQUE_T[id] === 1;
}
export function isSolid(id) {
  return SOLID_T[id] === 1;
}

// 方块 → 6 面贴图槽位（按 id 缓存，避免每次调用分配新数组；
// 缓存数组为共享只读约定——所有调用方仅读取，不修改）
const _tilesCache = [];
export function tilesOf(id) {
  let t = _tilesCache[id];
  if (t !== undefined) return t;
  const d = DEF[id];
  if (d.all !== undefined) {
    const v = d.all;
    t = [v, v, v, v, v, v];
  } else {
    const { top, side, bottom } = d;
    t = [side, side, top, bottom, side, side];
  }
  _tilesCache[id] = t;
  return t;
}

// 植物类型定义（十字交叉面片）
export const PLANTS = {
  [B.TALLGRASS]: { tile: T.TALLGRASS, h: 0.85 },
  [B.FLOWER_RED]: { tile: T.FLOWER_RED, h: 0.72 },
  [B.FLOWER_YELLOW]: { tile: T.FLOWER_YELLOW, h: 0.72 },
  [B.WHEAT]: { tile: T.WHEAT, h: 0.95 },
  [B.MUSHROOM_RED]: { tile: T.MUSHROOM_RED, h: 0.45 },
  [B.MUSHROOM_BROWN]: { tile: T.MUSHROOM_BROWN, h: 0.45 },
  [B.REED]: { tile: T.REED, h: 1.0 },
  [B.WHEAT_YOUNG]: { tile: T.WHEAT_YOUNG, h: 0.45 },
  [B.DEADBUSH]: { tile: T.DEADBUSH, h: 0.6 },
};
