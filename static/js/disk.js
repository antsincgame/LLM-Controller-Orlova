import { $, showLoading, showEmpty, notify } from './ui.js';

const renderDiskRow = (disk, isCurrent) => {
  const pctUsed = disk.usedPercent;
  const barClass = pctUsed > 90 ? 'crit' : pctUsed > 75 ? 'warn' : '';
  const currentLabel = isCurrent ? ' current' : '';

  return `
    <div class="disk-row${currentLabel}">
      <div class="disk-row-header">
        <span class="disk-path">${disk.path}${isCurrent ? ' (модели)' : ''}</span>
        <span class="disk-free">${disk.freeHuman} свободно / ${disk.totalHuman}</span>
      </div>
      <div class="disk-bar">
        <div class="disk-bar-fill ${barClass}" style="width: ${pctUsed}%"></div>
      </div>
    </div>`;
};

const loadDisk = async () => {
  const container = $('#disk-info');
  showLoading(container);

  try {
    const report = await window.api.getDiskInfo();

    if (report.disks.length === 0) {
      showEmpty(container, 'Не удалось получить информацию о дисках');
      return;
    }

    container.innerHTML = report.disks
      .map(d => renderDiskRow(d, d.path === report.currentModelsPath))
      .join('');
  } catch (err) {
    showEmpty(container, `Ошибка: ${err.message}`);
    notify(err.message, 'error');
  }
};

export const initDisk = () => {
  loadDisk();
  $('#refresh-disk').addEventListener('click', loadDisk);
};
