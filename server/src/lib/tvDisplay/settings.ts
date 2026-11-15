import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';

/** Office TV mode settings (Setting `tvDisplay`), edited by ADMIN+ in Admin → TV mode. */
export const TV_PANELS = ['agenda', 'inquiries', 'waiting', 'approved', 'arrivals'] as const;
export type TvPanel = (typeof TV_PANELS)[number];

export const tvSettingsSchema = z.object({
  /** Panels shown on the TV, in this order (the server computes only these). */
  panels: z.array(z.enum(TV_PANELS)).max(TV_PANELS.length).transform((p) => [...new Set(p)]),
  /** Seconds per page when the panels do not fit on one screen. */
  rotationSeconds: z.number().int().min(5).max(600),
  /** Full-screen "Viza gəldi!" celebration when a case is approved. */
  celebration: z.boolean(),
  /** Short chime with the celebration (off by default; most TVs also need one click before audio may play). */
  sound: z.boolean(),
});
export type TvSettings = z.infer<typeof tvSettingsSchema>;

export const TV_DEFAULTS: TvSettings = { panels: [...TV_PANELS], rotationSeconds: 20, celebration: true, sound: false };

const KEY = 'tvDisplay';

export const getTvSettings = async (): Promise<TvSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const parsed = tvSettingsSchema.partial().safeParse(row?.value ?? {});
  return { ...TV_DEFAULTS, ...(parsed.success ? Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)) : {}) };
};

export const saveTvSettings = async (patch: Partial<TvSettings>) => {
  const next = tvSettingsSchema.parse({ ...(await getTvSettings()), ...patch });
  const value = next as unknown as Prisma.InputJsonValue;
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
  return next;
};
