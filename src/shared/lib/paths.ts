import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const APP_DIR_NAME = 'llm-controller-orlova';

const resolveDataDir = (): string => {
  const xdgConfig = process.env['XDG_CONFIG_HOME'];
  const base = xdgConfig ?? join(homedir(), '.config');
  const dir = join(base, APP_DIR_NAME);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  return dir;
};

let dataDir: string | null = null;

const getDataDir = (): string => {
  if (!dataDir) {
    dataDir = resolveDataDir();
  }
  return dataDir;
};

export const getConfigPath = (): string => join(getDataDir(), 'config.json');
export const getLogPath = (): string => join(getDataDir(), 'llm-controller-orlova.log');
