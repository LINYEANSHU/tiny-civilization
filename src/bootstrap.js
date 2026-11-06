import { getLang } from './i18n.js';

import('./main.js').catch(error => {
  console.error('Tiny Civilization startup failed', error);
  const zh = getLang() === 'zh';
  const overlay = document.getElementById('overlay');
  overlay.classList.remove('done');
  overlay.innerHTML = `<div class="ov-box" role="alert"><h1>${zh ? '世界暂时无法启动' : 'The world could not start'}</h1><p class="ov-sub">${zh ? '浏览器未能完成 3D 场景初始化。请使用支持 WebGL 2 的浏览器重试。已有存档会保留。' : 'The browser could not initialize the 3D scene. Try again in a browser that supports WebGL 2. Your existing saves are preserved.'}</p><button class="tbtn">${zh ? '重试' : 'Try again'}</button></div>`;
  overlay.querySelector('button').addEventListener('click', () => location.reload());
});
