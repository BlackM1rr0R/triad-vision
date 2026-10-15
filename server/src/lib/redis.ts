import { Redis } from 'ioredis';
import { config } from '../config.js';

/**
 * Optional Redis connection. When REDIS_URL is set, rate limits, login locks and the realtime
 * bus can be shared by several API instances; without it everything stays in-process (fine for
 * one server). Connection problems are logged, never thrown: the API keeps working in-memory.
 */
let client: Redis | null = null;
let failed = false;

export const redis = (): Redis | null => {
  if (client || failed || !config.redisUrl) return client;
  try {
    client = new Redis(config.redisUrl, {
      lazyConnect: false,
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      connectTimeout: 3000,
      retryStrategy: (times: number) => Math.min(times * 500, 5000),
    });
    client.on('error', (err: Error) => {
      if (!failed) console.error('[redis] error', err.message);
    });
    client.on('ready', () => console.log('[redis] connected'));
  } catch (err) {
    failed = true;
    console.error('[redis] disabled:', err);
  }
  return client;
};

export const redisEnabled = () => !!config.redisUrl;
