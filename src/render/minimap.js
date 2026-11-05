// ============================================================
// minimap.js — 二维世界地图（角落小地图 + 全屏宏观地图）
// 地形由 Worker 采样（小图 512 / 大图 1024）；
// 大图叠加：国家领地、聚落规模、商路、战争、相机位置。
// ============================================================
export class Minimap {
  constructor(canvas, cm) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cm = cm;
    this.worldSpan = 10000;
    this.terrainReady = false;
    this.political = false;     // E4：政治模式（国家领地晕染）
    this._terrain = null;       // 小图 canvas
    this._terrainBig = null;    // 大图 canvas（懒加载 1024）
    this._lastOverlay = 0;
    this.onClick = null;

    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      const wx = (fx - 0.5) * this.worldSpan;
      const wz = (fy - 0.5) * this.worldSpan;
      if (this.onClick) this.onClick(wx, wz);
    });
  }

  async _sample(n) {
    const step = this.worldSpan / n;
    return this.cm.requestMinimap(-this.worldSpan / 2, -this.worldSpan / 2, step, n);
  }

  _toCanvas(rgb, n) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = n;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(n, n);
    for (let i = 0, j = 0; i < n * n; i++, j += 3) {
      img.data[i * 4] = rgb[j];
      img.data[i * 4 + 1] = rgb[j + 1];
      img.data[i * 4 + 2] = rgb[j + 2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return cv;
  }

  async loadTerrain() {
    const rgb = await this._sample(512);
    this._terrain = this._toCanvas(rgb, 512);
    this.terrainReady = true;
    this.render(0, 0, [], null, [], 0);
  }

  // 大图首次打开时高清采样（1024²，Worker 后台执行）
  async ensureBigTerrain() {
    if (this._terrainBig || this._bigLoading) return;
    this._bigLoading = true;
    try {
      const rgb = await this._sample(1024);
      this._terrainBig = this._toCanvas(rgb, 1024);
    } finally { this._bigLoading = false; }
  }

  // E4：切换 地形/政治 模式，返回当前是否为政治模式
  toggleMode() {
    this.political = !this.political;
    return this.political;
  }

  _xy(canvas, x, z) {
    return [
      (x / this.worldSpan + 0.5) * canvas.width,
      (z / this.worldSpan + 0.5) * canvas.height,
    ];
  }

  // ---------- 角落小地图 ----------
  render(camX, camZ, settlements, nations, wars, timeMs) {
    if (!this.terrainReady) return;
    if (timeMs - this._lastOverlay < 250) return;
    this._lastOverlay = timeMs;
    const ctx = this.ctx;
    const cv = this.canvas;
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.drawImage(this._terrain, 0, 0);

    // E4 政治模式：国家领地晕染（低透明度径向渐变，不遮地形）
    if (this.political && nations) {
      for (const n of nations.list) {
        const col = `#${n.color.toString(16).padStart(6, '0')}`;
        for (const mid of n.members) {
          const s = settlements[mid];
          if (!s) continue;
          const [x, y] = this._xy(cv, s.x, s.z);
          const r = 12 + Math.sqrt(Math.max(0, s.pop)) * 2.0;
          const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
          grad.addColorStop(0, col + '4d');
          grad.addColorStop(1, col + '00');
          ctx.fillStyle = grad;
          ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    for (const s of settlements) {
      const n = nations ? nations.get(s.nationId) : null;
      const [x, y] = this._xy(cv, s.x, s.z);
      const pop = Math.round(s.pop);
      const r = 3 + Math.min(7, Math.sqrt(pop) * 1.15);
      ctx.beginPath();
      ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
      ctx.fillStyle = n ? `#${n.color.toString(16).padStart(6, '0')}55` : '#ffffff33';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
      ctx.fillStyle = n ? `#${n.color.toString(16).padStart(6, '0')}` : '#ddd';
      ctx.fill();
      ctx.strokeStyle = '#00000066';
      ctx.stroke();
      if (s.pop > 15) {
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#ffffffcc';
        ctx.textAlign = 'center';
        ctx.fillText(`${s.name} ${pop}`, x, y - r - 3);
      }
    }
    this._drawWars(ctx, cv, settlements, wars, null);
    this._drawCamera(ctx, cv, camX, camZ);
  }

  _drawWars(ctx, cv, settlements, wars, sim) {
    if (!wars) return;
    for (const w of wars) {
      const a = settlements.find(s => s.nationId === w.a);
      const b = settlements.find(s => s.nationId === w.b);
      if (!a || !b) continue;
      const [x1, y1] = this._xy(cv, a.x, a.z);
      const [x2, y2] = this._xy(cv, b.x, b.z);
      // 战争前线：两国之间红色虚线
      ctx.strokeStyle = '#ff5a4a99';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚔', mx, my);
    }
  }

  _drawCamera(ctx, cv, camX, camZ) {
    const [cx, cy] = this._xy(cv, camX, camZ);
    ctx.strokeStyle = '#ffd97a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy); ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8); ctx.lineTo(cx, cy + 8);
    ctx.stroke();
  }

  // ---------- 全屏宏观地图 ----------
  renderBig(canvas, sim, camX, camZ) {
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    // 地形
    ctx.imageSmoothingEnabled = false;
    if (this._terrainBig) ctx.drawImage(this._terrainBig, 0, 0, size, size);
    else if (this._terrain) ctx.drawImage(this._terrain, 0, 0, size, size);
    else return;
    ctx.imageSmoothingEnabled = true;

    const settlements = sim.settlements;
    const nations = sim.nations;

    // 国家领地晕染
    for (const n of nations.list) {
      const col = `#${n.color.toString(16).padStart(6, '0')}`;
      for (const mid of n.members) {
        const s = settlements[mid];
        if (!s) continue;
        const [x, y] = this._xy(canvas, s.x, s.z);
        const r = (14 + Math.sqrt(Math.max(0, s.pop)) * 2.6) / 10000 * size;
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
        grad.addColorStop(0, col + '38');
        grad.addColorStop(1, col + '00');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }

    // 商路
    ctx.lineWidth = 1.2;
    for (const s of settlements) {
      for (const [pid, vol] of s.tradePartners) {
        const b = settlements.find(q => q.id === pid);
        if (!b || s.id > b.id) continue;
        const [x1, y1] = this._xy(canvas, s.x, s.z);
        const [x2, y2] = this._xy(canvas, b.x, b.z);
        ctx.strokeStyle = `rgba(255, 217, 122, ${Math.min(0.5, 0.15 + vol / 150)})`;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      }
    }

    this._drawWars(ctx, canvas, settlements, nations.wars, sim);

    // 聚落
    for (const s of settlements) {
      const n = nations.get(s.nationId);
      const col = n ? `#${n.color.toString(16).padStart(6, '0')}` : '#cccccc';
      const [x, y] = this._xy(canvas, s.x, s.z);
      const r = (4 + Math.sqrt(Math.max(0, s.pop)) * 1.5) / 10000 * size;
      // 发展等级光圈
      if (s.devLevel >= 2) {
        ctx.strokeStyle = '#ffffff88';
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.arc(x, y, r + 3.5, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.strokeStyle = '#000000aa';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 名称与人口
      ctx.font = `${Math.max(11, size / 90) | 0}px "Microsoft YaHei", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#00000099';
      ctx.strokeText(`${s.name} ${Math.round(s.pop)}`, x, y - r - 4);
      ctx.fillStyle = '#fff';
      ctx.fillText(`${s.name} ${Math.round(s.pop)}`, x, y - r - 4);
    }

    this._drawCamera(ctx, canvas, camX, camZ);
  }
}
