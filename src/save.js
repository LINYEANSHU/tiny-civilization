// ============================================================
// save.js — IndexedDB 存档
// 每次操作使用独立连接并在结束时关闭（旧实现从不 close，
// 长时间游玩会累积大量打开的 IDBDatabase 连接）。
// ============================================================
import { t } from './i18n.js';

const DB_NAME = 'tiny-civ-db';
const STORE = 'worlds';

function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function saveWorld(slot, data) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(data, slot);
    tx.oncomplete = () => { db.close(); res(true); };
    tx.onerror = () => { db.close(); rej(tx.error); };
    // onabort 补充：异常中止时旧实现既不 resolve 也不 reject（调用方永久挂起）
    tx.onabort = () => { db.close(); rej(tx.error || new Error(t('db.txAbort'))); };
  });
}

export async function loadWorld(slot) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(slot);
    req.onsuccess = () => { db.close(); res(req.result || null); };
    req.onerror = () => { db.close(); rej(req.error); };
  });
}

export async function deleteWorld(slot) {
  const db = await openDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(slot);
    tx.oncomplete = () => { db.close(); res(true); };
    tx.onerror = () => { db.close(); rej(tx.error); };
    tx.onabort = () => { db.close(); rej(tx.error || new Error(t('db.delAbort'))); };
  });
}

// 列出所有存档槽位的元信息（精进阶段 E1：多存档槽位管理）
// 返回 [{slot, seed, savedAt, v}]，按槽位名排序；自动存档排最前。
export function listWorlds() {
  return openDB().then((db) => new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const keysReq = store.getAllKeys();
    const valsReq = store.getAll();
    let keys = null, vals = null;
    const done = () => {
      if (!keys || !vals) return;
      db.close();
      const AUTOSAVE_FIRST = (a, b) => (a === 'autosave' ? -1 : b === 'autosave' ? 1 : a < b ? -1 : 1);
      res(keys.map((k, i) => {
        const v = vals[i] || null;
        return { slot: String(k), seed: v ? v.seed : null, savedAt: v ? v.savedAt : 0, v: v ? v.v : 0 };
      }).sort((a, b) => AUTOSAVE_FIRST(a.slot, b.slot)));
    };
    keysReq.onsuccess = () => { keys = keysReq.result; done(); };
    valsReq.onsuccess = () => { vals = valsReq.result; done(); };
    const fail = (e) => { db.close(); rej(e || new Error(t('db.listFail'))); };
    keysReq.onerror = () => fail(keysReq.error);
    valsReq.onerror = () => fail(valsReq.error);
    tx.onabort = () => fail(tx.error);
  }));
}

// 手动存档槽位名（存档管理 UI 与启动 ?load= 参数共用）
export const MANUAL_SLOTS = ['slot1', 'slot2', 'slot3'];

// 编辑日志序列化
export function serializeJournal(journal) {
  const out = [];
  for (const [key, j] of journal) {
    out.push([key, { blocks: j.blocks, plants: j.plants }]);
  }
  return out;
}
export function deserializeJournal(list) {
  const m = new Map();
  if (Array.isArray(list)) {
    for (const [key, j] of list) {
      // v3 旧格式 blocks 为 [idx,id] 二元数组 → 迁移为打包整数
      let blocks = j.blocks;
      if (Array.isArray(blocks) && blocks.length && Array.isArray(blocks[0])) {
        blocks = blocks.map((e) => e[0] | (e[1] << 15));
      }
      m.set(key, { blocks, plants: j.plants });
    }
  }
  return m;
}
