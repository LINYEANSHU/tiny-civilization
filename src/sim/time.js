// ============================================================
// time.js — 游戏时钟：日历 / 季节 / 昼夜 / 变速
// 1 现实秒（1×）= 12 游戏分钟；一天 120s；一年 48 天（四季各 12 天）
// ============================================================
import { GAME_MIN_PER_SEC, MIN_PER_DAY, SIM_TICK_MIN, DAYS_PER_MONTH, MONTHS_PER_YEAR } from '../core/config.js';
import { t } from '../i18n.js';

export class GameClock {
  constructor() {
    this.min = 7 * 60;      // 一天内的分钟
    this.day = 1;           // 从 1 开始的总天数
    this.speed = 1;
    this.paused = true;
  }

  get year() { return Math.floor((this.day - 1) / (DAYS_PER_MONTH * MONTHS_PER_YEAR)) + 1; }
  get dayOfYear() { return ((this.day - 1) % (DAYS_PER_MONTH * MONTHS_PER_YEAR)) + 1; }
  get month() { return Math.floor((this.dayOfYear - 1) / DAYS_PER_MONTH) + 1; }
  get season() { return Math.floor((this.dayOfYear - 1) / (DAYS_PER_MONTH * 3)); }
  get hour() { return this.min / 60; }
  get isNight() { return this.hour < 5.5 || this.hour >= 20.5; }

  // 推进真实时间，返回跨越的完整小时数（供模拟 tick）
  advance(realDt) {
    if (this.paused) return 0;
    const elapsed = this.min + realDt * GAME_MIN_PER_SEC * this.speed;
    const hours = Math.floor(elapsed / SIM_TICK_MIN) - Math.floor(this.min / SIM_TICK_MIN);
    this.day += Math.floor(elapsed / MIN_PER_DAY);
    this.min = elapsed % MIN_PER_DAY;
    return hours;
  }

  // 直接跳过 n 天（时间跳跃用），返回需处理的小时数
  advanceDays(n) {
    this.day += n;
    return n * 24;
  }

  dateLabel() {
    const doy = this.dayOfYear;
    const d = ((doy - 1) % DAYS_PER_MONTH) + 1;
    return t('date.label', { y: this.year, s: t(`season.${this.season}`), d, m: DAYS_PER_MONTH });
  }

  clockLabel() {
    const h = Math.floor(this.hour), m = Math.floor(this.min % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
