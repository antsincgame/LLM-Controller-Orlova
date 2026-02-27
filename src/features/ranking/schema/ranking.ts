export interface RankParams {
  models?: string[];
  availableRamGb?: number;
  taskPreference?: 'code' | 'chat' | 'general';
  topK?: number;
}

export interface ModelScore {
  modelId: string;
  author: string;
  score: number;
  breakdown: {
    sizeScore: number;
    quantScore: number;
    freshnessScore: number;
    popularityScore: number;
    taskScore: number;
    chatTemplateScore: number;
  };
  bestQuant: string;
  parameterSize: string | null;
  downloads: number;
  likes: number;
  lastModified: string;
}
