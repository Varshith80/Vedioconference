/**
 * Centralized logging.
 * In production this can be swapped to Sentry / Logtail / etc.
 *
 * The active log level is read from the validated `serverEnv()`
 * so the rest of the app never touches `process.env` directly.
 */
import { serverEnv } from '@/lib/env';

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function getActive(): number {
  try {
    return LEVELS[serverEnv().LOG_LEVEL] ?? LEVELS.info;
  } catch {
    // Logger must never throw. If env validation fails we still
    // want the application to boot, just at the default level.
    return LEVELS.info;
  }
}

const ACTIVE: number = getActive();

function emit(level: Level, message: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < ACTIVE) return;
  const payload = { level, time: new Date().toISOString(), message, ...meta };
  if (level === 'error') console.error(JSON.stringify(payload));
  else if (level === 'warn') console.warn(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
}

export const logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => emit('debug', msg, meta),
  info:  (msg: string, meta?: Record<string, unknown>) => emit('info',  msg, meta),
  warn:  (msg: string, meta?: Record<string, unknown>) => emit('warn',  msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => emit('error', msg, meta),
};
