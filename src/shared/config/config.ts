import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getConfigPath } from '../lib/paths.js';

const CONFIG_PATH = getConfigPath();

export interface AppConfig {
  hfToken: string | null;
  modelsPath: string | null;
  lastModelsPath: string | null;
  cacheTtlMinutes: number;
  defaultQuantFilters: string[];
  defaultTaskFilters: string[];
  ollamaHost: string;
  comfyuiPath: string | null;
}

const DEFAULT_CONFIG: AppConfig = {
  hfToken: null,
  modelsPath: null,
  lastModelsPath: null,
  cacheTtlMinutes: 15,
  defaultQuantFilters: ['Q4_K_M', 'Q4_K_S', 'Q5_K_M', 'Q5_K_S', 'Q6_K', 'Q8_0'],
  defaultTaskFilters: ['text-generation', 'text2text-generation'],
  ollamaHost: 'http://127.0.0.1:11434',
  comfyuiPath: null,
};

let cachedConfig: AppConfig | null = null;

export const loadConfig = (): AppConfig => {
  if (cachedConfig) return cachedConfig;

  if (!existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    cachedConfig = { ...DEFAULT_CONFIG };
    return cachedConfig;
  }

  const raw = readFileSync(CONFIG_PATH, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<AppConfig>;
  cachedConfig = { ...DEFAULT_CONFIG, ...parsed };
  return cachedConfig;
};

const saveConfig = (config: AppConfig): void => {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  cachedConfig = config;
};

export const updateConfig = (patch: Partial<AppConfig>): AppConfig => {
  const current = loadConfig();
  const updated = { ...current, ...patch };
  saveConfig(updated);
  return updated;
};

export const getHfToken = (): string | null => {
  return process.env['HF_TOKEN'] ?? loadConfig().hfToken;
};

export const getOllamaHost = (): string => {
  return process.env['OLLAMA_HOST'] ?? loadConfig().ollamaHost;
};

export const getModelsPath = (): string | null => {
  return process.env['OLLAMA_MODELS'] ?? loadConfig().modelsPath ?? loadConfig().lastModelsPath;
};
