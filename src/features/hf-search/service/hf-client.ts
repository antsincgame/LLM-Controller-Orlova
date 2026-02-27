import { HfModelRawSchema, type HfModelRaw, type SearchParams } from '../schema/hf-model.js';
import type { HfModel, GgufQuantization } from '../../../shared/schema/model-types.js';
import { QUANT_ORDER, getQuantLevel } from '../../../shared/lib/quant.js';
import { cacheGet, cacheSet } from '../../../shared/lib/cache.js';
import { getHfToken, loadConfig } from '../../../shared/config/config.js';
import { logger } from '../../../shared/lib/logger.js';

const HF_API_BASE = 'https://huggingface.co/api';

const QUANT_LEVEL_ALIASES: Record<string, number> = {
  Q2: 1, Q3: 2, Q4: 3, Q5: 4, Q6: 5, Q8: 6, F16: 7, F32: 8,
};

const minQuantLevel = (minQuant: string): number => {
  return QUANT_LEVEL_ALIASES[minQuant] ?? QUANT_ORDER[minQuant] ?? 3;
};

const VALID_QUANTS = new Set(Object.keys(QUANT_ORDER));

const QUANT_REGEX = /[-_.](?<q>(?:I?Q\d+(?:_K(?:_[SML])?|_\d)?|(?:B?F(?:P)?(?:16|32))))(?:[-_.]|$)/i;

const extractQuantizations = (siblings: { rfilename: string }[]): GgufQuantization[] => {
  const ggufFiles = siblings.filter(s => s.rfilename.endsWith('.gguf'));
  const seen = new Set<string>();

  const results: GgufQuantization[] = [];

  for (const file of ggufFiles) {
    const match = file.rfilename.match(QUANT_REGEX);
    if (!match?.groups?.['q']) continue;

    const label = match.groups['q'].toUpperCase();
    if (!VALID_QUANTS.has(label)) continue;
    if (seen.has(label)) continue;

    seen.add(label);
    results.push({ label, filename: file.rfilename, sizeBytes: null });
  }

  return results;
};

const extractParamSize = (tags: string[]): string | null => {
  for (const tag of tags) {
    const match = tag.match(/^(\d+(?:\.\d+)?[BMK]?)$/i);
    if (match) return match[1];
  }
  return null;
};

const hasChatTemplate = (tags: string[]): boolean => {
  return tags.some(t =>
    t === 'chat_template' ||
    t.includes('chat') ||
    t.includes('instruct')
  );
};

const transformModel = (raw: HfModelRaw): HfModel => ({
  id: raw.id,
  author: raw.author ?? raw.id.split('/')[0] ?? 'unknown',
  lastModified: raw.lastModified ?? new Date().toISOString(),
  tags: raw.tags,
  pipelineTag: raw.pipeline_tag ?? null,
  downloads: raw.downloads,
  likes: raw.likes,
  quantizations: extractQuantizations(raw.siblings),
  isPrivate: raw.private,
  isGated: raw.gated !== false,
  hasChatTemplate: hasChatTemplate(raw.tags),
  parameterSize: extractParamSize(raw.tags),
});

const buildHeaders = (): Record<string, string> => {
  const token = getHfToken();
  const headers: Record<string, string> = {
    'Accept': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const searchHfModels = async (params: SearchParams): Promise<{ models: HfModel[]; total: number }> => {
  const config = loadConfig();
  const ttlMs = config.cacheTtlMinutes * 60 * 1000;

  const cacheKey = `hf:search:${JSON.stringify(params)}`;
  const cached = cacheGet<{ models: HfModel[]; total: number }>(cacheKey);
  if (cached) {
    logger.debug('Cache hit for HF search', { cacheKey });
    return cached;
  }

  const url = new URL(`${HF_API_BASE}/models`);
  url.searchParams.set('library', 'gguf');
  url.searchParams.set('limit', String(Math.min(params.limit ?? 20, 100)));
  url.searchParams.set('skip', String(params.offset ?? 0));
  url.searchParams.set('sort', params.sort ?? 'downloads');
  url.searchParams.set('direction', '-1');
  url.searchParams.set('full', 'true');

  if (params.query) {
    url.searchParams.set('search', params.query);
  }
  if (params.author) {
    url.searchParams.set('author', params.author);
  }
  if (params.tags?.length) {
    for (const tag of params.tags) {
      url.searchParams.append('filter', tag);
    }
  }

  logger.info('Fetching HF models', { url: url.toString() });

  const response = await fetch(url.toString(), { headers: buildHeaders() });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('HF API error', { status: response.status, body: errorText });
    throw new Error(`HF API returned ${response.status}: ${errorText}`);
  }

  const rawModels = (await response.json()) as unknown[];
  const minLevel = minQuantLevel(params.minQuant ?? 'Q4');

  const models = rawModels
    .map(raw => {
      const parsed = HfModelRawSchema.safeParse(raw);
      if (!parsed.success) {
        logger.warn('Failed to parse HF model', { error: parsed.error.message });
        return null;
      }
      return transformModel(parsed.data);
    })
    .filter((m): m is HfModel => m !== null)
    .filter(m => m.quantizations.some(q => getQuantLevel(q.label) >= minLevel));

  const result = { models, total: models.length };
  cacheSet(cacheKey, result, ttlMs);

  logger.info('HF search completed', { count: models.length });
  return result;
};

export const getModelDetails = async (modelId: string): Promise<HfModel | null> => {
  const config = loadConfig();
  const ttlMs = config.cacheTtlMinutes * 60 * 1000;

  const cacheKey = `hf:model:${modelId}`;
  const cached = cacheGet<HfModel>(cacheKey);
  if (cached) return cached;

  const url = `${HF_API_BASE}/models/${modelId}`;
  const response = await fetch(url, { headers: buildHeaders() });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`HF API returned ${response.status}`);
  }

  const raw = await response.json();
  const parsed = HfModelRawSchema.safeParse(raw);
  if (!parsed.success) return null;

  const model = transformModel(parsed.data);
  cacheSet(cacheKey, model, ttlMs);
  return model;
};
