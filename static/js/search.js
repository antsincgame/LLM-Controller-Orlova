import { $, showLoading, showEmpty, notify, formatNumber, show, hide } from './ui.js';

let currentModels = [];

const renderModelCard = (model, score) => {
  const quants = model.quantizations?.map(q =>
    `<span class="badge quant">${q.label}</span>`
  ).join('') ?? '';

  const paramBadge = model.parameterSize
    ? `<span class="badge param">${model.parameterSize}</span>`
    : '';

  const chatBadge = model.hasChatTemplate
    ? `<span class="badge chat">chat</span>`
    : '';

  const scoreBadge = score != null
    ? `<span class="card-score">${score}</span>`
    : '';

  const shortName = model.id.includes('/')
    ? model.id.split('/')[1]
    : model.id;

  const options = model.quantizations?.map(q =>
    `<option value="${q.label}">${q.label}</option>`
  ).join('') ?? '';

  return `
    <div class="model-card" data-model-id="${model.id}">
      <div class="card-header">
        <div>
          <div class="card-name">${shortName}</div>
          <div class="card-author">by ${model.author}</div>
        </div>
        ${scoreBadge}
      </div>
      <div class="card-stats">
        <span class="stat">↓ ${formatNumber(model.downloads)}</span>
        <span class="stat">♥ ${model.likes}</span>
        <span class="stat">${model.lastModified?.split('T')[0] ?? ''}</span>
      </div>
      <div class="card-tags">
        ${paramBadge}${chatBadge}${quants}
      </div>
      <div class="card-actions">
        <select class="quant-select">${options}</select>
        <button class="btn btn-primary btn-sm pull-btn" data-model="${model.id}">Pull</button>
      </div>
    </div>`;
};

const renderResults = (models, scores) => {
  const container = $('#search-results');
  if (models.length === 0) {
    showEmpty(container, 'Ничего не найдено');
    return;
  }

  const scoreMap = new Map();
  if (scores) {
    scores.forEach(s => scoreMap.set(s.modelId, s.score));
  }

  container.innerHTML = models.map(m =>
    renderModelCard(m, scoreMap.get(m.id) ?? null)
  ).join('');
};

const startPull = async (modelId, quant) => {
  const modal = $('#pull-modal');
  const title = $('#pull-modal-title');
  const status = $('#pull-modal-status');
  const bar = $('#pull-progress-bar');
  const pct = $('#pull-progress-pct');

  title.textContent = `${modelId}`;
  status.textContent = `Квантование: ${quant}`;
  bar.style.width = '0%';
  pct.textContent = '0%';
  show(modal);

  window.api.onPullProgress((progress) => {
    status.textContent = progress.status;
    if (progress.percent != null) {
      bar.style.width = `${progress.percent}%`;
      pct.textContent = `${progress.percent}%`;
    }
  });

  try {
    const result = await window.api.pullModel(modelId, quant);
    hide(modal);
    if (result.success) {
      notify(`Модель загружена: ${modelId}`, 'success');
    } else {
      notify(result.message, 'error');
    }
  } catch (err) {
    hide(modal);
    notify(`Ошибка загрузки: ${err.message}`, 'error');
  }
};

export const initSearch = () => {
  const form = $('#search-form');
  const rankBtn = $('#rank-btn');
  const resultsContainer = $('#search-results');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading(resultsContainer);

    const query = $('#search-query').value.trim();
    const sort = $('#search-sort').value;
    const minQuant = $('#search-quant').value;
    const author = $('#search-author').value.trim();

    try {
      const result = await window.api.searchModels({
        query: query || undefined,
        author: author || undefined,
        sort,
        minQuant,
        limit: 30,
        offset: 0,
      });

      currentModels = result.models;
      renderResults(currentModels, null);
      rankBtn.disabled = currentModels.length === 0;
    } catch (err) {
      showEmpty(resultsContainer, `Ошибка: ${err.message}`);
      notify(err.message, 'error');
    }
  });

  rankBtn.addEventListener('click', async () => {
    if (currentModels.length === 0) return;
    showLoading(resultsContainer);

    try {
      const result = await window.api.rankModels({
        taskPreference: 'code',
        topK: 20,
      });

      if (result.ranked?.length) {
        const rankedIds = new Set(result.ranked.map(r => r.modelId));
        const rankedModels = currentModels.filter(m => rankedIds.has(m.id));
        rankedModels.sort((a, b) => {
          const sa = result.ranked.find(r => r.modelId === a.id)?.score ?? 0;
          const sb = result.ranked.find(r => r.modelId === b.id)?.score ?? 0;
          return sb - sa;
        });
        renderResults(rankedModels, result.ranked);
      }
    } catch (err) {
      notify(`Ранжирование не удалось: ${err.message}`, 'error');
    }
  });

  resultsContainer.addEventListener('click', (e) => {
    const pullBtn = e.target.closest('.pull-btn');
    if (!pullBtn) return;

    const card = pullBtn.closest('.model-card');
    const modelId = card.dataset.modelId;
    const quant = card.querySelector('.quant-select').value;
    startPull(modelId, quant);
  });

  $('#pull-cancel-btn').addEventListener('click', async () => {
    await window.api.cancelPull();
    hide($('#pull-modal'));
    notify('Загрузка отменена', 'warning');
  });
};
