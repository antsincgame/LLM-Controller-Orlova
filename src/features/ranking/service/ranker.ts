import type { HfModel } from '../../../shared/schema/model-types.js';
import type { ModelScore, RankParams } from '../schema/ranking.js';
import { getQuantLevel } from '../../../shared/lib/quant.js';

const WEIGHTS = {
  size: 0.20,
  quant: 0.15,
  freshness: 0.15,
  popularity: 0.20,
  task: 0.20,
  chatTemplate: 0.10,
} as const;

const PARAM_SIZE_GB: Record<string, number> = {
  '1B': 0.5, '1.5B': 0.8, '2B': 1.0, '3B': 1.5,
  '4B': 2.0, '7B': 3.5, '8B': 4.0, '9B': 4.5,
  '13B': 6.5, '14B': 7.0, '15B': 7.5,
  '20B': 10.0, '30B': 15.0, '33B': 16.5,
  '34B': 17.0, '35B': 17.5, '40B': 20.0,
  '65B': 32.5, '70B': 35.0, '72B': 36.0,
  '110B': 55.0, '120B': 60.0, '180B': 90.0,
  '405B': 202.5,
};

const SIZE_THRESHOLDS = { CRITICAL: 0.95, HIGH: 0.80, MEDIUM: 0.60, LOW: 0.40 } as const;
const DEFAULT_RAM_ESTIMATE_GB = 4.0;

const estimateRamGb = (paramSize: string | null): number => {
  if (!paramSize) return DEFAULT_RAM_ESTIMATE_GB;
  return PARAM_SIZE_GB[paramSize] ?? DEFAULT_RAM_ESTIMATE_GB;
};

const scoreSizeFit = (paramSize: string | null, availableRamGb: number | undefined): number => {
  if (!availableRamGb) return 0.5;

  const needed = estimateRamGb(paramSize);
  const ratio = needed / availableRamGb;

  if (ratio > SIZE_THRESHOLDS.CRITICAL) return 0.0;
  if (ratio > SIZE_THRESHOLDS.HIGH) return 0.2;
  if (ratio > SIZE_THRESHOLDS.MEDIUM) return 0.5;
  if (ratio > SIZE_THRESHOLDS.LOW) return 0.8;
  return 1.0;
};

const QUANT_QUALITY: Record<string, number> = {
  Q2_K: 0.2, Q2_K_S: 0.2,
  Q3_K_S: 0.35, Q3_K_M: 0.4, Q3_K_L: 0.45,
  IQ3_XS: 0.35, IQ3_S: 0.35, IQ3_M: 0.4, IQ3_XXS: 0.3,
  Q4_0: 0.55, Q4_1: 0.6, Q4_K_S: 0.65, Q4_K_M: 0.7,
  IQ4_XS: 0.6, IQ4_NL: 0.65,
  Q5_0: 0.75, Q5_1: 0.78, Q5_K_S: 0.8, Q5_K_M: 0.85,
  Q6_K: 0.9,
  Q8_0: 0.95,
  F16: 1.0, FP16: 1.0,
};

const QUANT_LEVEL_DIVISOR = 8;

const scoreBestQuant = (model: HfModel): { score: number; best: string } => {
  if (model.quantizations.length === 0) return { score: 0, best: 'NONE' };

  let bestScore = 0;
  let bestLabel = model.quantizations[0]!.label;

  for (const q of model.quantizations) {
    const qs = QUANT_QUALITY[q.label] ?? (getQuantLevel(q.label) / QUANT_LEVEL_DIVISOR);
    if (qs > bestScore) {
      bestScore = qs;
      bestLabel = q.label;
    }
  }

  return { score: bestScore, best: bestLabel };
};

const FRESHNESS_DAYS = { WEEK: 7, MONTH: 30, QUARTER: 90, HALF_YEAR: 180, YEAR: 365 } as const;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

