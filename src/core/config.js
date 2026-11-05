// ============================================================
// config.js — 全局常量
// ============================================================

// 世界逻辑范围 10,000 × 10,000（半宽 5000）
export const WORLD_HALF = 5000;
export const CHUNK = 16;          // 区块边长（方块）
export const SY = 96;             // 区块高度
export const SEA = 30;            // 海平面

// 视距（区块数）
export const VIEW_NEAR = 7;       // 全细节网格半径
export const VIEW_FAR = 13;       // 卸载半径
export const SIM_NEAR = 2.2;      // 村民全模拟半径（区块）
export const SETTLE_NEAR = 5;     // 聚落实体化半径（区块）

// 时间：1 现实秒（1× 速度）= 12 游戏分钟；一天 90s；一年 48 天（四季各 12 天）
export const GAME_MIN_PER_SEC = 12;
export const MIN_PER_DAY = 24 * 60;
export const DAYS_PER_MONTH = 4;
export const MONTHS_PER_YEAR = 12;
export const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 48

// 模拟步长：每个模拟 tick = 1 游戏小时
export const SIM_TICK_MIN = 60;

// 聚落
export const SETTLE_COUNT = 14;        // 初始聚落数
export const SETTLE_REGION = 1700;     // 初始聚落分布半径
export const AGENT_VIS_CAP = 150;      // 可见村民上限
export const AGENT_PER_SETTLE = 36;    // 每聚落可见村民上限

// 经济
export const FOOD_PER_POP_HOUR = 0.014;   // 每人每小时消耗食物
export const FARM_YIELD = 26;             // 一块成熟农田一次收获的食物
export const HOUSE_CAP = 5;               // 每栋住宅容纳人口

// 保存
export const AUTOSAVE_MS = 3 * 60 * 1000;
export const SAVE_VERSION = 3;

export const SEASON_NAMES = ['春', '夏', '秋', '冬'];
export const SEASON_COLORS = [
  { g: [1.0, 1.0, 1.0], l: [1.0, 1.0, 1.0] },   // 春：微亮
  { g: [1.04, 1.02, 0.92], l: [1.02, 1.0, 0.9] }, // 夏：偏黄热
  { g: [1.1, 0.95, 0.72], l: [1.1, 0.92, 0.68] }, // 秋：枯黄
  { g: [0.9, 0.93, 1.0], l: [0.88, 0.92, 1.0] },  // 冬：冷白
];
