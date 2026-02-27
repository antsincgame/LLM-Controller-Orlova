import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import {
  searchDiffusionModels,
  downloadDiffusionModel,
  listInstalledDiffusionModels,
  deleteDiffusionModel,
} from '../../features/comfyui/service/comfyui-client.js';
import { formatToolError } from './mcp-helpers.js';

const MODEL_TYPE_ENUM = z.enum(['checkpoint', 'lora', 'vae', 'controlnet', 'upscaler']);

export const registerComfyUITools = (server: McpServer): void => {
  server.tool(
    'search_diffusion_models',
    'Search Hugging Face for diffusion models (checkpoints, LoRA, VAE, ControlNet, upscalers) compatible with ComfyUI.',
    {
      query: z.string().optional().describe('Free-text search (e.g. "stable diffusion xl", "flux")'),
      modelType: MODEL_TYPE_ENUM.optional().describe('Model type: checkpoint, lora, vae, controlnet, upscaler'),
      author: z.string().optional().describe('Filter by author/org'),
      limit: z.number().optional().describe('Results per page, max 100 (default 20)'),
      offset: z.number().optional().describe('Pagination offset (default 0)'),
      sort: z.enum(['downloads', 'likes', 'lastModified']).optional().describe('Sort field'),
    },
    async (params) => {
      try {
        const result = await searchDiffusionModels({
          query: params.query,
          modelType: params.modelType,
          author: params.author,
          limit: params.limit ?? 20,
          offset: params.offset ?? 0,
          sort: params.sort ?? 'downloads',
        });

        const summary = result.models.map((m, i) => {
          const files = m.files.map(f => f.filename).slice(0, 5).join(', ');
          return `${i + 1}. **${m.id}** by ${m.author} [${m.modelType}]\n` +
            `   Downloads: ${m.downloads.toLocaleString()} | Likes: ${m.likes}\n` +
            `   Files: ${files}\n` +
            `   Tags: ${m.tags.slice(0, 8).join(', ')}\n` +
            `   Updated: ${m.lastModified.split('T')[0]}`;
        }).join('\n\n');

        return {
          content: [{ type: 'text' as const, text: `Found ${result.total} diffusion models:\n\n${summary}` }],
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'download_diffusion_model',
    'Download a diffusion model file from Hugging Face to the ComfyUI models directory.',
    {
      repoId: z.string().describe('HF repository ID (e.g. "stabilityai/stable-diffusion-xl-base-1.0")'),
      filename: z.string().describe('Filename to download (e.g. "sd_xl_base_1.0.safetensors")'),
      modelType: MODEL_TYPE_ENUM.describe('Model type determines target subdirectory'),
    },
    async (params) => {
      try {
        const progressUpdates: string[] = [];

        const result = await downloadDiffusionModel(
          params.repoId,
          params.filename,
          params.modelType,
          (progress) => {
            const pct = progress.percent ? ` (${progress.percent}%)` : '';
            progressUpdates.push(`${progress.status}${pct}`);
          },
        );

        const progressLog = progressUpdates.length > 0
          ? `\n\nProgress (last 10):\n${progressUpdates.slice(-10).join('\n')}`
          : '';

        return {
          content: [{
            type: 'text' as const,
            text: result.success
              ? `${result.message}${progressLog}`
              : `Download failed: ${result.message}${progressLog}`,
          }],
          isError: !result.success,
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'list_diffusion_models',
    'List all diffusion models installed in the ComfyUI models directory, grouped by type.',
    {},
    async () => {
      try {
        const models = listInstalledDiffusionModels();

        if (models.length === 0) {
          return {
            content: [{ type: 'text' as const, text: 'No diffusion models found. Check ComfyUI path in Settings.' }],
          };
        }

        const grouped = new Map<string, typeof models>();
        for (const m of models) {
          const group = grouped.get(m.modelType) ?? [];
          group.push(m);
          grouped.set(m.modelType, group);
        }

        const lines: string[] = [];
        for (const [type, group] of grouped) {
          lines.push(`\n**${type.toUpperCase()}** (${group.length}):`);
          for (const m of group) {
            lines.push(`  - ${m.filename} (${m.sizeHuman})`);
          }
        }

        return {
          content: [{ type: 'text' as const, text: `Installed diffusion models (${models.length}):${lines.join('\n')}` }],
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'delete_diffusion_model',
    'Delete a diffusion model file from the ComfyUI models directory.',
    {
      filePath: z.string().describe('Absolute path to the model file to delete'),
    },
    async (params) => {
      try {
        const result = deleteDiffusionModel(params.filePath);
        return {
          content: [{ type: 'text' as const, text: result.message }],
          isError: !result.success,
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );
};
