import type { Locale } from '@prisma/client';
import { prisma } from '../../db.js';
import { pickL10n } from '../jobsNotifications.js';
import { normaliseText } from '../matching.js';

/**
 * Knowledge of the public advisor: the site's published content (visa categories, services, FAQs, recent
 * posts) turned into short documents per language, and a small keyword retrieval that hands the model a
 * few compact excerpts instead of the whole site. Loaded at most every 10 minutes.
 */

export interface KbDoc {
  kind: 'visa' | 'service' | 'faq' | 'post';
  title: string;
  text: string;
  link: string | null;
  /** normalised words for matching */
  words: Set<string>;
}

const TTL_MS = 10 * 60 * 1000;
const cache = new Map<Locale, { at: number; docs: KbDoc[]; overview: string }>();

export const clearKnowledgeCache = () => cache.clear();

const list = (v: unknown, l: Locale): string[] => {
  if (!v || typeof v !== 'object') return [];
  const o = v as Record<string, unknown>;
  const arr = o[l] ?? o.de ?? o.en ?? o.az;
  return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
};

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

const wordsOf = (s: string) => new Set(normaliseText(s).split(' ').filter((w) => w.length >= 3));

const load = async (l: Locale) => {
  const [visas, services, faqs, posts] = await Promise.all([
    prisma.visaCategory.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, take: 30 }),
    prisma.service.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, take: 30 }),
    prisma.faq.findMany({ where: { published: true }, orderBy: { sortOrder: 'asc' }, take: 60 }),
    prisma.post.findMany({ where: { published: true }, orderBy: { publishedAt: 'desc' }, take: 10, select: { slug: true, title: true, excerpt: true } }),
  ]);
  const docs: KbDoc[] = [];
  for (const v of visas) {
    const title = `${v.visaLabel} — ${pickL10n(v.title, l)}`;
    const facts = [
      pickL10n(v.summary, l),
      v.germanLevel ? `German: ${v.germanLevel}` : '',
      v.processingMin || v.processingMax ? `Processing: ${v.processingMin ?? '?'}–${v.processingMax ?? '?'} weeks` : '',
      v.salaryMin || v.salaryMax ? `Salary: ${v.salaryMin ?? '?'}–${v.salaryMax ?? '?'} EUR gross/month` : '',
      v.familyReunion != null ? `Family reunion: ${v.familyReunion ? 'yes' : 'no'}` : '',
      list(v.items, l).join('; '),
      list(v.requirements, l).length ? `Requirements: ${list(v.requirements, l).join('; ')}` : '',
      list(v.documents, l).length ? `Documents: ${list(v.documents, l).join('; ')}` : '',
    ].filter(Boolean);
    const text = squash(facts.join('. '));
    docs.push({ kind: 'visa', title, text, link: `/visas/${v.slug}`, words: wordsOf(`${title} ${text} visa viza visum`) });
  }
  for (const s of services) {
    const title = pickL10n(s.title, l);
    const text = squash([pickL10n(s.summary, l), list(s.features, l).join('; '), s.duration ? `Duration: ${pickL10n(s.duration, l)}` : '', list(s.steps, l).join(' → ')].filter(Boolean).join('. '));
    docs.push({ kind: 'service', title, text, link: `/services/${s.slug}`, words: wordsOf(`${title} ${text} service xidmet`) });
  }
  for (const f of faqs) {
    const title = pickL10n(f.question, l);
    const text = squash(pickL10n(f.answer, l));
    docs.push({ kind: 'faq', title, text, link: '/faq', words: wordsOf(`${title} ${text}`) });
  }
  for (const p of posts) {
    const title = pickL10n(p.title, l);
    const text = squash(pickL10n(p.excerpt, l));
    docs.push({ kind: 'post', title, text, link: `/news/${p.slug}`, words: wordsOf(`${title} ${text}`) });
  }
  const overview = squash(
    `Visa categories: ${visas.map((v) => `${v.visaLabel} ${pickL10n(v.title, l)}`).join(', ') || '—'}. Services: ${services.map((s) => pickL10n(s.title, l)).join(', ') || '—'}.`,
  ).slice(0, 700);
  return { docs, overview };
};

export const knowledgeFor = async (l: Locale) => {
  const hit = cache.get(l);
  if (hit && Date.now() - hit.at < TTL_MS) return hit;
  const value = { at: Date.now(), ...(await load(l)) };
  cache.set(l, value);
  return value;
};

/** Overlap score of a query with a document; 5-letter prefixes catch inflected forms (vizası / viza). */
export const scoreDoc = (query: Set<string>, doc: Pick<KbDoc, 'words'>) => {
  let s = 0;
  const prefixes = new Set([...doc.words].map((w) => w.slice(0, 5)));
  for (const w of query) {
    if (doc.words.has(w)) s += 2;
    else if (w.length >= 5 && prefixes.has(w.slice(0, 5))) s += 1;
  }
  return s;
};

/** The few most relevant excerpts for a question (and the recent turns), as compact prompt text. */
export const retrieve = async (l: Locale, text: string, opts: { docs?: number; chars?: number } = {}) => {
  const kb = await knowledgeFor(l);
  const q = wordsOf(text);
  const top = kb.docs
    .map((d) => ({ d, s: scoreDoc(q, d) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, opts.docs ?? 4);
  const chars = opts.chars ?? 450;
  const excerpts = top.map(({ d }) => `[${d.kind}] ${d.title}${d.link ? ` (${d.link})` : ''}: ${d.text.slice(0, chars)}`);
  return { overview: kb.overview, excerpts };
};
