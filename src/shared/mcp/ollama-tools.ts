import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { searchHfModels } from '../../features/hf-search/service/hf-client.js';
import { rankModels } from '../../features/ranking/service/ranker.js';
import { getDiskReport, setModelsPath } from '../../features/disk/service/disk-info.js';
import { listLocalModels, pullModel, deleteModel, checkModelUpdate } from '../../features/ollama/service/ollama-client.js';
import type { HfModel } from '../schema/model-types.js';
import { formatToolError } from './mcp-helpers.js';

let lastSearchResults: HfModel[] = [];

export const getLastSearchResults = (): HfModel[] => lastSearchResults;

const formatSearchResult = (m: HfModel, i: number): string => {
  const quants = m.quantizations.map(q => q.label).join(', ');
  return `${i + 1}. **${m.id}** by ${m.author}\n` +
    `   Downloads: ${m.downloads.toLocaleString()} | Likes: ${m.likes}\n` +
    `   Params: ${m.parameterSize ?? 'unknown'} | Quants: ${quants}\n` +
    `   Tags: ${m.tags.slice(0, 8).join(', ')}\n` +
    `   Chat template: ${m.hasChatTemplate ? 'Yes' : 'No'} | Updated: ${m.lastModified.split('T')[0]}`;
};

export const registerOllamaTools = (server: McpServer): void => {
  server.tool(
    'search_hf_models',
    'Search Hugging Face for GGUF models compatible with Ollama. Supports filtering by query, author, tags, minimum quantization level, and pagination.',
    {
      query: z.string().optional().describe('Free-text search (e.g. "qwen coder", "llama instruct")'),
      author: z.string().optional().describe('Filter by author/org (e.g. "bartowski", "TheBloke")'),
      tags: z.array(z.string()).optional().describe('Filter tags (e.g. ["code", "text-generation"])'),
      minQuant: z.string().optional().describe('Minimum quantization: Q2, Q3, Q4 (default), Q5, Q6, Q8'),
      limit: z.number().optional().describe('Results per page, max 100 (default 20)'),
      offset: z.number().optional().describe('Pagination offset (default 0)'),
      sort: z.enum(['downloads', 'likes', 'lastModified']).optional().describe('Sort field'),
    },
    async (params) => {
      try {
        const result = await searchHfModels({
          query: params.query,
          author: params.author,
          tags: params.tags,
          minQuant: params.minQuant ?? 'Q4',
          limit: params.limit ?? 20,
          offset: params.offset ?? 0,
          sort: params.sort ?? 'downloads',
        });

        lastSearchResults = result.models;

        const summary = result.models.map(formatSearchResult).join('\n\n');
        return {
          content: [{ type: 'text' as const, text: `Found ${result.total} GGUF models:\n\n${summary}` }],
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'rank_models',
    'Rank models by suitability score based on size vs RAM, quantization quality, freshness, popularity, task fit, and chat template availability.',
    {
      availableRamGb: z.number().optional().describe('Available system RAM in GB'),
      taskPreference: z.enum(['code', 'chat', 'general']).optional().describe('Preferred task (default: code)'),
      topK: z.number().optional().describe('Number of top results (default: 10)'),
    },
    async (params) => {
      try {
        if (lastSearchResults.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No models to rank. Run search_hf_models first.' }] };
        }

        const ranked = rankModels(lastSearchResults, {
          availableRamGb: params.availableRamGb,
          taskPreference: params.taskPreference ?? 'code',
          topK: params.topK ?? 10,
        });

        const summary = ranked.map((m, i) => {
          const b = m.breakdown;
          return `${i + 1}. **${m.modelId}** — Score: ${m.score}\n` +
            `   Best quant: ${m.bestQuant} | Params: ${m.parameterSize ?? '?'}\n` +
            `   Breakdown: size=${b.sizeScore} quant=${b.quantScore} fresh=${b.freshnessScore} pop=${b.popularityScore} task=${b.taskScore} chat=${b.chatTemplateScore}\n` +
            `   Pull: \`ollama pull hf.co/${m.modelId}:${m.bestQuant.toLowerCase()}\``;
        }).join('\n\n');

        return {
          content: [{ type: 'text' as const, text: `Top ${ranked.length} models ranked for ${params.taskPreference ?? 'code'}:\n\n${summary}` }],
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'get_disk_info',
    'Show available disk space, mount points, and current Ollama models storage path.',
    {},
    async () => {
      try {
        const report = getDiskReport();
        const diskLines = report.disks.map(d =>
          `  ${d.path}: ${d.freeHuman} free / ${d.totalHuman} total (${d.freePercent}% free)`
        ).join('\n');

        return {
          content: [{
            type: 'text' as const,
            text: `Disk Report:\n${diskLines}\n\n` +
              `Models path: ${report.currentModelsPath ?? 'default (~/.ollama/models)'}\n` +
              `Free at models path: ${report.currentModelsPathFree ?? 'unknown'}`,
          }],
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'pull_model',
    'Download a GGUF model from Hugging Face via Ollama. Streams progress in real-time.',
    {
      modelId: z.string().describe('HF model ID (e.g. "bartowski/Qwen2.5-Coder-7B-Instruct-GGUF")'),
      quantization: z.string().describe('Quantization variant (e.g. "Q4_K_M", "Q8_0")'),
    },
    async (params) => {
      try {
        const progressUpdates: string[] = [];

        const result = await pullModel(
          params.modelId,
          params.quantization,
          (progress) => {
            const pct = progress.percent ? ` (${progress.percent}%)` : '';
            progressUpdates.push(`${progress.status}${pct}`);
          },
        );

        const progressLog = progressUpdates.length > 0
          ? `\n\nProgress log (last 10):\n${progressUpdates.slice(-10).join('\n')}`
          : '';

        return {
          content: [{
            type: 'text' as const,
            text: result.success
              ? `Model pulled successfully: ${params.modelId}:${params.quantization}${progressLog}`
              : `Pull failed: ${result.message}${progressLog}`,
          }],
          isError: !result.success,
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'list_local_models',
    'List all models currently installed in Ollama with their sizes, families, and quantization levels.',
    {},
    async () => {
      try {
        const models = await listLocalModels();

        if (models.length === 0) {
          return { content: [{ type: 'text' as const, text: 'No models installed in Ollama.' }] };
        }

        const lines = models.map((m, i) =>
          `${i + 1}. **${m.name}**\n` +
          `   Size: ${m.sizeHuman} | Family: ${m.family} | Params: ${m.parameterSize} | Quant: ${m.quantizationLevel}\n` +
          `   Modified: ${m.modifiedAt}`
        ).join('\n\n');

        return {
          content: [{ type: 'text' as const, text: `Installed models (${models.length}):\n\n${lines}` }],
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'delete_model',
    'Delete a model from Ollama and free disk space.',
    {
      modelName: z.string().describe('Model name as shown in list_local_models'),
    },
    async (params) => {
      try {
        const result = await deleteModel(params.modelName);
        return {
          content: [{ type: 'text' as const, text: result.message }],
          isError: !result.success,
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'set_models_path',
    'Change the directory where Ollama stores downloaded models.',
    {
      path: z.string().describe('Absolute path to the new models directory'),
    },
    async (params) => {
      try {
        const result = setModelsPath(params.path);
        return {
          content: [{ type: 'text' as const, text: result.message }],
          isError: !result.success,
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );

  server.tool(
    'check_model_update',
    'Check if a locally installed model has a newer version available on Hugging Face.',
    {
      modelName: z.string().describe('Model name as shown in list_local_models'),
    },
    async (params) => {
      try {
        const result = await checkModelUpdate(params.modelName);
        return {
          content: [{
            type: 'text' as const,
            text: result.hasUpdate
              ? `Update available for ${params.modelName}!\n${result.message}`
              : `${params.modelName}: ${result.message}`,
          }],
        };
      } catch (err: unknown) {
        return formatToolError(err);
      }
    },
  );
};
