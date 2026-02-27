import { z } from 'zod';

const HfSiblingSchema = z.object({
  rfilename: z.string(),
});

export const HfModelRawSchema = z.object({
  _id: z.string().optional(),
  id: z.string(),
  modelId: z.string().optional(),
  author: z.string().optional(),
  lastModified: z.string().optional(),
  tags: z.array(z.string()).default([]),
  pipeline_tag: z.string().optional(),
  downloads: z.number().default(0),
  likes: z.number().default(0),
  siblings: z.array(HfSiblingSchema).default([]),
  private: z.boolean().default(false),
  gated: z.union([z.boolean(), z.string()]).default(false),
});

export type HfModelRaw = z.infer<typeof HfModelRawSchema>;

export interface SearchParams {
  query?: string;
  author?: string;
  tags?: string[];
  minQuant?: string;
  limit?: number;
  offset?: number;
  sort?: 'downloads' | 'likes' | 'lastModified';
}
