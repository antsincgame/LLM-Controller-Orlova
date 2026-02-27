import { getOllamaHost } from '../../../shared/config/config.js';
import { logger } from '../../../shared/lib/logger.js';
import { formatBytes } from '../../../shared/lib/format.js';
import type { LocalModel, PullProgress } from '../schema/ollama.js';

interface OllamaListResponse {
  models: Array<{
    name: string;
    model: string;
    modified_at: string;
    size: number;
    digest: string;
    details: {
      parent_model?: string;
      format: string;
      family: string;
      families: string[] | null;
      parameter_size: string;
      quantization_level: string;
    };
  }>;
}

export const listLocalModels = async (): Promise<LocalModel[]> => {
  const host = getOllamaHost();
  logger.info('Listing local models', { host });

  const response = await fetch(`${host}/api/tags`);

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as OllamaListResponse;

  return data.models.map(m => ({
    name: m.name,
    id: m.digest.slice(0, 12),
    size: m.size,
    sizeHuman: formatBytes(m.size),
    modifiedAt: m.modified_at,
    family: m.details.family,
    parameterSize: m.details.parameter_size,
    quantizationLevel: m.details.quantization_level,
  }));
};

interface PullStreamLine {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

const humanizeStatus = (raw: string): string => {
  if (raw.startsWith('pulling')) return `Загрузка: ${raw.replace('pulling ', '')}`;
  if (raw === 'verifying sha256 digest') return 'Проверка контрольной суммы...';
  if (raw === 'writing manifest') return 'Запись манифеста...';
  if (raw === 'success') return 'Готово!';
  if (raw.startsWith('converting')) return 'Конвертация...';
  return raw;
};

const parsePullLine = (trimmed: string): PullStreamLine | null => {
  try {
    return JSON.parse(trimmed) as PullStreamLine;
  } catch {
    return null;
  }
};

export const pullModel = async (
  modelId: string,
  quantization: string,
  onProgress?: (progress: PullProgress) => void,
  signal?: AbortSignal,
): Promise<{ success: boolean; message: string }> => {
  const host = getOllamaHost();
  const hfRef = `hf.co/${modelId}:${quantization.toLowerCase()}`;
  logger.info('Starting model pull via API', { hfRef });

  const response = await fetch(`${host}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: hfRef, stream: true }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Pull API error', { status: response.status, body: errorText });
    throw new Error(`Ollama API returned ${response.status}: ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No response body from Ollama pull API');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let lastError = '';

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const parsed = parsePullLine(trimmed);
        if (!parsed) continue;

        if (parsed.error) {
          lastError = parsed.error;
          continue;
        }

        const progress: PullProgress = {
          status: humanizeStatus(parsed.status),
          digest: parsed.digest,
          total: parsed.total,
          completed: parsed.completed,
        };

        if (parsed.total && parsed.completed) {
          progress.percent = Math.round((parsed.completed / parsed.total) * 100);
          progress.status = `${humanizeStatus(parsed.status)} — ${formatBytes(parsed.completed)} / ${formatBytes(parsed.total)}`;
        }

        onProgress?.(progress);
      }
    }
  } catch (err: unknown) {
    if (signal?.aborted) {
      logger.info('Model pull cancelled', { hfRef });
      return { success: false, message: 'Загрузка отменена' };
    }
    throw err;
  }

  if (lastError) {
    logger.error('Pull failed', { hfRef, error: lastError });
    throw new Error(lastError);
  }

  logger.info('Model pull completed', { hfRef });
  return { success: true, message: `Модель загружена: ${hfRef}` };
};

export const deleteModel = async (modelName: string): Promise<{ success: boolean; message: string }> => {
  const host = getOllamaHost();
  logger.info('Deleting model', { modelName });

  const response = await fetch(`${host}/api/delete`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('Failed to delete model', { modelName, status: response.status, body: errorText });
    return { success: false, message: `Failed to delete ${modelName}: ${errorText}` };
  }

  logger.info('Model deleted', { modelName });
  return { success: true, message: `Deleted ${modelName}` };
};

export const checkModelUpdate = async (modelName: string): Promise<{
  hasUpdate: boolean;
  localDate: string | null;
  message: string;
}> => {
  const models = await listLocalModels();
  const local = models.find(m => m.name === modelName);

  if (!local) {
    return {
      hasUpdate: false,
      localDate: null,
      message: `Model ${modelName} is not installed locally`,
    };
  }

  const hfMatch = modelName.match(/hf\.co\/([^:]+)/);
  if (!hfMatch) {
    return {
      hasUpdate: false,
      localDate: local.modifiedAt,
      message: 'Cannot check updates for non-HF models',
    };
  }

  const hfModelId = hfMatch[1]!;
  const { getModelDetails } = await import('../../hf-search/service/hf-client.js');
  const hfModel = await getModelDetails(hfModelId);

  if (!hfModel) {
    return {
      hasUpdate: false,
      localDate: local.modifiedAt,
      message: `Model ${hfModelId} not found on Hugging Face`,
    };
  }

  const localDate = new Date(local.modifiedAt);
  const remoteDate = new Date(hfModel.lastModified);

  return {
    hasUpdate: remoteDate > localDate,
    localDate: local.modifiedAt,
    message: remoteDate > localDate
      ? `Update available: remote ${hfModel.lastModified} > local ${local.modifiedAt}`
      : `Model is up to date (local: ${local.modifiedAt})`,
  };
};
