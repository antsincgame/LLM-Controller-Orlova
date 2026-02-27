import { createWriteStream, existsSync, readdirSync, statSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { loadConfig, getHfToken } from '../../../shared/config/config.js';
import { logger } from '../../../shared/lib/logger.js';
import { formatBytes } from '../../../shared/lib/format.js';
import { cacheGet, cacheSet } from '../../../shared/lib/cache.js';
import type {
  DiffusionModelType,
  DiffusionSearchParams,
  DiffusionModelInfo,
  DiffusionFile,
  InstalledDiffusionModel,
  DiffusionDownloadProgress,
} from '../schema/comfyui.js';
import { DIFFUSION_MODEL_DIRS, DIFFUSION_HF_TAGS } from '../schema/comfyui.js';

const HF_API_BASE = 'https://huggingface.co/api';

const DIFFUSION_EXTENSIONS = new Set(['.safetensors', '.ckpt', '.pt', '.pth', '.bin']);

const buildPortablePaths = (): string[] => {
  const paths: string[] = [];

  const appImagePath = process.env['APPIMAGE'];
  if (appImagePath) {
    paths.push(join(dirname(appImagePath), 'ComfyUI'));
  }

  paths.push(join(process.cwd(), 'ComfyUI'));

  return paths;
};

const COMMON_COMFYUI_PATHS = [
  ...buildPortablePaths(),
  join(homedir(), 'ComfyUI'),
  join(homedir(), 'comfyui'),
  join(homedir(), '.comfyui'),
  '/opt/ComfyUI',
  '/opt/comfyui',
];

const buildHeaders = (): Record<string, string> => {
  const token = getHfToken();
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

const inferModelType = (tags: string[], pipelineTag: string | null): DiffusionModelType => {
  const allTags = [...tags, pipelineTag ?? ''].map(t => t.toLowerCase());

  if (allTags.some(t => t.includes('lora'))) return 'lora';
  if (allTags.some(t => t.includes('vae'))) return 'vae';
  if (allTags.some(t => t.includes('controlnet'))) return 'controlnet';
  if (allTags.some(t => t.includes('upscal'))) return 'upscaler';
  return 'checkpoint';
};

const filterDiffusionFiles = (siblings: Array<{ rfilename: string }>): DiffusionFile[] => {
  return siblings
    .filter(s => {
      const lower = s.rfilename.toLowerCase();
      return DIFFUSION_EXTENSIONS.has(lower.slice(lower.lastIndexOf('.')));
    })
    .map(s => ({ filename: s.rfilename, sizeBytes: null }));
};

interface HfRawResponse {
  id: string;
  author?: string;
  lastModified?: string;
  tags?: string[];
  pipeline_tag?: string;
  downloads?: number;
  likes?: number;
  siblings?: Array<{ rfilename: string }>;
  private?: boolean;
  gated?: boolean | string;
}

const transformDiffusionModel = (raw: HfRawResponse, modelType: DiffusionModelType): DiffusionModelInfo => ({
  id: raw.id,
  author: raw.author ?? raw.id.split('/')[0] ?? 'unknown',
  lastModified: raw.lastModified ?? new Date().toISOString(),
  tags: raw.tags ?? [],
  pipelineTag: raw.pipeline_tag ?? null,
  downloads: raw.downloads ?? 0,
  likes: raw.likes ?? 0,
  files: filterDiffusionFiles(raw.siblings ?? []),
  isPrivate: raw.private ?? false,
  isGated: raw.gated !== false && raw.gated !== undefined,
  modelType,
});

export const searchDiffusionModels = async (
  params: DiffusionSearchParams,
): Promise<{ models: DiffusionModelInfo[]; total: number }> => {
  const config = loadConfig();
  const ttlMs = config.cacheTtlMinutes * 60 * 1000;

  const cacheKey = `comfyui:search:${JSON.stringify(params)}`;
  const cached = cacheGet<{ models: DiffusionModelInfo[]; total: number }>(cacheKey);
  if (cached) {
    logger.debug('Cache hit for diffusion search', { cacheKey });
    return cached;
  }

  const url = new URL(`${HF_API_BASE}/models`);
  url.searchParams.set('limit', String(Math.min(params.limit ?? 20, 100)));
  url.searchParams.set('skip', String(params.offset ?? 0));
  url.searchParams.set('sort', params.sort ?? 'downloads');
  url.searchParams.set('direction', '-1');
  url.searchParams.set('full', 'true');

  const modelType = params.modelType ?? 'checkpoint';
  const tags = DIFFUSION_HF_TAGS[modelType];
  if (tags.length > 0) {
    url.searchParams.append('filter', tags[0]!);
  }

  if (params.query) {
    url.searchParams.set('search', params.query);
  }
  if (params.author) {
    url.searchParams.set('author', params.author);
  }

  logger.info('Fetching diffusion models from HF', { url: url.toString() });

  const response = await fetch(url.toString(), { headers: buildHeaders() });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('HF API error (diffusion)', { status: response.status, body: errorText });
    throw new Error(`HF API returned ${response.status}: ${errorText}`);
  }

  const rawModels = (await response.json()) as HfRawResponse[];

  const models = rawModels
    .map(raw => {
      const detectedType = params.modelType ?? inferModelType(raw.tags ?? [], raw.pipeline_tag ?? null);
      return transformDiffusionModel(raw, detectedType);
    })
    .filter(m => m.files.length > 0);

  const result = { models, total: models.length };
  cacheSet(cacheKey, result, ttlMs);

  logger.info('Diffusion search completed', { count: models.length });
  return result;
};

const resolveComfyUIPath = (): string | null => {
  const config = loadConfig();
  if (config.comfyuiPath && existsSync(config.comfyuiPath)) {
    return config.comfyuiPath;
  }

  for (const candidate of COMMON_COMFYUI_PATHS) {
    if (existsSync(join(candidate, 'main.py')) || existsSync(join(candidate, 'models'))) {
      return candidate;
    }
  }

  return null;
};

const getModelDir = (comfyuiPath: string, modelType: DiffusionModelType): string => {
  const subdir = DIFFUSION_MODEL_DIRS[modelType];
  const dir = join(comfyuiPath, subdir);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
};

export const downloadDiffusionModel = async (
  repoId: string,
  filename: string,
  modelType: DiffusionModelType,
  onProgress?: (progress: DiffusionDownloadProgress) => void,
  signal?: AbortSignal,
): Promise<{ success: boolean; message: string; path?: string }> => {
  const comfyuiPath = resolveComfyUIPath();
  if (!comfyuiPath) {
    return { success: false, message: 'ComfyUI path not configured. Set it in Settings.' };
  }

  const targetDir = getModelDir(comfyuiPath, modelType);
  const targetPath = join(targetDir, basename(filename));

  if (existsSync(targetPath)) {
    return { success: false, message: `File already exists: ${targetPath}` };
  }

  const downloadUrl = `https://huggingface.co/${repoId}/resolve/main/${filename}`;
  logger.info('Downloading diffusion model', { repoId, filename, targetPath });

  const headers: Record<string, string> = {};
  const token = getHfToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(downloadUrl, { headers, signal, redirect: 'follow' });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Download failed', { status: response.status, body: errorText.slice(0, 200) });
    throw new Error(`Download failed: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response body');
  }

  const totalBytes = Number(response.headers.get('content-length') ?? 0);
  let downloadedBytes = 0;

  const progressStream = new TransformStream({
    transform(chunk: Uint8Array, controller) {
      downloadedBytes += chunk.byteLength;
      const percent = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : undefined;
      onProgress?.({
        status: `Загрузка: ${formatBytes(downloadedBytes)}${totalBytes > 0 ? ` / ${formatBytes(totalBytes)}` : ''}`,
        percent,
        downloadedBytes,
        totalBytes: totalBytes > 0 ? totalBytes : undefined,
      });
      controller.enqueue(chunk);
    },
  });

  const readableStream = Readable.fromWeb(
    response.body.pipeThrough(progressStream) as import('node:stream/web').ReadableStream,
  );
  const writeStream = createWriteStream(targetPath);

  try {
    await pipeline(readableStream, writeStream);
  } catch (err: unknown) {
    if (signal?.aborted) {
      logger.info('Download cancelled', { repoId, filename });
      try { unlinkSync(targetPath); } catch { /* partial file cleanup */ }
      return { success: false, message: 'Загрузка отменена' };
    }
    try { unlinkSync(targetPath); } catch { /* partial file cleanup */ }
    throw err;
  }

  logger.info('Diffusion model downloaded', { repoId, filename, targetPath });
  return { success: true, message: `Downloaded to ${targetPath}`, path: targetPath };
};

export const listInstalledDiffusionModels = (): InstalledDiffusionModel[] => {
  const comfyuiPath = resolveComfyUIPath();
  if (!comfyuiPath) return [];

  const results: InstalledDiffusionModel[] = [];

  for (const [modelType, subdir] of Object.entries(DIFFUSION_MODEL_DIRS)) {
    const dir = join(comfyuiPath, subdir);
    if (!existsSync(dir)) continue;

    try {
      const files = readdirSync(dir);
      for (const file of files) {
        const lower = file.toLowerCase();
        const ext = lower.slice(lower.lastIndexOf('.'));
        if (!DIFFUSION_EXTENSIONS.has(ext)) continue;

        const filePath = join(dir, file);
        const stats = statSync(filePath);

        results.push({
          filename: file,
          modelType: modelType as DiffusionModelType,
          path: filePath,
          sizeBytes: stats.size,
          sizeHuman: formatBytes(stats.size),
        });
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn('Failed to scan ComfyUI directory', { dir, error: message });
    }
  }

  return results;
};

export const deleteDiffusionModel = (filePath: string): { success: boolean; message: string } => {
  if (!existsSync(filePath)) {
    return { success: false, message: `File not found: ${filePath}` };
  }

  try {
    unlinkSync(filePath);
    logger.info('Diffusion model deleted', { filePath });
    return { success: true, message: `Deleted: ${basename(filePath)}` };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error('Failed to delete diffusion model', { filePath, error: message });
    return { success: false, message: `Failed to delete: ${message}` };
  }
};

export const detectComfyUIPath = (): string | null => {
  return resolveComfyUIPath();
};
