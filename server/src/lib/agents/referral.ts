import { prisma } from '../../db.js';
import { config } from '../../config.js';

/** Referral codes are case-insensitive letters, digits and dashes (stored upper-case). */
export const normaliseAgentCode = (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);

/**
 * Attributes a freshly registered client to the agent whose code they used. Only active agents count,
 * a client is attributed once (first code wins) and an agent cannot refer their own account.
 * Returns the agent id, or null when the code is unknown / inactive. Never throws.
 */
export const attachReferral = async (userId: string, rawCode: string | null | undefined) => {
  if (!rawCode) return null;
  const code = normaliseAgentCode(rawCode);
  if (!code) return null;
  try {
    const agent = await prisma.agent.findFirst({ where: { code, status: 'ACTIVE' }, select: { id: true, userId: true } });
    if (!agent || agent.userId === userId) return null;
    const { count } = await prisma.user.updateMany({
      where: { id: userId, referredByAgentId: null },
      data: { referredByAgentId: agent.id, referredAt: new Date() },
    });
    return count ? agent.id : null;
  } catch (err) {
    console.error('[agents] attach referral failed', err);
    return null;
  }
};

const TRANSLIT: Record<string, string> = {
  Ə: 'E', ə: 'E', Ş: 'SH', ş: 'SH', Ç: 'CH', ç: 'CH', Ğ: 'G', ğ: 'G', Ö: 'O', ö: 'O', Ü: 'U', ü: 'U', İ: 'I', ı: 'I', ß: 'SS', Ä: 'AE', ä: 'AE',
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'E', Ж: 'ZH', З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M', Н: 'N', О: 'O', П: 'P', Р: 'R',
  С: 'S', Т: 'T', У: 'U', Ф: 'F', Х: 'KH', Ц: 'TS', Ч: 'CH', Ш: 'SH', Щ: 'SHCH', Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'YU', Я: 'YA',
};

/** Latin, upper-case, dash-separated slug of a name part ("Gəncə" → "GENCE"). */
export const slugPart = (s: string | null | undefined) =>
  (s ?? '')
    .split('')
    .map((ch) => TRANSLIT[ch] ?? TRANSLIT[ch.toUpperCase()] ?? ch)
    .join('')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Suggests a free referral code from region + first name (+ last name / number when taken), e.g. GENCE-ALI. */
export const suggestAgentCode = async (input: { firstName?: string | null; lastName?: string | null; region?: string | null }) => {
  const first = slugPart(input.firstName) || 'AGENT';
  const region = slugPart(input.region);
  const last = slugPart(input.lastName);
  const base = normaliseAgentCode([region, first].filter(Boolean).join('-')).slice(0, 26).replace(/-+$/, '');
  const candidates = [base, last ? normaliseAgentCode(`${base}-${last.charAt(0)}`) : null].filter((c): c is string => !!c);
  for (const c of candidates) if (!(await prisma.agent.findUnique({ where: { code: c }, select: { id: true } }))) return c;
  for (let n = 2; n < 1000; n++) {
    const c = `${base}-${n}`;
    if (!(await prisma.agent.findUnique({ where: { code: c }, select: { id: true } }))) return c;
  }
  return `${base}-${Date.now().toString(36).toUpperCase()}`.slice(0, 32);
};

/** The link an agent shares; the register page reads `?ref=`. */
export const shareLink = (code: string) => `${config.clientUrl}/register?ref=${encodeURIComponent(code)}`;
