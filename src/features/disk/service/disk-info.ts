import { execSync } from 'node:child_process';
import { existsSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { DiskInfo, DiskReport } from '../schema/disk.js';
import { getModelsPath, updateConfig } from '../../../shared/config/config.js';
import { logger } from '../../../shared/lib/logger.js';
import { formatBytes } from '../../../shared/lib/format.js';

const LOW_SPACE_THRESHOLD_PERCENT = 20;

const getDiskInfoForPath = (path: string): DiskInfo | null => {
  if (!existsSync(path)) return null;

  try {
    const stats = statfsSync(path);
    const totalBytes = stats.bsize * stats.blocks;
    const freeBytes = stats.bsize * stats.bavail;
    const usedBytes = totalBytes - freeBytes;

    return {
      path,
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: Math.round((usedBytes / totalBytes) * 100),
      freePercent: Math.round((freeBytes / totalBytes) * 100),
      totalHuman: formatBytes(totalBytes),
      freeHuman: formatBytes(freeBytes),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('Failed to get disk stats', { path, error: message });
    return null;
  }
};

const getMountPoints = (): string[] => {
  try {
    const output = execSync("df -h --output=target | tail -n +2", { encoding: 'utf-8' });
    return output
      .split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 0 && !l.startsWith('/snap') && !l.startsWith('/boot'));
  } catch {
    return ['/'];
  }
};

const defaultOllamaPath = (): string => {
  return join(homedir(), '.ollama', 'models');
};

export const getDiskReport = (): DiskReport => {
  const mountPoints = getMountPoints();
  const disks = mountPoints
    .map(getDiskInfoForPath)
    .filter((d): d is DiskInfo => d !== null);

  const modelsPath = getModelsPath() ?? defaultOllamaPath();
  const modelsPathDisk = getDiskInfoForPath(modelsPath);

  return {
    disks,
    currentModelsPath: modelsPath,
    currentModelsPathFree: modelsPathDisk?.freeHuman ?? null,
  };
};

export const setModelsPath = (newPath: string): { success: boolean; message: string } => {
  if (!existsSync(newPath)) {
    return { success: false, message: `Path does not exist: ${newPath}` };
  }

  updateConfig({ modelsPath: newPath, lastModelsPath: newPath });
  logger.info('Models path updated', { newPath });

  return { success: true, message: `Models path set to: ${newPath}` };
};

export const checkSpaceForModel = (sizeBytes: number, targetPath?: string): {
  fits: boolean;
  freeBytes: number;
  freeAfter: number;
  warningLowSpace: boolean;
  message: string;
} => {
  const path = targetPath ?? getModelsPath() ?? defaultOllamaPath();
  const info = getDiskInfoForPath(path);

  if (!info) {
    return {
      fits: false,
      freeBytes: 0,
      freeAfter: 0,
      warningLowSpace: true,
      message: `Cannot determine free space for: ${path}`,
    };
  }

  const freeAfter = info.freeBytes - sizeBytes;
  const percentAfter = (freeAfter / info.totalBytes) * 100;

  return {
    fits: freeAfter > 0,
    freeBytes: info.freeBytes,
    freeAfter: Math.max(freeAfter, 0),
    warningLowSpace: percentAfter < LOW_SPACE_THRESHOLD_PERCENT,
    message: freeAfter > 0
      ? percentAfter < LOW_SPACE_THRESHOLD_PERCENT
        ? `Model fits but only ${formatBytes(freeAfter)} (${percentAfter.toFixed(0)}%) will remain free`
        : `Model fits. ${formatBytes(freeAfter)} will remain free`
      : `Not enough space. Need ${formatBytes(sizeBytes)}, only ${formatBytes(info.freeBytes)} available`,
  };
};
