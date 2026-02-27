import { app, BrowserWindow, ipcMain } from 'electron';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchHfModels } from '../features/hf-search/service/hf-client.js';
import { rankModels } from '../features/ranking/service/ranker.js';
import { getDiskReport, setModelsPath } from '../features/disk/service/disk-info.js';
import {
  listLocalModels,
  pullModel,
  deleteModel,
  checkModelUpdate,
} from '../features/ollama/service/ollama-client.js';
import {
  searchDiffusionModels,
  downloadDiffusionModel,
  listInstalledDiffusionModels,
  deleteDiffusionModel,
  detectComfyUIPath,
} from '../features/comfyui/service/comfyui-client.js';
import { loadConfig, updateConfig } from '../shared/config/config.js';
import { logger } from '../shared/lib/logger.js';
import type { HfModel } from '../shared/schema/model-types.js';
import type { DiffusionModelType } from '../features/comfyui/schema/comfyui.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const WINDOW_CONFIG = { WIDTH: 1280, HEIGHT: 860, MIN_WIDTH: 900, MIN_HEIGHT: 600 } as const;

let mainWindow: BrowserWindow | null = null;
let lastSearchResults: HfModel[] = [];
let pullAbort: AbortController | null = null;
let diffusionAbort: AbortController | null = null;

const resolveStatic = (...segments: string[]): string => {
  const base = app.isPackaged
    ? join(process.resourcesPath, 'static')
    : join(__dirname, '..', '..', 'static');
  return join(base, ...segments);
};

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: WINDOW_CONFIG.WIDTH,
    height: WINDOW_CONFIG.HEIGHT,
    minWidth: WINDOW_CONFIG.MIN_WIDTH,
    minHeight: WINDOW_CONFIG.MIN_HEIGHT,
    title: 'LLM Controller Orlova',
    backgroundColor: '#0d1117',
    webPreferences: {
      preload: resolveStatic('preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(resolveStatic('index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

const registerOllamaIpc = (): void => {
  ipcMain.handle('search-models', async (_event, params) => {
    const result = await searchHfModels(params);
    lastSearchResults = result.models;
    return result;
  });

  ipcMain.handle('rank-models', async (_event, params) => {
    if (lastSearchResults.length === 0) {
      return { ranked: [], message: 'Run search first' };
    }
    const ranked = rankModels(lastSearchResults, params);
    return { ranked };
  });

  ipcMain.handle('get-disk-info', async () => {
    return getDiskReport();
  });

  ipcMain.handle('pull-model', async (event, modelId: string, quant: string) => {
    pullAbort = new AbortController();
    try {
      const result = await pullModel(
        modelId,
        quant,
        (progress) => {
          event.sender.send('pull-progress', progress);
        },
        pullAbort.signal,
      );
      return result;
    } finally {
      pullAbort = null;
    }
  });

  ipcMain.handle('cancel-pull', async () => {
    pullAbort?.abort();
    pullAbort = null;
    return { success: true };
  });

  ipcMain.handle('list-local-models', async () => {
    return listLocalModels();
  });

  ipcMain.handle('delete-model', async (_event, name: string) => {
    return deleteModel(name);
  });

  ipcMain.handle('set-models-path', async (_event, path: string) => {
    return setModelsPath(path);
  });

  ipcMain.handle('check-model-update', async (_event, name: string) => {
    return checkModelUpdate(name);
  });
};

const registerComfyUIIpc = (): void => {
  ipcMain.handle('search-diffusion', async (_event, params) => {
    return searchDiffusionModels(params);
  });

  ipcMain.handle('download-diffusion', async (
    event,
    repoId: string,
    filename: string,
    modelType: DiffusionModelType,
  ) => {
    diffusionAbort = new AbortController();
    try {
      const result = await downloadDiffusionModel(
        repoId,
        filename,
        modelType,
        (progress) => {
          event.sender.send('diffusion-progress', progress);
        },
        diffusionAbort.signal,
      );
      return result;
    } finally {
      diffusionAbort = null;
    }
  });

  ipcMain.handle('cancel-diffusion-download', async () => {
    diffusionAbort?.abort();
    diffusionAbort = null;
    return { success: true };
  });

  ipcMain.handle('list-diffusion-models', async () => {
    return listInstalledDiffusionModels();
  });

  ipcMain.handle('delete-diffusion-model', async (_event, filePath: string) => {
    return deleteDiffusionModel(filePath);
  });

  ipcMain.handle('detect-comfyui', async () => {
    return detectComfyUIPath();
  });
};

const registerConfigIpc = (): void => {
  ipcMain.handle('get-config', async () => {
    return loadConfig();
  });

  ipcMain.handle('save-config', async (_event, patch) => {
    return updateConfig(patch);
  });
};

app.whenReady().then(() => {
  logger.info('Electron app ready');
  registerOllamaIpc();
  registerComfyUIIpc();
  registerConfigIpc();
  createWindow();
}).catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Failed to initialize app', { error: message });
  process.exit(1);
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
