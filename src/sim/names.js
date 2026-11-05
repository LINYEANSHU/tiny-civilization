// ============================================================
// names.js — 聚落 / 村民 / 国家命名（由种子决定，可复现）
// ============================================================
import { seededRandom } from '../core/rng.js';

const PLACE_A = ['苍翠', '晨雾', '远山', '碧波', '金穗', '星落', '松涛', '白桦', '云影', '鹿鸣', '湖光', '赤霞', '青苔', '流泉', '麦浪', '落雁', '石阶', '芦花', '风语', '霜林'];
const PLACE_B = ['村', '屯', '寨', '湾', '坞', '原', '谷', '汀', '洲', '集', '镇', '岗'];
const SYL = ['lo', 'ri', 'an', 'tha', 'mel', 'dor', 'win', 'gal', 'fen', 'bel', 'nor', 'sil', 'ar', 'eth', 'ka', 'mi', 'ro', 'ven'];

const GIVEN = ['阿', '小', '老', '石', '木', '叶', '风', '云', '泉', '谷', '禾', '麦', '河', '岩', '星', '苔', '芽', '铃'];
const GIVEN2 = ['豆', '丫', '柱', '妞', '娃', '生', '崽', '头', '儿', '仔'];

const NATION_SUFFIX = ['王国', '部落', '城邦', '联邦', '公国', '氏族'];
const NATION_PRE = ['晨', '星', '岩', '河', '林', '风', '霜', '日', '月', '潮', '峰', '原'];

export class NameGen {
  constructor(seedStr) {
    this.rand = seededRandom(seedStr, 'names');
  }
  _pick(arr) { return arr[(this.rand() * arr.length) | 0]; }

  settlement() {
    const foreign = this.rand() < 0.25;
    if (foreign) {
      let s = this._pick(SYL) + this._pick(SYL) + (this.rand() < 0.5 ? this._pick(SYL) : '');
      return s[0].toUpperCase() + s.slice(1);
    }
    return this._pick(PLACE_A) + this._pick(PLACE_B);
  }

  citizen() {
    return this._pick(GIVEN) + (this.rand() < 0.55 ? this._pick(GIVEN2) : this._pick(GIVEN));
  }

  nation() {
    return this._pick(NATION_PRE) + this._pick(NATION_SUFFIX);
  }
}
