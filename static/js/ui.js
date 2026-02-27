export const $ = (sel) => document.querySelector(sel);
export const $$ = (sel) => document.querySelectorAll(sel);

export const show = (el) => { el.hidden = false; };
export const hide = (el) => { el.hidden = true; };

export const formatNumber = (n) => {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(n);
};

export const showLoading = (container) => {
  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <span>Загрузка...</span>
    </div>`;
};

export const showEmpty = (container, message) => {
  container.innerHTML = `
    <div class="empty-state">
      <p>${message}</p>
    </div>`;
};

let toastTimer = 0;
export const notify = (message, type = 'info') => {
  const container = $('#notifications');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toast.addEventListener('click', () => toast.remove());
  container.appendChild(toast);

  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.remove(), 4000);
};

export const checkOllamaStatus = async () => {
  const dot = $('#ollama-status');
  const text = $('#ollama-status-text');
  try {
    await window.api.listLocalModels();
    dot.className = 'status-dot online';
    text.textContent = 'Ollama Online';
  } catch {
    dot.className = 'status-dot offline';
    text.textContent = 'Ollama Offline';
  }
};
