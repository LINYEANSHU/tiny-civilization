import { onLangChange } from '../i18n.js';
import { campaignReadiness, worldURL } from './modes.js';
import { phrase } from './strings.js';

export function installLobby(mode, getSimulation, migrate, launch) {
  const button = document.getElementById('btnModes');
  const dialog = document.getElementById('modePanel');
  let busy = false;
  let message = '';
  let renderedGoals = '';

  const append = (parent, tag, label, className) => {
    const element = document.createElement(tag);
    if (label) element.textContent = label;
    if (className) element.className = className;
    parent.append(element);
    return element;
  };

  function render() {
    button.textContent = phrase(mode === 'campaign' ? 'gate' : 'modes');
    if (!dialog.open) return;
    const readiness = mode === 'campaign' && getSimulation() ? campaignReadiness(getSimulation()) : null;
    renderedGoals = readiness?.goals.map(goal => goal.progress).join(',') ?? '';
    const focused = document.activeElement?.dataset.lobby;
    dialog.replaceChildren();
    const header = append(dialog, 'header', '', 'mode-head');
    const title = append(header, 'h2', phrase(mode === 'campaign' ? 'gate' : 'modes'));
    title.id = 'modeTitle';
    const close = append(header, 'button', phrase('close'), 'tbtn');
    close.dataset.lobby = 'close';
    close.onclick = () => dialog.close();

    for (const [key, label] of [['ground', 'ground'], ['space', 'free'], ['campaign', 'campaign']]) {
      const section = append(dialog, 'section', '', 'mode-entry');
      const copy = append(section, 'div');
      append(copy, 'h3', phrase(label));
      append(copy, 'p', phrase(`${label}Desc`));
      if (key === mode) append(section, 'span', phrase('activeMode'), 'mode-note');
      else {
        const link = append(section, 'a', phrase('open'), 'tbtn');
        link.dataset.lobby = key;
        link.href = worldURL(key);
      }
    }
    if (mode === 'ground' && getSimulation()) {
      const copy = append(dialog, 'button', phrase('campaignImport'), 'tbtn');
      copy.dataset.lobby = 'migrate';
      copy.disabled = busy;
      copy.onclick = () => run(migrate);
    } else if (readiness) {
      const list = append(dialog, 'ul', '', 'mode-goals');
      for (const goal of readiness.goals) {
        const item = append(list, 'li', '', goal.progress >= goal.target ? 'goal-complete' : '');
        append(item, 'span', phrase(goal.id));
        append(item, 'strong', `${goal.progress} / ${goal.target}`);
      }
      append(dialog, 'p', phrase('gateHelp'), 'mode-note');
      const start = append(dialog, 'button', phrase('lift'), 'tbtn mode-launch');
      start.dataset.lobby = 'launch';
      start.disabled = busy || !readiness.ready;
      start.onclick = () => run(launch);
    }
    const status = append(dialog, 'p', message ? phrase(message) : '', 'mode-status');
    status.setAttribute('role', 'status');
    if (focused) dialog.querySelector(`[data-lobby="${focused}"]`)?.focus();
  }

  async function run(action) {
    if (busy) return;
    busy = true;
    message = '';
    render();
    try { message = await action() || ''; }
    catch (error) { console.warn('Campaign checkpoint failed', error); message = 'saveError'; }
    finally { busy = false; render(); }
  }

  button.onclick = () => { dialog.showModal(); render(); dialog.querySelector('button')?.focus(); };
  onLangChange(render);
  render();
  return () => {
    if (!dialog.open || mode !== 'campaign' || !getSimulation()) return;
    const goals = campaignReadiness(getSimulation()).goals.map(goal => goal.progress).join(',');
    if (goals !== renderedGoals) render();
  };
}
