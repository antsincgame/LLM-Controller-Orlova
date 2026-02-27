import { appendFileSync } from 'node:fs';
import { getLogPath } from './paths.js';

const LOG_PATH = getLogPath();

type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

const formatEntry = (level: LogLevel, message: string, meta?: Record<string, unknown>): string => {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}\n`;
};

const write = (level: LogLevel, message: string, meta?: Record<string, unknown>): void => {
  const entry = formatEntry(level, message, meta);
  try {
    appendFileSync(LOG_PATH, entry, 'utf-8');
  } catch {
    // stderr as last resort — never crash the server over logging
    process.stderr.write(entry);
  }
};

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => write('INFO', message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => write('WARN', message, meta),
  error: (message: string, meta?: Record<string, unknown>) => write('ERROR', message, meta),
  debug: (message: string, meta?: Record<string, unknown>) => write('DEBUG', message, meta),
};
