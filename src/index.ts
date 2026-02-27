import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createServer } from './shared/mcp/server.js';
import { logger } from './shared/lib/logger.js';

const main = async (): Promise<void> => {
  const server = createServer();
  const transport = new StdioServerTransport();

  logger.info('LLM Controller Orlova MCP server starting');

  await server.connect(transport);

  logger.info('LLM Controller Orlova MCP server connected via stdio');
};

main().catch((err) => {
  logger.error('Fatal startup error', { error: String(err) });
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
