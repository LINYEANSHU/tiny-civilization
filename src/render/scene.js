// ============================================================
// scene.js — 渲染场景：天空 / 昼夜 / 季节着色 / 相机 / 阴影 / 云
// 相机为自定义轨道控制（阻尼），支持 flyTo 平滑跳转。
// ============================================================
import * as THREE from 'three';
import { clamp, lerp } from '../core/noise.js';
import { seededRandom } from '../core/rng.js';
import { SEASON_COLORS } from '../core/config.js';

const SKY_KEYS = [ // [hour, zenith, horizon, sunColor, hemiIntensity, sunIntensity]
  [0, 0x070d1c, 0x0e1830, 0x8090b8, 0.22, 0.0],
  [4.5, 0x0a1226, 0x14203a, 0x8090b8, 0.24, 0.0],
  [6, 0x35507e, 0xe8946a, 0xffc98a, 0.5, 0.85],
  [8, 0x3f86d2, 0xd8eaf8, 0xfff1d8, 0.95, 1.6],
  [12, 0x3f86d2, 0xd8eaf8, 0xfff6e2, 1.08, 1.9],
  [16.5, 0x3f86d2, 0xd8eaf8, 0xffedc4, 1.0, 1.7],
  [18.5, 0x4a5f96, 0xf0a05e, 0xffb070, 0.62, 1.0],
  [20, 0x1a2544, 0x54466a, 0xd08a60, 0.34, 0.25],
  [21.5, 0x0a1226, 0x14203a, 0x8090b8, 0.24, 0.0],
  [24, 0x070d1c, 0x0e1830, 0x8090b8, 0.22, 0.0],
];

const _c2 = new THREE.Color();
// setEnvironment 每帧复用的目标色（旧实现每次 clone，产生 3 个 Color/帧）
const _zen = new THREE.Color();
const _hor = new THREE.Color();
const _sunC = new THREE.Color();
function skyLerp(hour, field, out) {
  for (let i = 0; i < SKY_KEYS.length - 1; i++) {
    const a = SKY_KEYS[i], b = SKY_KEYS[i + 1];
    if (hour >= a[0] && hour <= b[0]) {
      const t = (hour - a[0]) / Math.max(0.001, b[0] - a[0]);
      if (field === 'hemi') return lerp(a[4], b[4], t);
      if (field === 'sun') return lerp(a[5], b[5], t);
      return out.setHex(a[field === 'zenith' ? 1 : field === 'horizon' ? 2 : 3]).lerp(_c2.setHex(b[field === 'zenith' ? 1 : field === 'horizon' ? 2 : 3]), t);
    }
  }
  return out.setHex(SKY_KEYS[0][1]);
}

