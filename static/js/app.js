import { $$, checkOllamaStatus } from './ui.js';
import { initSearch } from './search.js';
import { initLocal } from './local.js';
import { initDiffusion } from './diffusion.js';
import { initDisk } from './disk.js';
import { initSettings } from './settings.js';

const initTabs = () => {
  const buttons = $$('[data-tab]');
  const sections = $$('[data-section]');

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      buttons.forEach(b => b.classList.remove('active'));
      sections.forEach(s => s.classList.remove('active'));
      btn.classList.add('active');
      document.querySelector(`[data-section="${target}"]`)?.classList.add('active');
    });
  });
};

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initSearch();
  initLocal();
  initDiffusion();
  initDisk();
  initSettings();
  checkOllamaStatus();
  setInterval(checkOllamaStatus, 30_000);
});
