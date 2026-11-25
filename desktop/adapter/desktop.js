(() => {
  const loading = document.getElementById('overlay');
  const startupMessage = new MutationObserver(() => {
    const message = loading.querySelector('[role="alert"] .ov-sub');
    if (!message) return;

    startupMessage.disconnect();
    const chinese = /[\u3400-\u9fff]/.test(message.textContent);
    message.textContent = chinese
      ? 'Windows 应用未能初始化 3D 世界。请重试或重新打开应用。本地存档已保留。'
      : 'The Windows app could not start the 3D world. Try again or reopen the app. Local saves are preserved.';
  });
  startupMessage.observe(loading, { childList: true });

  const pause = document.getElementById('btnPause');
  const icon = pause.querySelector('use');
  function updatePause() {
    const paused = pause.classList.contains('active');
    const english = document.documentElement.lang === 'en';
    const label = english
      ? (paused ? 'Resume (Space)' : 'Pause (Space)')
      : (paused ? '继续（空格）' : '暂停（空格）');
    icon.setAttribute('href', paused ? '#i-play' : '#i-pause');
    if (pause.title !== label) pause.title = label;
    pause.setAttribute('aria-label', label);
  }
  const pauseObserver = new MutationObserver(updatePause);
  pauseObserver.observe(pause, { attributeFilter: ['class', 'title'] });
  pauseObserver.observe(document.documentElement, { attributeFilter: ['lang'] });
  updatePause();
})();
