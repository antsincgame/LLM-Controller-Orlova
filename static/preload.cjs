const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  searchModels: (params) => ipcRenderer.invoke('search-models', params),
  rankModels: (params) => ipcRenderer.invoke('rank-models', params),
  getDiskInfo: () => ipcRenderer.invoke('get-disk-info'),
  pullModel: (modelId, quant) => ipcRenderer.invoke('pull-model', modelId, quant),
  cancelPull: () => ipcRenderer.invoke('cancel-pull'),
  listLocalModels: () => ipcRenderer.invoke('list-local-models'),
  deleteModel: (name) => ipcRenderer.invoke('delete-model', name),
  setModelsPath: (path) => ipcRenderer.invoke('set-models-path', path),
  checkModelUpdate: (name) => ipcRenderer.invoke('check-model-update', name),
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (patch) => ipcRenderer.invoke('save-config', patch),
  onPullProgress: (callback) => {
    ipcRenderer.on('pull-progress', (_event, data) => callback(data));
  },

  searchDiffusion: (params) => ipcRenderer.invoke('search-diffusion', params),
  downloadDiffusion: (repoId, filename, modelType) =>
    ipcRenderer.invoke('download-diffusion', repoId, filename, modelType),
  cancelDiffusionDownload: () => ipcRenderer.invoke('cancel-diffusion-download'),
  listDiffusionModels: () => ipcRenderer.invoke('list-diffusion-models'),
  deleteDiffusionModel: (filePath) => ipcRenderer.invoke('delete-diffusion-model', filePath),
  detectComfyUI: () => ipcRenderer.invoke('detect-comfyui'),
  onDiffusionProgress: (callback) => {
    ipcRenderer.on('diffusion-progress', (_event, data) => callback(data));
  },
});
