import { getLang } from './i18n.js';
import { decodeWorldSave, loadWorld } from './save.js';
import { isSpaceSave, playMode, SAVE_SLOTS, worldSlot, worldURL } from './space/modes.js';

async function start() {
  const url = new URL(location.href);
  const mode = playMode(url.searchParams.get('mode'));
  const requested = url.searchParams.get('load');
  const slot = SAVE_SLOTS.includes(requested) ? requested : 'autosave';
  let record = null;
  if (mode !== 'ground' || !url.searchParams.get('seed')) {
    try { record = await loadWorld(worldSlot(mode, slot)); }
    catch { /* Each mode handles storage errors in its own view. */ }
  }
  if (!url.searchParams.get('seed') && record) {
    try {
      const { seed } = mode !== 'ground' && isSpaceSave(record) ? record : decodeWorldSave(record);
      if (typeof seed === 'string' && seed.length && seed.length <= 512) {
        url.searchParams.set('seed', seed);
        history.replaceState(null, '', url);
      }
    } catch { /* The main app reports an unreadable checkpoint. */ }
  }
  const campaignInOrbit = mode === 'campaign' && isSpaceSave(record) && record.seed === url.searchParams.get('seed');
  if (mode === 'space' || campaignInOrbit) {
    const { startSpace } = await import('./space/app.js');
    await startSpace(mode);
  } else {
    await import('./main.js');
  }
}

start().catch(error => {
  console.error('Tiny Civilization startup failed', error);
  const zh = getLang() === 'zh';
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('done');
  overlay.innerHTML = `<div class="ov-box" role="alert"><h1>${zh ? '世界暂时无法启动' : 'The world could not start'}</h1><p class="ov-sub">${zh ? '浏览器未能完成 3D 场景初始化。请使用支持 WebGL 2 的浏览器重试。已有存档会保留。' : 'The browser could not initialize the 3D scene. Try again in a browser that supports WebGL 2. Your existing saves are preserved.'}</p><button class="tbtn">${zh ? '重试' : 'Try again'}</button></div>`;
  overlay.querySelector('button').addEventListener('click', () => location.reload());
  const link = document.createElement('a');
  link.href = worldURL('space');
  link.textContent = zh ? '进入自由星际' : 'Open interstellar sandbox';
  overlay.querySelector('.ov-box').append(' ', link);
});
