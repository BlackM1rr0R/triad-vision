import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../../config.js';
import { prisma } from '../../db.js';
import { renderCardPng, type CardFormat, type CardInput } from './card.js';
import { cityOf, displayNameOf, visaLineOf, type NameStyle } from './service.js';
import { CARD_TEXTS, type CardLocale } from './texts.js';

/**
 * Private Instagram card of an approved case (client portal → "Create my Instagram card").
 *
 * Unlike the public share link (/success/:token, lib/successShare/service) nothing here is public: the PNG is
 * only ever sent to the signed-in client who owns the case, to download or hand to the Web Share API. The
 * client picks the format (story 1080×1920, square 1080×1080, post 1080×1350), how the name appears (first
 * name, initials, anonymous) and the language. The QR code opens the website — never a page about the client.
 *
 * Rendering is deterministic, so the PNG is cached on disk per case and variant:
 *   <UPLOADS>/cache/success-cards/<caseId>/<format>.<nameStyle>.<locale>.<hash of the drawn content>.png
 * A changed city / profession gives a new hash (older files of that variant are removed). The case folder is
 * removed when the case is no longer approved and with the account (DSGVO erasure, lib/userDeletion).
 */

const CASE_ID_RE = /^[A-Za-z0-9_-]{8,40}$/;
const cacheRoot = () => path.join(config.uploads.cacheDir, 'success-cards');
const caseDir = (caseId: string) => path.join(cacheRoot(), caseId);

const localePrefix = (l: string) => (l === 'az' ? '' : `/${l}`);

export interface PrivateCardOptions {
  format: CardFormat;
  nameStyle: NameStyle;
  locale: CardLocale;
}

/** Card input of the client's own approved main case, or null (not theirs / not approved). */
export const privateCardInput = async (userId: string, caseId: string, opts: PrivateCardOptions): Promise<CardInput | null> => {
  if (!CASE_ID_RE.test(caseId)) return null;
  const [user, c] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { firstName: true, lastName: true, role: true, isActive: true } }),
    prisma.case.findUnique({
      where: { id: caseId },
      select: {
        clientId: true,
        status: true,
        parentCaseId: true,
        visaType: true,
        profession: true,
        visaCategory: { select: { visaLabel: true, title: true } },
        company: { select: { city: true } },
        vacancy: { select: { city: true } },
        arrivalPlan: { select: { housingCity: true } },
      },
    }),
  ]);
  if (!user || user.role !== 'CLIENT' || !user.isActive || !c || c.clientId !== userId) return null;
  if (c.status !== 'APPROVED' || c.parentCaseId) {
    await purgeCaseCards([caseId]); // no longer approved: nothing of it may stay on disk
    return null;
  }
  const tx = CARD_TEXTS[opts.locale];
  const city = cityOf(c);
  return {
    format: opts.format,
    displayName: displayNameOf(user, opts.nameStyle, opts.locale),
    kicker: tx.kicker,
    headline: tx.approved,
    visaLine: visaLineOf(c, opts.locale),
    profession: c.profession?.trim().slice(0, 80) || null,
    destination: city ? `${city}, ${tx.country}` : tx.country,
    subline: tx.subline,
    withUs: tx.withUs,
    scanLabel: tx.scan,
    codeLine: null,
    qrUrl: `${config.clientUrl}${localePrefix(opts.locale)}`,
    lang: opts.locale,
  };
};

const variantOf = (o: PrivateCardOptions) => `${o.format}.${o.nameStyle}.${o.locale}.`;
const hashOf = (input: CardInput) => crypto.createHash('sha256').update(JSON.stringify(input)).digest('hex').slice(0, 20);

/** The PNG of a private card: from the disk cache, else rendered and stored (replacing older versions of the variant). */
export const privateCardPng = async (caseId: string, opts: PrivateCardOptions, input: CardInput) => {
  const dir = caseDir(caseId);
  const prefix = variantOf(opts);
  const file = path.join(dir, `${prefix}${hashOf(input)}.png`);
  const cached = await fs.readFile(file).catch(() => null);
  if (cached) return { png: cached, cached: true };
  const png = await renderCardPng(input);
  await fs.mkdir(dir, { recursive: true });
  const old = (await fs.readdir(dir).catch(() => [] as string[])).filter((n) => n.startsWith(prefix) && path.join(dir, n) !== file);
  await Promise.all(old.map((n) => fs.unlink(path.join(dir, n)).catch(() => undefined)));
  const tmp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  await fs.writeFile(tmp, png);
  await fs.rename(tmp, file).catch(async () => fs.unlink(tmp).catch(() => undefined));
  return { png, cached: false };
};

/** Cached files of one case (tests / admin). */
export const cachedCardFiles = async (caseId: string) => (CASE_ID_RE.test(caseId) ? (await fs.readdir(caseDir(caseId)).catch(() => [] as string[])).filter((n) => n.endsWith('.png')) : []);

/** Removes the cached cards of these cases (case no longer approved, account erasure). */
export const purgeCaseCards = async (caseIds: string[]) => {
  for (const id of caseIds) {
    if (!CASE_ID_RE.test(id)) continue;
    await fs.rm(caseDir(id), { recursive: true, force: true }).catch(() => undefined);
  }
};
