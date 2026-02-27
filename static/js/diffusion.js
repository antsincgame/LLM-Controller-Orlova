import { $, $$, showLoading, showEmpty, notify, formatNumber, show, hide } from './ui.js';

const renderDiffusionCard = (model) => {
  const shortName = model.id.includes('/')
    ? model.id.split('/')[1]
    : model.id;

  const typeBadge = `<span class="badge param">${model.modelType}</span>`;

  const fileOptions = model.files.map(f =>
    `<option value="${f.filename}">${f.filename}</option>`
  ).join('');

  return `
    <div class="model-card" data-repo-id="${model.id}" data-model-type="${model.modelType}">
      <div class="card-header">
        <div>
          <div class="card-name">${shortName}</div>
          <div class="card-author">by ${model.author}</div>
        </div>
        ${typeBadge}
      </div>
      <div class="card-stats">
        <span class="stat">↓ ${formatNumber(model.downloads)}</span>
        <span class="stat">♥ ${model.likes}</span>
        <span class="stat">${model.lastModified?.split('T')[0] ?? ''}</span>
      </div>
      <div class="card-tags">
        ${model.tags.slice(0, 6).map(t => `<span class="badge">${t}</span>`).join('')}
      </div>
      <div class="card-actions">
        <select class="file-select">${fileOptions}</select>
        <button class="btn btn-primary btn-sm diffusion-download-btn">Скачать</button>
      </div>
    </div>`;
};

const renderInstalledModel = (model) => `
  <div class="local-model-row" data-path="${model.path}">
    <div>
      <div class="local-model-name">${model.filename}</div>
      <div class="local-model-meta">${model.modelType} · ${model.sizeHuman}</div>
    </div>
    <span class="badge param">${model.modelType}</span>
    <span class="badge quant">${model.sizeHuman}</span>
    <button class="btn btn-danger btn-sm diffusion-delete-btn">Удалить</button>
  </div>`;

const startDiffusionDownload = async (repoId, filename, modelType) => {
  const modal = $('#diffusion-modal');
  const title = $('#diffusion-modal-title');
  const status = $('#diffusion-modal-status');
  const bar = $('#diffusion-progress-bar');
  const pct = $('#diffusion-progress-pct');

  title.textContent = filename;
  status.textContent = `${repoId} → ${modelType}`;
  bar.style.width = '0%';
  pct.textContent = '0%';
  show(modal);

  window.api.onDiffusionProgress((progress) => {
    status.textContent = progress.status;
    if (progress.percent != null) {
      bar.style.width = `${progress.percent}%`;
      pct.textContent = `${progress.percent}%`;
    }
  });

  try {
    const result = await window.api.downloadDiffusion(repoId, filename, modelType);
    hide(modal);
    if (result.success) {
      notify(`Модель загружена: ${filename}`, 'success');
    } else {
      notify(result.message, 'error');
    }
  } catch (err) {
    hide(modal);
    notify(`Ошибка загрузки: ${err.message}`, 'error');
  }
};

const loadInstalledDiffusion = async () => {
  const container = $('#diffusion-installed');
  showLoading(container);

  try {
    const models = await window.api.listDiffusionModels();
    if (models.length === 0) {
      showEmpty(container, 'Нет установленных diffusion-моделей. Проверьте путь к ComfyUI в настройках.');
      return;
    }
    container.innerHTML = models.map(renderInstalledModel).join('');
  } catch (err) {
    showEmpty(container, `Ошибка: ${err.message}`);
  }
};

export const initDiffusion = () => {
  const form = $('#diffusion-search-form');
  const resultsContainer = $('#diffusion-search-results');
  const installedContainer = $('#diffusion-installed');

  const subTabs = $$('.diffusion-sub');
  subTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      subTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const target = btn.dataset.sub;
      if (target === 'installed') {
        hide(resultsContainer);
        show(installedContainer);
        loadInstalledDiffusion();
      } else {
        show(resultsContainer);
        hide(installedContainer);
      }
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showLoading(resultsContainer);

    const query = $('#diffusion-query').value.trim();
    const modelType = $('#diffusion-type').value;
    const sort = $('#diffusion-sort').value;
    const author = $('#diffusion-author').value.trim();

    try {
      const result = await window.api.searchDiffusion({
        query: query || undefined,
        modelType,
        author: author || undefined,
        sort,
        limit: 30,
        offset: 0,
      });

      if (result.models.length === 0) {
        showEmpty(resultsContainer, 'Ничего не найдено');
        return;
      }

      resultsContainer.innerHTML = result.models.map(renderDiffusionCard).join('');
    } catch (err) {
      showEmpty(resultsContainer, `Ошибка: ${err.message}`);
      notify(err.message, 'error');
    }
  });

  resultsContainer.addEventListener('click', (e) => {
    const downloadBtn = e.target.closest('.diffusion-download-btn');
    if (!downloadBtn) return;

    const card = downloadBtn.closest('.model-card');
    const repoId = card.dataset.repoId;
    const modelType = card.dataset.modelType;
    const filename = card.querySelector('.file-select').value;
    startDiffusionDownload(repoId, filename, modelType);
  });

  installedContainer.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.diffusion-delete-btn');
    if (!deleteBtn) return;

    const row = deleteBtn.closest('.local-model-row');
    const filePath = row.dataset.path;

    deleteBtn.textContent = 'Удаление...';
    deleteBtn.disabled = true;

    try {
      const result = await window.api.deleteDiffusionModel(filePath);
      if (result.success) {
        row.remove();
        notify(result.message, 'success');
      } else {
        notify(result.message, 'error');
        deleteBtn.textContent = 'Удалить';
        deleteBtn.disabled = false;
      }
    } catch (err) {
      notify(`Ошибка: ${err.message}`, 'error');
      deleteBtn.textContent = 'Удалить';
      deleteBtn.disabled = false;
    }
  });

  $('#diffusion-cancel-btn').addEventListener('click', async () => {
    await window.api.cancelDiffusionDownload();
    hide($('#diffusion-modal'));
    notify('Загрузка отменена', 'warning');
  });
};
