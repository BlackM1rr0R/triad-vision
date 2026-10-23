import type { Prisma } from '@prisma/client';
import { prisma } from '../../db.js';
import { cityKey, dayKey, nameKey, nameSimilarity, normEmail, normPassport, normPhone } from './normalize.js';

/**
 * Duplicate detection among CLIENT accounts (merged-away accounts excluded).
 *
 *   rule                     strength  score  when
 *   PASSPORT                 strong    100    same passport number (letters/digits only, upper case)
 *   EMAIL                    strong     95    same e-mail ignoring case, "+tags" and dots in Gmail addresses
 *   PHONE                    strong     90    same phone number as digits with country code (00 / 0 trunk prefix handled)
 *   NAME_BIRTHDATE           strong     90    same full name after transliteration (Azerbaijani ↔ Latin ↔ Cyrillic,
 *                                             case, spaces, order of the parts) and the same birth date
 *   SIMILAR_NAME_BIRTHDATE   medium     75    Jaro–Winkler of the folded names ≥ 0.92 and the same birth date
 *   SIMILAR_NAME_CITY        medium     60    Jaro–Winkler ≥ 0.92 (or the same name) and the same city
 *
 * Pair score = the best rule + 5 for every further rule, at most 100. Pairs are stored ordered
 * (userAId < userBId); OPEN pairs that no longer match are removed, NOT_DUPLICATE / MERGED decisions stay.
 */

export const SIMILARITY_THRESHOLD = 0.92;

export type DuplicateRule = 'PASSPORT' | 'EMAIL' | 'PHONE' | 'NAME_BIRTHDATE' | 'SIMILAR_NAME_BIRTHDATE' | 'SIMILAR_NAME_CITY';
export interface DuplicateReason {
  rule: DuplicateRule;
  strength: 'strong' | 'medium';
  /** The matching value (normalised) or the similarity, for the chips in the review list. */
  value?: string;
}

const RULE_SCORE: Record<DuplicateRule, number> = {
  PASSPORT: 100,
  EMAIL: 95,
  PHONE: 90,
  NAME_BIRTHDATE: 90,
  SIMILAR_NAME_BIRTHDATE: 75,
  SIMILAR_NAME_CITY: 60,
};
const STRENGTH: Record<DuplicateRule, 'strong' | 'medium'> = {
  PASSPORT: 'strong',
  EMAIL: 'strong',
  PHONE: 'strong',
  NAME_BIRTHDATE: 'strong',
  SIMILAR_NAME_BIRTHDATE: 'medium',
  SIMILAR_NAME_CITY: 'medium',
};

export const scoreReasons = (reasons: DuplicateReason[]) => {
  if (!reasons.length) return 0;
  const scores = reasons.map((r) => RULE_SCORE[r.rule]).sort((a, b) => b - a);
  return Math.min(100, scores[0] + 5 * (scores.length - 1));
};

const candidateSelect = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  passportNumber: true,
  birthDate: true,
  city: true,
} satisfies Prisma.UserSelect;
type Candidate = Prisma.UserGetPayload<{ select: typeof candidateSelect }>;

interface Keys {
  id: string;
  first: string;
  last: string;
  passport: string | null;
  email: string | null;
  phone: string | null;
  name: string | null;
  birth: string | null;
  city: string | null;
}

const keysOf = (u: Candidate): Keys => ({
  id: u.id,
  first: u.firstName,
  last: u.lastName,
  passport: normPassport(u.passportNumber),
  email: normEmail(u.email),
  phone: normPhone(u.phone),
  name: nameKey(u.firstName, u.lastName),
  birth: dayKey(u.birthDate),
  city: cityKey(u.city),
});

export interface FoundPair {
  userAId: string;
  userBId: string;
  score: number;
  reasons: DuplicateReason[];
}

const pairKey = (x: string, y: string) => (x < y ? `${x}|${y}` : `${y}|${x}`);