export class Scene3D {
  constructor(canvas, atlasTex, waterTex) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xd8eaf8, 120, 420);
    this.camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.5, 2600);
    this.camera.position.set(80, 70, 80);

    // ---------- 天空 ----------
    this.skyU = {
      uZenith: { value: new THREE.Color(0x3f86d2) },
      uHorizon: { value: new THREE.Color(0xd8eaf8) },
      uBelow: { value: new THREE.Color(0x647486) },
      uSunDir: { value: new THREE.Vector3(0.5, 0.7, 0.3) },
      uSunColor: { value: new THREE.Color(0xfff0c4) },
      uStars: { value: 0 },
    };
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      uniforms: this.skyU,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position.z = gl_Position.w;
        }`,
      fragmentShader: `
        varying vec3 vDir;
        uniform vec3 uZenith, uHorizon, uBelow, uSunColor, uSunDir;
        uniform float uStars;
        float hash(vec3 p){ p = fract(p*0.3183099+vec3(0.1,0.2,0.3)); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        void main() {
          vec3 d = normalize(vDir);
          vec3 col = mix(uHorizon, uZenith, pow(clamp(d.y, 0.0, 1.0), 0.6));
          col = mix(col, uBelow, clamp(-d.y * 2.6, 0.0, 1.0));
          float s = clamp(dot(d, normalize(uSunDir)), 0.0, 1.0);
          col += uSunColor * (pow(s, 260.0) * 1.3 + pow(s, 7.0) * 0.12);
          // 星星
          if (uStars > 0.01 && d.y > 0.05) {
            vec3 sp = floor(d * 220.0);
            float st = step(0.9982, hash(sp));
            col += vec3(0.9, 0.93, 1.0) * st * uStars * (0.4 + 0.6 * hash(sp + 7.0));
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 20), skyMat);
    this.sky.renderOrder = -1;
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);

    // ---------- 光照 ----------
    this.hemi = new THREE.HemisphereLight(0xcfe4ff, 0x9c8a6c, 1.0);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1d8, 2.0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.camera.near = 20;
    this.sun.shadow.camera.far = 620;
    this.sun.shadow.bias = -0.0002;
    this.sun.shadow.normalBias = 0.5;
    // 阴影视锥四界为常量 → 构造时设置一次并更新投影
    // （原实现在 setEnvironment 每帧重复赋值 + 重算投影矩阵）
    {
      const sc = this.sun.shadow.camera;
      sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120;
      sc.updateProjectionMatrix();
    }
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    // ---------- 材质 ----------
    const uTime = { value: 0 };
    const uSeason = { value: new THREE.Color(1, 1, 1) };
    const uSnow = { value: 0 };
    const uNightGlow = { value: 0 };
    this._uTime = uTime; this._uSeason = uSeason; this._uSnow = uSnow; this._uNightGlow = uNightGlow;

    this.solidMat = new THREE.MeshLambertMaterial({
      map: atlasTex, vertexColors: true, alphaTest: 0.5,
    });
    this.solidMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.uniforms.uSeason = uSeason;
      shader.uniforms.uSnow = uSnow;
      shader.uniforms.uNightGlow = uNightGlow;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
        attribute float aSway;
        attribute float aMat;
        varying float vMat;
        uniform float uTime;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
        vMat = aMat;
        transformed.x += aSway * sin(uTime * 1.9 + position.x * 1.3 + position.z * 1.1) * 0.07;
        transformed.z += aSway * cos(uTime * 1.6 + position.x * 1.1 + position.z * 1.5) * 0.06;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
        varying float vMat;
        uniform vec3 uSeason;
        uniform float uSnow;
        uniform float uNightGlow;`)
        .replace('#include <map_fragment>', `#include <map_fragment>
        float mClass = vMat * 4.0;
        if (mClass > 0.6 && mClass < 1.4) {
          diffuseColor.rgb *= uSeason;
        } else if (mClass < 0.6) {
          diffuseColor.rgb *= mix(vec3(1.0), uSeason, 0.5);
          float lum = dot(diffuseColor.rgb, vec3(0.333));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.87, 0.91, 0.96) * (0.45 + lum), uSnow);
        } else if (mClass > 1.6 && mClass < 2.4) {
          diffuseColor.rgb *= mix(vec3(1.0), uSeason, 0.24);
        }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        if (mClass > 3.5) {
          totalEmissiveRadiance += diffuseColor.rgb * (0.5 + uNightGlow * 1.1);
        }`);
    };

    this.waterMat = new THREE.MeshPhongMaterial({
      map: waterTex, transparent: true, opacity: 0.72, depthWrite: false,
      shininess: 130, specular: new THREE.Color(0x9dbede),
    });
    this._waterShader = null;
    const self = this;
    this.waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;\nattribute float aWave;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          transformed.y += aWave * ( sin( uTime * 1.7 + position.x * 0.9 + position.z * 0.7 ) * 0.05 - 0.028 );`);
      self._waterShader = shader;
    };

    // ---------- 云 ----------
    this.clouds = null;
    this._buildClouds();

    // ---------- 相机控制 ----------
    this.cam = { target: new THREE.Vector3(0, 20, 0), dist: 90, yaw: 0.7, pitch: 0.62 };
    this.camGoal = { target: this.cam.target.clone(), dist: 90 };
    this._bindControls();

    this.onStats = null;
    this._clock = new THREE.Clock();
    this._frames = 0; this._statTime = 0; this._statStart = performance.now();
    this._running = true;
    this._renderCb = null;
    this._lastRafAt = performance.now();
    this._lastFrameAt = performance.now();
    this._loop = this._loop.bind(this);
    this._scheduleNext();
    // 看门狗：rAF 因窗口不可见被节流时退化为定时器驱动（移植自 WorldForge）
    this._watchdog = setInterval(() => {
      if (!this._running) return;
      if (performance.now() - this._lastFrameAt > 500) {
        this._lastRafAt = 0;
        this._loop();
      }
    }, 400);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  _buildClouds() {
    const rand = seededRandom('clouds-tc', 'g');
    const items = [];
    for (let i = 0; i < 42; i++) {
      const cx = (rand() - 0.5) * 1400;
      const cz = (rand() - 0.5) * 1400;
      const cy = 86 + rand() * 16;
      const puffs = 2 + ((rand() * 4) | 0);
      for (let p = 0; p < puffs; p++) {
        items.push({
          x: cx + (rand() - 0.5) * 16, y: cy + (rand() - 0.5) * 2.5, z: cz + (rand() - 0.5) * 12,
          sx: 8 + rand() * 13, sy: 1.8 + rand() * 1.4, sz: 6 + rand() * 9,
        });
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1);
    const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.82, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geo, mat, items.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    items.forEach((c, i) => {
      m.compose(new THREE.Vector3(c.x, c.y, c.z), q, new THREE.Vector3(c.sx, c.sy, c.sz));
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.renderOrder = 3;
    this.clouds = mesh;
    this.scene.add(mesh);
  }

  // ---------- 控制绑定 ----------
  _bindControls() {
    const el = this.canvas;
    let dragBtn = -1, lx = 0, ly = 0;
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => {
      dragBtn = e.button; lx = e.clientX; ly = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointerup', (e) => {
      if (dragBtn === 0 && Math.abs(e.clientX - lx) + Math.abs(e.clientY - ly) < 5 && this.onClick) {
        this.onClick(e.clientX, e.clientY);
      }
      dragBtn = -1;
    });
    window.addEventListener('pointermove', (e) => {
      if (dragBtn < 0) return;
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (dragBtn === 1) {
        // 中键：旋转
        this.cam.yaw -= dx * 0.0052;
        this.cam.pitch = clamp(this.cam.pitch + dy * 0.0042, 0.12, 1.45);
      } else {
        // 左键 / 右键：抓取式平移（地面跟随鼠标：上拖拉近、下拖拉远）
        const k = this.cam.dist * 0.0016;
        const sinY = Math.sin(this.cam.yaw), cosY = Math.cos(this.cam.yaw);
        this.camGoal.target.x -= (cosY * dx + sinY * dy) * k;
        this.camGoal.target.z -= (-sinY * dx + cosY * dy) * k;
        this._clampTarget();
      }
    });
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.camGoal.dist = clamp(this.camGoal.dist * (e.deltaY > 0 ? 1.13 : 0.885), 7, 1500);
    }, { passive: false });

    // 中键按下时防止触发自动滚动
    el.addEventListener('auxclick', (e) => e.preventDefault());

    // 键盘平移
    this._keys = {};
    window.addEventListener('keydown', (e) => {
      if (e.target && ['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
      this._keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this._keys[e.code] = false; });
  }

  _clampTarget() {
    const t = this.camGoal.target;
    t.x = clamp(t.x, -5000, 5000);
    t.z = clamp(t.z, -5000, 5000);
  }

  flyTo(x, z, dist) {
    this.camGoal.target.set(x, 0, z);
    this.camGoal.target.y = this._groundHint ? this._groundHint(x, z) : 20;
    if (dist) this.camGoal.dist = clamp(dist, 7, 1500);
  }

  setGroundHint(fn) { this._groundHint = fn; }

  _updateCamera(dt) {
    // 键盘平移
    const k = this._keys;
    const pan = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const strafe = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    if (pan || strafe) {
      const spd = this.cam.dist * 0.9 * dt;
      const sinY = Math.sin(this.cam.yaw), cosY = Math.cos(this.cam.yaw);
      this.camGoal.target.x += (-sinY * -pan + cosY * strafe) * spd;
      this.camGoal.target.z += (-cosY * -pan - sinY * strafe) * spd;
      this._clampTarget();
    }
    // 阻尼趋近
    const f = 1 - Math.pow(0.0008, dt);
    this.cam.target.lerp(this.camGoal.target, f);
    this.cam.dist = lerp(this.cam.dist, this.camGoal.dist, f);

    const { target, dist, yaw, pitch } = this.cam;
    const cy = Math.cos(pitch) * dist;
    this.camera.position.set(
      target.x + Math.sin(yaw) * cy,
      target.y + Math.sin(pitch) * dist,
      target.z + Math.cos(yaw) * cy,
    );
    this.camera.lookAt(target);
  }

  // ---------- 每帧环境（由 main 调用） ----------
  setEnvironment(clock, weatherState, weatherIntensity) {
    const hour = clock.hour;
    // 太阳方向（直接写入 uniform 向量，避免每帧 new Vector3）
    const dayFrac = clamp((hour - 6) / 12, -0.35, 1.35);
    const elev = Math.sin(dayFrac * Math.PI);
    const azim = -0.9 + dayFrac * 1.4;
    this.skyU.uSunDir.value.set(Math.cos(azim) * 0.5, Math.max(elev, -0.4), Math.sin(azim) * 0.5).normalize();

    // 写入复用的 scratch 色（数值与旧 clone 路径完全一致）
    const zenith = skyLerp(hour, 'zenith', _zen);
    const horizon = skyLerp(hour, 'horizon', _hor);
    const sunCol = skyLerp(hour, 'sunColor', _sunC);
    let hemiI = skyLerp(hour, 'hemi');
    let sunI = skyLerp(hour, 'sun');

    // 夜晚
    const nightF = 1 - clamp((elev + 0.12) * 5, 0, 1);
    this.skyU.uStars.value = nightF;
    this._uNightGlow.value = nightF;

    // 天气调制
    if (weatherIntensity > 0) {
      const dim = 1 - weatherIntensity * 0.38;
      sunI *= dim; hemiI *= 1 - weatherIntensity * 0.18;
      zenith.lerp(_c2.setHex(0x76829a), weatherIntensity * 0.55);
      horizon.lerp(_c2.setHex(0x9aa3ae), weatherIntensity * 0.55);
      sunCol.lerp(_c2.setHex(0xc5ccd4), weatherIntensity * 0.45);
    }

    this.skyU.uZenith.value.copy(zenith);
    this.skyU.uHorizon.value.copy(horizon);
    this.skyU.uSunColor.value.copy(sunCol);
    this.hemi.intensity = hemiI;
    this.hemi.color.copy(horizon).lerp(_c2.setHex(0xffffff), 0.4);
    this.sun.intensity = sunI;
    this.sun.color.copy(sunCol);

    // 太阳位置跟随观察目标（阴影窗口）——直接复用 uniform 中的太阳方向
    const t = this.cam.target;
    const sd = this.skyU.uSunDir.value;
    this.sun.position.set(t.x + sd.x * 240, t.y + sd.y * 240 + 30, t.z + sd.z * 240);
    this.sun.target.position.copy(t);
    // 阴影相机视锥在构造函数中一次性设置（常量），此处无需每帧重算投影

    // 雾
    const fog = this.scene.fog;
    const fogBase = weatherIntensity > 0 ? lerp(90, 26, weatherIntensity) : 110;
    fog.near = fogBase;
    fog.far = weatherIntensity > 0 ? lerp(430, 150, weatherIntensity) : 460;
    fog.color.copy(horizon);

    // 季节着色
    const doy = clock.dayOfYear;
    const si = clock.season;
    const within = (doy - 1) % 12 / 12;
    const cCur = SEASON_COLORS[si].g;
    const cNext = SEASON_COLORS[(si + 1) % 4].g;
    const blend = within > 0.85 ? (within - 0.85) / 0.15 : 0;
    this._uSeason.value.setRGB(
      lerp(cCur[0], cNext[0], blend),
      lerp(cCur[1], cNext[1], blend),
      lerp(cCur[2], cNext[2], blend),
    );
    // 冬季积雪渐入，其余季节无雪
    let snowT = 0;
    if (si === 3) snowT = clamp(within * 4, 0, 1);
    this._uSnow.value = snowT * 0.85;
  }

  // rAF 被节流时自动退化为定时器驱动，保证后台标签页中世界持续运转
  _scheduleNext() {
    if (!this._running) return;
    const rafHealthy = (performance.now() - this._lastRafAt) < 600;
    if (rafHealthy) {
      requestAnimationFrame(() => {
        this._lastRafAt = performance.now();
        this._loop();
      });
    } else {
      setTimeout(() => this._loop(), 16);
      requestAnimationFrame(() => { this._lastRafAt = performance.now(); });
    }
  }

  _loop() {
    if (!this._running) return;
    this._lastFrameAt = performance.now();
    this._scheduleNext();
    const realDt = Math.min(this._clock.getDelta(), 2.0);
    const dt = Math.min(realDt, 0.05);
    const t = this._clock.elapsedTime;
    this._uTime.value = t;

    this._updateCamera(dt);

    if (this._waterShader) this._waterShader.uniforms.uTime.value = t;
    if (this.clouds) {
      this.clouds.position.x = ((t * 1.2) % 300) - 150;
      this.clouds.position.z = Math.sin(t * 0.02) * 12;
    }
    this.sky.position.copy(this.camera.position);

    if (this._renderCb) this._renderCb(dt, realDt);

    this.renderer.render(this.scene, this.camera);

    this._frames++;
    this._statTime += dt;
    if (this._statTime >= 0.5 && this.onStats) {
      const info = this.renderer.info.render;
      const real = (performance.now() - this._statStart) / 1000;
      this.onStats({
        fps: Math.round(this._frames / Math.max(0.001, real)),
        calls: info.calls,
        tris: info.triangles,
      });
      this._frames = 0;
      this._statTime = 0;
      this._statStart = performance.now();
    }
  }
}
