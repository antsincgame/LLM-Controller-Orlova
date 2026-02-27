import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerOllamaTools } from './ollama-tools.js';
import { registerComfyUITools } from './comfyui-tools.js';

export const createServer = (): McpServer => {
  const server = new McpServer({
    name: 'llm-controller-orlova',
    version: '1.0.0',
  });

  registerOllamaTools(server);
  registerComfyUITools(server);

  return server;
};