/** All matching pairs among `all`; with `only`, just the pairs that include one of those ids. */
export const findPairs = (all: Candidate[], only?: Set<string>): FoundPair[] => {
  const keys = all.map(keysOf);
  const reasons = new Map<string, Map<DuplicateRule, DuplicateReason>>();
  const add = (x: Keys, y: Keys, rule: DuplicateRule, value?: string) => {
    if (x.id === y.id) return;
    if (only && !only.has(x.id) && !only.has(y.id)) return;
    const k = pairKey(x.id, y.id);
    let m = reasons.get(k);
    if (!m) reasons.set(k, (m = new Map()));
    if (!m.has(rule)) m.set(rule, { rule, strength: STRENGTH[rule], ...(value !== undefined ? { value } : {}) });
  };

  // Exact keys: group, then every pair inside a group.
  const groupBy = (field: 'passport' | 'email' | 'phone', rule: DuplicateRule) => {
    const groups = new Map<string, Keys[]>();
    for (const k of keys) {
      const v = k[field];
      if (!v) continue;
      const g = groups.get(v);
      if (g) g.push(k);
      else groups.set(v, [k]);
    }
    for (const [v, g] of groups) {
      if (g.length < 2) continue;
      for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) add(g[i], g[j], rule, v);
    }
  };
  groupBy('passport', 'PASSPORT');
  groupBy('email', 'EMAIL');
  groupBy('phone', 'PHONE');

  // Names: compared only inside blocks of the same birth date or the same city (the rules require one of them).
  const compareBlock = (block: Keys[], by: 'birth' | 'city') => {
    for (let i = 0; i < block.length; i++) {
      const x = block[i];
      for (let j = i + 1; j < block.length; j++) {
        const y = block[j];
        if (only && !only.has(x.id) && !only.has(y.id)) continue;
        if (!x.name || !y.name) continue;
        const exact = x.name === y.name;
        const sim = exact ? 1 : nameSimilarity({ first: x.first, last: x.last }, { first: y.first, last: y.last });
        if (sim < SIMILARITY_THRESHOLD) continue;
        if (by === 'birth') add(x, y, exact ? 'NAME_BIRTHDATE' : 'SIMILAR_NAME_BIRTHDATE', exact ? x.birth! : sim.toFixed(2));
        else add(x, y, 'SIMILAR_NAME_CITY', x.city!);
      }
    }
  };
  for (const by of ['birth', 'city'] as const) {
    const blocks = new Map<string, Keys[]>();
    for (const k of keys) {
      const v = k[by];
      if (!v) continue;
      const b = blocks.get(v);
      if (b) b.push(k);
      else blocks.set(v, [k]);
    }
    for (const b of blocks.values()) if (b.length > 1) compareBlock(b, by);
  }

  const out: FoundPair[] = [];
  for (const [k, m] of reasons) {
    const [userAId, userBId] = k.split('|');
    const list = [...m.values()].sort((a, b) => RULE_SCORE[b.rule] - RULE_SCORE[a.rule]);
    out.push({ userAId, userBId, reasons: list, score: scoreReasons(list) });
  }
  return out;
};

const loadCandidates = () => prisma.user.findMany({ where: { role: 'CLIENT', mergedIntoId: null }, select: candidateSelect });

/**
 * Writes the found pairs. `scopeUserIds`: only pairs touching these users are reconciled (stale OPEN
 * pairs of other users are left alone); without it every OPEN pair that no longer matches is removed.
 */
const storePairs = async (found: FoundPair[], scopeUserIds?: string[]) => {
  const scopeWhere: Prisma.DuplicatePairWhereInput = scopeUserIds
    ? { OR: [{ userAId: { in: scopeUserIds } }, { userBId: { in: scopeUserIds } }] }
    : {};
  const existing = await prisma.duplicatePair.findMany({ where: scopeWhere, select: { id: true, userAId: true, userBId: true, status: true } });
  const byKey = new Map(existing.map((p) => [`${p.userAId}|${p.userBId}`, p]));
  let created = 0;
  let updated = 0;
  const seen = new Set<string>();
  for (const f of found) {
    const k = `${f.userAId}|${f.userBId}`;
    seen.add(k);
    const row = byKey.get(k);
    const reasons = f.reasons as unknown as Prisma.InputJsonValue;
    if (row) {
      // Decisions stick: a NOT_DUPLICATE / MERGED pair only gets its facts refreshed.
      await prisma.duplicatePair.update({ where: { id: row.id }, data: { score: f.score, reasons } });
      updated++;
    } else {
      await prisma.duplicatePair
        .create({ data: { userAId: f.userAId, userBId: f.userBId, score: f.score, reasons } })
        .then(() => created++)
        .catch((err: { code?: string }) => {
          if (err?.code !== 'P2002') throw err; // a parallel scan created it first
        });
    }
  }
  const stale = existing.filter((p) => p.status === 'OPEN' && !seen.has(`${p.userAId}|${p.userBId}`)).map((p) => p.id);
  if (stale.length) await prisma.duplicatePair.deleteMany({ where: { id: { in: stale }, status: 'OPEN' } });
  return { found: found.length, created, updated, removed: stale.length };
};

/** Full scan (nightly job, "scan now" button). */
export const scanAllDuplicates = async () => storePairs(findPairs(await loadCandidates()));

/** Pairs of one client (after registration, a profile change or a merge). Never throws. */
export const scanUserDuplicates = async (userId: string) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, mergedIntoId: true } });
    if (!user || user.role !== 'CLIENT' || user.mergedIntoId) return null;
    return await storePairs(findPairs(await loadCandidates(), new Set([userId])), [userId]);
  } catch (err) {
    console.error('[duplicates] scan of user failed', userId, err);
    return null;
  }
};

export const orderedPair = (x: string, y: string): [string, string] => (x < y ? [x, y] : [y, x]);
