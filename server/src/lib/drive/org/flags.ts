import type { Prisma } from '@prisma/client';
import { prisma } from '../../../db.js';

/**
 * One-time seeds of the document organisation (default tags, folder templates, example smart folders): each
 * runs once and is remembered in a Setting row, so data an admin deleted afterwards never comes back.
 */
const running = new Map<string, Promise<void>>();

export const runOnce = (key: string, fn: () => Promise<unknown>): Promise<void> => {
  const pending = running.get(key);
  if (pending) return pending;
  const p = (async () => {
    if (await prisma.setting.findUnique({ where: { key } })) return;
    await fn();
    await prisma.setting.upsert({ where: { key }, create: { key, value: { doneAt: new Date().toISOString() } }, update: {} });
  })().finally(() => running.delete(key));
  running.set(key, p);
  return p;
};

export const readSetting = async <T>(key: string): Promise<T | null> => ((await prisma.setting.findUnique({ where: { key } }))?.value as T | undefined) ?? null;

export const writeSetting = async (key: string, value: unknown) => {
  const v = value as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key }, create: { key, value: v }, update: { value: v } });
};
