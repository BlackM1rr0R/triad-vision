import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { z } from 'zod';
import type { Prisma, ProblemReport, Role } from '@prisma/client';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { createAutomationTask } from '../automation/tasks.js';
import { taskKey } from '../tasks/core.js';
import { SITE_TEXTS } from './texts.js';

/**
 * "Problem bildir": reports from every page (visitors, clients, staff). Each report becomes a team task —
 * for the person chosen in the settings (Setting 'problemReports'), otherwise for every active admin — and
 * is handled on the admin page "Problem bildirişləri" (status, internal note, answer to the reporter).
 */

export const PROBLEM_DIR = () => path.join(config.uploads.privateDir, 'problem-reports');
export const PROBLEM_SETTING = 'problemReports';
/** Reports per IP and hour (visitors and users alike). */
export const PROBLEM_HOURLY_LIMIT = 5;
export const PROBLEM_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export const PROBLEM_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const problemSettingsSchema = z.object({ assigneeId: z.string().min(1).max(64).nullable().default(null) });
export type ProblemSettings = z.infer<typeof problemSettingsSchema>;

export const getProblemSettings = async (): Promise<ProblemSettings> => {
  const row = await prisma.setting.findUnique({ where: { key: PROBLEM_SETTING } });
  const parsed = problemSettingsSchema.safeParse(row?.value);
  return parsed.success ? parsed.data : { assigneeId: null };
};

/** Admins, plus the staff member the settings name, may open the reports. */
export const canHandleProblems = async (user: { id: string; role: Role } | undefined) => {
  if (!user) return false;
  if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN') return true;
  if (user.role !== 'STAFF') return false;
  return (await getProblemSettings()).assigneeId === user.id;
};

const jsonList = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    try {
      return JSON.parse(v);
    } catch {
      return [];
    }
  },
  z.array(z.string().max(2000)).max(50).default([]),
);
const jsonObject = z.preprocess(
  (v) => {
    if (typeof v !== 'string') return v;
    if (!v) return null;
    try {
      return JSON.parse(v);
    } catch {
      return null;
    }
  },
  z
    .object({
      method: z.string().max(10).optional(),
      url: z.string().max(500).optional(),
      status: z.number().int().min(0).max(999).nullable().optional(),
      code: z.string().max(80).optional(),
      requestId: z.string().max(80).optional(),
      at: z.string().max(40).optional(),
    })
    .nullable()
    .default(null),
);
const optText = (max: number) =>
  z
    .string()
    .max(max * 4)
    .optional()
    .transform((s) => (s ? s.trim().slice(0, max) || null : null));

export const problemInputSchema = z.object({
  message: z.string().trim().min(5).max(3000),
  pageUrl: z.string().trim().min(1).max(2000).transform((s) => s.slice(0, 500)),
  appVersion: optText(40),
  userAgent: optText(400),
  platform: optText(100),
  screen: optText(40),
  language: optText(10),
  email: z
    .string()
    .trim()
    .max(200)
    .optional()
    .transform((s) => s || null)
    .pipe(z.string().email().nullable()),
  consoleErrors: jsonList,
  lastApiError: jsonObject,
  /** Honeypot: hidden field, humans leave it empty. */
  website: z.string().max(500).optional(),
});
export type ProblemInput = z.infer<typeof problemInputSchema>;

/** Re-encodes the attachment (drops EXIF / GPS, normalises orientation, caps the size). */
export const storeProblemImage = async (buf: Buffer) => {
  let out: Buffer;
  try {
    out = await sharp(buf, { limitInputPixels: 60_000_000 })
      .rotate()
      .resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    return null;
  }
  const name = `${crypto.randomUUID()}.jpg`;
  await fs.mkdir(PROBLEM_DIR(), { recursive: true });
  await fs.writeFile(path.join(PROBLEM_DIR(), name), out);
  return { file: name, mime: 'image/jpeg' };
};

const describeReporter = (u: { firstName: string; lastName: string; role: Role; email: string } | null, email: string | null) =>
  u ? `${`${u.firstName} ${u.lastName}`.trim()} · ${u.role} · ${u.email}` : email ? `${SITE_TEXTS.az.anonymous} · ${email}` : SITE_TEXTS.az.anonymous;

/** Creates the team task for a new report (assignee from the settings, else all active admins). */
export const createProblemTask = async (report: ProblemReport) => {
  const settings = await getProblemSettings();
  let assigneeIds: string[] = [];
  if (settings.assigneeId) assigneeIds = [settings.assigneeId];
  if (!assigneeIds.length) {
    assigneeIds = (await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SUPER_ADMIN'] }, isActive: true }, select: { id: true } })).map((u) => u.id);
  }
  const reporter = report.userId
    ? await prisma.user.findUnique({ where: { id: report.userId }, select: { firstName: true, lastName: true, role: true, email: true } })
    : null;
  const lines = [
    report.message,
    '',
    `Səhifə: ${report.pageUrl}`,
    `Bildirən: ${describeReporter(reporter, report.contactEmail)}`,
    report.appVersion ? `Versiya: ${report.appVersion}` : null,
    report.userAgent ? `Brauzer: ${report.userAgent}` : null,
    report.screen ? `Ekran: ${report.screen}` : null,
    Array.isArray(report.consoleErrors) && report.consoleErrors.length ? `Konsol xətaları: ${report.consoleErrors.length}` : null,
    `/admin/problems?id=${report.id}`,
  ].filter((l): l is string => l !== null);
  const title = `${SITE_TEXTS.az.taskTitle}: ${report.message.replace(/\s+/g, ' ').slice(0, 120)}`;
  const task = await createAutomationTask({ title, description: lines.join('\n'), assigneeIds, priority: 'NORMAL' });
  await prisma.problemReport.update({ where: { id: report.id }, data: { taskId: task.id } });
  return task;
};

export interface ProblemReply {
  at: string;
  byId: string;
  byName: string;
  message: string;
  channel: 'IN_APP' | 'EMAIL';
}

export const repliesOf = (v: Prisma.JsonValue | null): ProblemReply[] => (Array.isArray(v) ? (v as unknown as ProblemReply[]) : []);

export const taskRef = async (taskId: string | null) => {
  if (!taskId) return null;
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, number: true, status: true } });
  return t ? { id: t.id, key: taskKey(t.number), status: t.status } : null;
};