const scoreFreshness = (lastModified: string): number => {
  const ageMs = Date.now() - new Date(lastModified).getTime();
  const ageDays = ageMs / MS_PER_DAY;

  if (ageDays < FRESHNESS_DAYS.WEEK) return 1.0;
  if (ageDays < FRESHNESS_DAYS.MONTH) return 0.9;
  if (ageDays < FRESHNESS_DAYS.QUARTER) return 0.7;
  if (ageDays < FRESHNESS_DAYS.HALF_YEAR) return 0.5;
  if (ageDays < FRESHNESS_DAYS.YEAR) return 0.3;
  return 0.1;
};

const POPULARITY_WEIGHTS = { DOWNLOADS: 0.7, LIKES: 0.3 } as const;

const scorePopularity = (downloads: number, likes: number, maxDownloads: number, maxLikes: number): number => {
  const dlNorm = maxDownloads > 0 ? downloads / maxDownloads : 0;
  const likeNorm = maxLikes > 0 ? likes / maxLikes : 0;
  return dlNorm * POPULARITY_WEIGHTS.DOWNLOADS + likeNorm * POPULARITY_WEIGHTS.LIKES;
};

const CODE_TAGS = ['code', 'code-generation', 'coding'];
const CHAT_TAGS = ['chat', 'conversational', 'chatqa'];

const scoreTask = (model: HfModel, preference: string): number => {
  const tags = model.tags.map(t => t.toLowerCase());
  const pipeline = model.pipelineTag?.toLowerCase() ?? '';

  if (preference === 'code') {
    if (CODE_TAGS.some(ct => tags.includes(ct) || pipeline.includes(ct))) return 1.0;
    if (tags.includes('text-generation') || pipeline === 'text-generation') return 0.6;
    return 0.3;
  }

  if (preference === 'chat') {
    if (CHAT_TAGS.some(ct => tags.includes(ct) || pipeline.includes(ct))) return 1.0;
    if (model.hasChatTemplate) return 0.8;
    return 0.3;
  }

  if (tags.includes('text-generation') || pipeline === 'text-generation') return 0.8;
  return 0.5;
};

const SCORE_PRECISION = 1000;
const BREAKDOWN_PRECISION = 100;

export const rankModels = (models: HfModel[], params: RankParams): ModelScore[] => {
  if (models.length === 0) return [];

  const maxDownloads = Math.max(...models.map(m => m.downloads), 1);
  const maxLikes = Math.max(...models.map(m => m.likes), 1);

  const scored = models.map((model): ModelScore => {
    const sizeScore = scoreSizeFit(model.parameterSize, params.availableRamGb);
    const { score: quantScore, best: bestQuant } = scoreBestQuant(model);
    const freshnessScore = scoreFreshness(model.lastModified);
    const popularityScore = scorePopularity(model.downloads, model.likes, maxDownloads, maxLikes);
    const taskScore = scoreTask(model, params.taskPreference ?? 'code');
    const chatTemplateScore = model.hasChatTemplate ? 1.0 : 0.0;

    const score =
      sizeScore * WEIGHTS.size +
      quantScore * WEIGHTS.quant +
      freshnessScore * WEIGHTS.freshness +
      popularityScore * WEIGHTS.popularity +
      taskScore * WEIGHTS.task +
      chatTemplateScore * WEIGHTS.chatTemplate;

    return {
      modelId: model.id,
      author: model.author,
      score: Math.round(score * SCORE_PRECISION) / SCORE_PRECISION,
      breakdown: {
        sizeScore: Math.round(sizeScore * BREAKDOWN_PRECISION) / BREAKDOWN_PRECISION,
        quantScore: Math.round(quantScore * BREAKDOWN_PRECISION) / BREAKDOWN_PRECISION,
        freshnessScore: Math.round(freshnessScore * BREAKDOWN_PRECISION) / BREAKDOWN_PRECISION,
        popularityScore: Math.round(popularityScore * BREAKDOWN_PRECISION) / BREAKDOWN_PRECISION,
        taskScore: Math.round(taskScore * BREAKDOWN_PRECISION) / BREAKDOWN_PRECISION,
        chatTemplateScore: Math.round(chatTemplateScore * BREAKDOWN_PRECISION) / BREAKDOWN_PRECISION,
      },
      bestQuant,
      parameterSize: model.parameterSize,
      downloads: model.downloads,
      likes: model.likes,
      lastModified: model.lastModified,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, params.topK ?? 10);
};
