import { seededRandom } from '../core/rng.js';
import { BIOMES, planetEnvironment, STAR_PHASES, stellarState } from './galaxy.js';
import { PLAYER } from './simulation.js';

const GOLD = '#e7bf76';
const GREEN = '#a9ce92';
const RED = '#e7a197';
const INK = '#eae8d3';

function canvasContext(canvas) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return null;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

function dot(ctx, x, y, radius, color, outline = false) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  if (outline) { ctx.strokeStyle = color; ctx.stroke(); }
  else { ctx.fillStyle = color; ctx.fill(); }
}

function line(ctx, fromX, fromY, toX, toY, color) {
  ctx.beginPath();
  ctx.moveTo(fromX, fromY);
  ctx.lineTo(toX, toY);
  ctx.strokeStyle = color;
  ctx.stroke();
}

export class StarChart {
  constructor(canvas, sim, select) {
    this.canvas = canvas;
    this.sim = sim;
    this.center = sim.galaxy.systems[0];
    this.range = 15;
    this.selected = this.center.id;
    const random = seededRandom(sim.galaxy.seed, 'chart-background');
    this.backdrop = Array.from({ length: 420 }, () => [random(), random(), random()]);
    this.hits = [];
    const observer = new ResizeObserver(() => this.draw());
    observer.observe(canvas);
    canvas.addEventListener('click', event => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let closest = null;
      let distance = 16 ** 2;
      for (const hit of this.hits) {
        const d = (hit.x - x) ** 2 + (hit.y - y) ** 2;
        if (d < distance) { closest = hit; distance = d; }
      }
      if (closest) select(closest.system.id);
    });
  }

  focus(systemId) {
    this.center = this.sim.galaxy.byId.get(systemId);
    this.draw();
  }

  zoom(factor) {
    this.range = Math.max(3.5, Math.min(78, this.range * factor));
    this.draw();
  }

  overview(local) {
    this.center = this.sim.galaxy.systems[0];
    this.range = local ? 15 : 78;
    this.draw();
  }

  draw() {
    const canvas = canvasContext(this.canvas);
    if (!canvas) return;
    const { ctx, width, height } = canvas;
    const sim = this.sim;
    const centerX = width / 2;
    const centerY = height / 2;
    const scale = Math.min(width, height) / (this.range * 2);
    const px = system => centerX + (system.x - this.center.x) * scale;
    const py = system => centerY + (system.y - this.center.y) * scale;
    const glow = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, width * 0.65);
    glow.addColorStop(0, '#13271f');
    glow.addColorStop(1, '#0b1714');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    for (const [x, y, size] of this.backdrop) {
      ctx.globalAlpha = 0.12 + size * 0.23;
      dot(ctx, x * width, y * height, size < 0.93 ? 0.55 : 1.05, '#cfdbbb');
    }
    ctx.globalAlpha = 1;
    const home = sim.galaxy.byId.get(sim.galaxy.planets.get(sim.capital()).system);
    const gridStep = this.range > 25 ? 15 : this.range > 8 ? 5 : 2;
    for (let offset = gridStep; offset < 160; offset += gridStep) {
      if (offset * scale > Math.hypot(width, height) + Math.hypot(px(home) - centerX, py(home) - centerY)) break;
      dot(ctx, px(home), py(home), offset * scale, '#9abb9526', true);
    }
    line(ctx, px(home), 0, px(home), height, '#a9ce9223');
    line(ctx, 0, py(home), width, py(home), '#a9ce9223');

    ctx.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    this.hits = [];
    for (const system of sim.galaxy.systems) {
      const x = px(system), y = py(system);
      if (x < 8 || y < 11 || x > width - 8 || y > height - 13) continue;
      this.hits.push({ x, y, system });
      if (this.range <= 20 && system.index > 0 && system.index < 7) {
        ctx.setLineDash([3, 5]);
        line(ctx, px(home), py(home), x, y, '#9abd944d');
        ctx.setLineDash([]);
      }
    }

    for (const mission of sim.state.missions) {
      const source = sim.galaxy.byId.get(sim.galaxy.planets.get(mission.from).system);
      const target = sim.galaxy.byId.get(sim.galaxy.planets.get(mission.to).system);
      const visible = mission.actor === PLAYER || sim.state.worlds[mission.to]?.owner === PLAYER;
      if (!visible) continue;
      const color = mission.actor === PLAYER ? '#c2b98a' : RED;
      ctx.setLineDash([4, 5]);
      line(ctx, px(source), py(source), px(target), py(target), color);
      ctx.setLineDash([]);
      const progress = Math.max(0, (sim.state.year - mission.departure) / mission.flightYears);
      dot(ctx, px(source) + (px(target) - px(source)) * progress, py(source) + (py(target) - py(source)) * progress, 2.5, color);
    }

    for (const { x, y, system } of this.hits) {
      const phase = stellarState(system, sim.state.year).phase;
      const owned = system.planets.some(planet => sim.state.worlds[planet.id]?.owner === PLAYER);
      const native = system.planets.some(planet => sim.state.worlds[planet.id]);
      const selected = this.selected === system.id;
      const size = selected ? 5.5 : owned || native ? 3.3 : 2.1;
      const color = owned ? GREEN : native ? RED : STAR_PHASES[phase].color;
      if (phase === 'black-hole') {
        dot(ctx, x, y, size + 2, STAR_PHASES[phase].color, true);
        dot(ctx, x, y, size, '#080f0c');
      } else {
        dot(ctx, x, y, size + 3, `${color}24`);
        dot(ctx, x, y, size, color);
      }
      if (selected) {
        ctx.lineWidth = 1.3;
        ctx.strokeStyle = GOLD;
        ctx.strokeRect(x - 10, y - 10, 20, 20);
        ctx.lineWidth = 1;
      }
      if (selected || system.id === home.id || (this.range < 25 && system.index < 7)) {
        const measured = ctx.measureText(system.name).width;
        const nameX = x + 14 + measured > width ? x - measured - 14 : x + 14;
        ctx.fillStyle = '#0b1714d9';
        ctx.fillRect(nameX - 3, y - 9, measured + 6, 17);
        ctx.fillStyle = selected ? GOLD : INK;
        ctx.fillText(system.name, nameX, y);
      }
    }
    const yScale = height - 23;
    line(ctx, 16, yScale, 16 + gridStep * scale, yScale, '#a9ce929b');
    line(ctx, 16, yScale - 3, 16, yScale + 3, '#a9ce929b');
    line(ctx, 16 + gridStep * scale, yScale - 3, 16 + gridStep * scale, yScale + 3, '#a9ce929b');
    ctx.fillStyle = '#c5d2b9';
    ctx.fillText(`${gridStep} ly`, 18, yScale - 10);
  }
}

