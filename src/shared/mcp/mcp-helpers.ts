import { logger } from '../lib/logger.js';

interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export const formatToolError = (err: unknown): McpToolResult => {
  const message = err instanceof Error ? err.message : String(err);
  logger.error('Tool error', { error: message });
  return { content: [{ type: 'text' as const, text: `Error: ${message}` }], isError: true };
};
