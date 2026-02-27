import { $, notify } from './ui.js';

const loadSettings = async () => {
  try {
    const config = await window.api.getConfig();
    $('#cfg-hf-token').value = config.hfToken ?? '';
    $('#cfg-ollama-host').value = config.ollamaHost ?? 'http://127.0.0.1:11434';
    $('#cfg-models-path').value = config.modelsPath ?? '';
    $('#cfg-comfyui-path').value = config.comfyuiPath ?? '';
    $('#cfg-cache-ttl').value = config.cacheTtlMinutes ?? 15;
  } catch (err) {
    notify(`Не удалось загрузить настройки: ${err.message}`, 'error');
  }
};

export const initSettings = () => {
  loadSettings();

  $('#detect-comfyui-btn').addEventListener('click', async () => {
    try {
      const detected = await window.api.detectComfyUI();
      if (detected) {
        $('#cfg-comfyui-path').value = detected;
        notify(`ComfyUI найден: ${detected}`, 'success');
      } else {
        notify('ComfyUI не найден в стандартных путях', 'warning');
      }
    } catch (err) {
      notify(`Ошибка: ${err.message}`, 'error');
    }
  });

  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const hfToken = $('#cfg-hf-token').value.trim() || null;
    const ollamaHost = $('#cfg-ollama-host').value.trim() || 'http://127.0.0.1:11434';
    const modelsPath = $('#cfg-models-path').value.trim() || null;
    const comfyuiPath = $('#cfg-comfyui-path').value.trim() || null;
    const cacheTtlMinutes = parseInt($('#cfg-cache-ttl').value, 10) || 15;

    try {
      if (modelsPath) {
        const result = await window.api.setModelsPath(modelsPath);
        if (!result.success) {
          notify(result.message, 'error');
          return;
        }
      }

      await window.api.saveConfig({ hfToken, ollamaHost, modelsPath, comfyuiPath, cacheTtlMinutes });
      notify('Настройки сохранены', 'success');
    } catch (err) {
      notify(`Ошибка: ${err.message}`, 'error');
    }
  });
};
