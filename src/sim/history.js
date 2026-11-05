// ============================================================
// history.js — 世界编年史（事件流）
// 事件文本存 i18n 键 + 参数：{day, year, type, key, params}，
// 渲染时按当前语言翻译（src/i18n.js 的 evText）；
// 旧存档的 {text} 条目原样显示，读档后新事件自动走新格式。
// ============================================================
const CAP = 500;

export class History {
  constructor() {
    this.events = [];   // {day, year, type, key, params} 或旧格式 {text}
    this.version = 0;   // UI 脏标记
  }

  add(type, key, params, day, year) {
    this.events.push({
      day: day ?? this._day ?? 1,
      year: year ?? this._year ?? 1,
      type, key, params,
    });
    if (this.events.length > CAP) this.events.splice(0, this.events.length - CAP);
    this.version++;
    if (this.onEvent) this.onEvent(this.events[this.events.length - 1]);
  }

  now(day, year) { this._day = day; this._year = year; }

  serialize() { return this.events; }
  static deserialize(list) {
    const h = new History();
    if (Array.isArray(list)) h.events = list;
    return h;
  }
}
