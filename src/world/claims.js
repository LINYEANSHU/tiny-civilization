// ============================================================
// claims.js — 聚落领地登记表
// 树木/植被生成时查询：村庄领地内不长树（对齐 WorldForge 的
// flag 保护机制，但适配纯函数化生成的无限世界）。
// 主线程与 Worker 各持一份相同登记（通过 claims 消息同步）。
// ============================================================

const CELL = 64;
// 数值单元格键：(cx+512)*2048 + (cz+512)。
// 旧实现用 "cx,cz" 字符串键——claimed() 是树木生成的热路径
// （每列 treeAt 都查询），数值键避免字符串拼接与字符串哈希。
// 世界坐标 ±5000 → cx∈[-79,79]，键唯一且无碰撞（cz+512 < 2048）。
const cells = new Map();
const all = [];            // 登记序列（供同步/保存）

const cellKey = (cx, cz) => (cx + 512) * 2048 + (cz + 512);

export function clearClaims() {
  cells.clear();
  all.length = 0;
}

export function addClaim(x, z, r) {
  const claim = { x: x | 0, z: z | 0, r };
  all.push(claim);
  const c0x = Math.floor((claim.x - r) / CELL), c1x = Math.floor((claim.x + r) / CELL);
  const c0z = Math.floor((claim.z - r) / CELL), c1z = Math.floor((claim.z + r) / CELL);
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cz = c0z; cz <= c1z; cz++) {
      const k = cellKey(cx, cz);
      const arr = cells.get(k);
      if (arr) arr.push(claim);
      else cells.set(k, [claim]);
    }
  }
}

// 该列是否处于某个领地内（禁止长树）
export function claimed(x, z) {
  const arr = cells.get(cellKey(Math.floor(x / CELL), Math.floor(z / CELL)));
  if (!arr) return false;
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    const dx = x - c.x, dz = z - c.z;
    if (dx * dx + dz * dz <= c.r * c.r) return true;
  }
  return false;
}

export function listClaims() { return all; }

export function restoreClaims(list) {
  clearClaims();
  if (Array.isArray(list)) for (const c of list) addClaim(c.x, c.z, c.r);
}
