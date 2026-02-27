import { $, showLoading, showEmpty, notify } from './ui.js';

const renderLocalModel = (model) => `
  <div class="local-model-row" data-name="${model.name}">
    <div>
      <div class="local-model-name">${model.name}</div>
      <div class="local-model-meta">${model.family} · ${model.parameterSize} · ${model.quantizationLevel}</div>
    </div>
    <span class="badge param">${model.sizeHuman}</span>
    <span class="local-model-meta">${model.modifiedAt.split('T')[0]}</span>
    <button class="btn btn-secondary btn-sm check-update-btn">Обновления</button>
    <button class="btn btn-danger btn-sm delete-btn">Удалить</button>
  </div>`;

const loadModels = async () => {
  const container = $('#local-models');
  showLoading(container);

  try {
    const models = await window.api.listLocalModels();
    if (models.length === 0) {
      showEmpty(container, 'Нет установленных моделей');
      return;
    }
    container.innerHTML = models.map(renderLocalModel).join('');
  } catch (err) {
    showEmpty(container, `Не удалось загрузить: ${err.message}`);
  }
};

export const initLocal = () => {
  const container = $('#local-models');

  loadModels();

  $('#refresh-local').addEventListener('click', loadModels);

  container.addEventListener('click', async (e) => {
    const deleteBtn = e.target.closest('.delete-btn');
    if (deleteBtn) {
      const row = deleteBtn.closest('.local-model-row');
      const name = row.dataset.name;

      deleteBtn.textContent = 'Удаление...';
      deleteBtn.disabled = true;

      try {
        const result = await window.api.deleteModel(name);
        if (result.success) {
          row.remove();
          notify(`Удалено: ${name}`, 'success');
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
      return;
    }

    const updateBtn = e.target.closest('.check-update-btn');
    if (updateBtn) {
      const row = updateBtn.closest('.local-model-row');
      const name = row.dataset.name;

      updateBtn.textContent = 'Проверка...';
      updateBtn.disabled = true;

      try {
        const result = await window.api.checkModelUpdate(name);
        notify(result.message, result.hasUpdate ? 'warning' : 'info');
      } catch (err) {
        notify(`Ошибка: ${err.message}`, 'error');
      }

      updateBtn.textContent = 'Обновления';
      updateBtn.disabled = false;
    }
  });
};