export function drawOrbits(canvas, system, selectedId, year) {
  const view = canvasContext(canvas);
  if (!view) return;
  const { ctx, width, height } = view;
  const environments = system.planets.map(planet => planetEnvironment(system, planet, year));
  const outer = environments.at(-1);
  const scale = Math.min(width / (outer.axis * 2.75), height / (outer.axis * 1.9));
  ctx.fillStyle = '#101d18';
  ctx.fillRect(0, 0, width, height);
  const mid = width / 2;
  const level = height / 2;
  const pitch = 0.68;
  for (const [index, location] of environments.entries()) {
    const planet = system.planets[index];
    const selected = planet.id === selectedId;
    const axis = location.axis * scale;
    const e = planet.orbit.eccentricity;
    ctx.beginPath();
    ctx.ellipse(mid - axis * e, level, axis, axis * Math.sqrt(1 - e ** 2) * pitch, 0, 0, Math.PI * 2);
    ctx.strokeStyle = selected ? '#e7bf768c' : '#97b89c3d';
    ctx.stroke();
    dot(ctx, mid + location.orbit.x * scale, level + location.orbit.y * scale * pitch, selected ? 5 : 3, BIOMES[planet.biome].color);
  }
  const { phase } = stellarState(system, year);
  dot(ctx, mid, level, 7, STAR_PHASES[phase].color, phase === 'black-hole');
}
