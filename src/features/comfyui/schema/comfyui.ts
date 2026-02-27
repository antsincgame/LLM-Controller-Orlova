export type DiffusionModelType = 'checkpoint' | 'lora' | 'vae' | 'controlnet' | 'upscaler';

export const DIFFUSION_MODEL_DIRS: Record<DiffusionModelType, string> = {
  checkpoint: 'models/checkpoints',
  lora: 'models/loras',
  vae: 'models/vae',
  controlnet: 'models/controlnet',
  upscaler: 'models/upscale_models',
};

export const DIFFUSION_HF_TAGS: Record<DiffusionModelType, string[]> = {
  checkpoint: ['text-to-image', 'image-to-image'],
  lora: ['lora', 'text-to-image'],
  vae: ['vae'],
  controlnet: ['controlnet'],
  upscaler: ['image-to-image', 'upscaler'],
};

export interface DiffusionSearchParams {
  query?: string;
  modelType?: DiffusionModelType;
  author?: string;
  limit?: number;
  offset?: number;
  sort?: 'downloads' | 'likes' | 'lastModified';
}

export interface DiffusionModelInfo {
  id: string;
  author: string;
  lastModified: string;
  tags: string[];
  pipelineTag: string | null;
  downloads: number;
  likes: number;
  files: DiffusionFile[];
  isPrivate: boolean;
  isGated: boolean;
  modelType: DiffusionModelType;
}

export interface DiffusionFile {
  filename: string;
  sizeBytes: number | null;
}

export interface InstalledDiffusionModel {
  filename: string;
  modelType: DiffusionModelType;
  path: string;
  sizeBytes: number;
  sizeHuman: string;
}

export interface DiffusionDownloadProgress {
  status: string;
  percent?: number;
  downloadedBytes?: number;
  totalBytes?: number;
}
