export interface GgufQuantization {
  label: string;
  filename: string;
  sizeBytes: number | null;
}

export interface HfModel {
  id: string;
  author: string;
  lastModified: string;
  tags: string[];
  pipelineTag: string | null;
  downloads: number;
  likes: number;
  quantizations: GgufQuantization[];
  isPrivate: boolean;
  isGated: boolean;
  hasChatTemplate: boolean;
  parameterSize: string | null;
}
