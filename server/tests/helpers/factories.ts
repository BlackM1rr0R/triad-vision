import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { Locale, Role } from '@prisma/client';
import { prisma } from '../../src/db.js';
import { issueSession } from '../../src/middleware/auth.js';

export const TEST_PASSWORD = 'Password123!';
// Low cost factor keeps fixtures fast; bcrypt.compare works with any cost.
const PASSWORD_HASH = bcrypt.hashSync(TEST_PASSWORD, 4);

let seq = 0;
export const uniq = (prefix = 'u') => `${prefix}${Date.now().toString(36)}${(seq++).toString(36)}${crypto.randomBytes(2).toString('hex')}`;

export interface UserOpts {
  role?: Role;
  locale?: Locale;
  email?: string;
  firstName?: string;
  lastName?: string;
  phone?: string | null;
  isActive?: boolean;
  client?: 'web' | 'mobile';
}

/** Inserts a user directly (bypassing the rate-limited register route) and returns a web session token. */
export const createUser = async (opts: UserOpts = {}) => {
  const user = await prisma.user.create({
    data: {
      email: opts.email ?? `${uniq((opts.role ?? 'CLIENT').toLowerCase())}@test.local`,
      passwordHash: PASSWORD_HASH,
      role: opts.role ?? 'CLIENT',
      locale: opts.locale ?? 'az',
      firstName: opts.firstName ?? 'Test',
      lastName: opts.lastName ?? 'User',
      phone: opts.phone ?? null,
      isActive: opts.isActive ?? true,
    },
  });
  const { token } = await issueSession(user.id, { client: opts.client ?? 'web' });
  return { user, token, password: TEST_PASSWORD };
};

export const createAdmin = (opts: UserOpts = {}) => createUser({ firstName: 'Admin', ...opts, role: 'ADMIN' });
export const createSuperAdmin = (opts: UserOpts = {}) => createUser({ firstName: 'Super', ...opts, role: 'SUPER_ADMIN' });
export const createStaff = (opts: UserOpts = {}) => createUser({ firstName: 'Staff', ...opts, role: 'STAFF' });
export const createClient = (opts: UserOpts = {}) => createUser({ ...opts, role: 'CLIENT' });

export const l10n = (base: string) => ({ az: `${base} az`, de: `${base} de`, en: `${base} en`, ru: `${base} ru` });
export const l10nList = (base: string) => ({ az: [`${base} az`], de: [`${base} de`], en: [`${base} en`], ru: [`${base} ru`] });

/** Valid request bodies for each admin content resource (also used to insert fixtures directly). */
export const contentPayload = {
  'visa-categories': (over: Record<string, unknown> = {}) => ({
    slug: uniq('visa-'),
    icon: 'Truck',
    image: 'https://example.com/v.jpg',
    visaLabel: '§18b',
    title: l10n('Visa'),
    summary: l10n('Summary'),
    items: l10nList('Item'),
    body: l10n('Body'),
    sortOrder: 0,
    published: true,
    ...over,
  }),
  services: (over: Record<string, unknown> = {}) => ({
    slug: uniq('svc-'),
    icon: 'Briefcase',
    image: 'https://example.com/s.jpg',
    audience: 'all',
    title: l10n('Service'),
    summary: l10n('Summary'),
    body: l10n('Body'),
    features: l10nList('Feature'),
    sortOrder: 0,
    published: true,
    ...over,
  }),
  partners: (over: Record<string, unknown> = {}) => ({
    name: 'Partner GmbH',
    logo: null,
    website: 'https://partner.example',
    sortOrder: 0,
    published: true,
    ...over,
  }),
  'visa-samples': (over: Record<string, unknown> = {}) => ({
    image: 'https://example.com/sample.jpg',
    profession: l10n('Driver'),
    visaLabel: '§18b',
    dateLabel: l10n('2026'),
    sortOrder: 0,
    published: true,
    ...over,
  }),
  testimonials: (over: Record<string, unknown> = {}) => ({
    quote: l10n('Great'),
    author: l10n('Hans'),
    role: l10n('CEO'),
    kind: 'company',
    sortOrder: 0,
    published: true,
    ...over,
  }),
  stats: (over: Record<string, unknown> = {}) => ({
    icon: 'Users',
    value: 120,
    prefix: '',
    suffix: '+',
    label: l10n('Workers'),
    sortOrder: 0,
    ...over,
  }),
  faqs: (over: Record<string, unknown> = {}) => ({
    question: l10n('Question'),
    answer: l10n('Answer'),
    audience: 'all',
    sortOrder: 0,
    published: true,
    ...over,
  }),
  posts: (over: Record<string, unknown> = {}) => ({
    slug: uniq('post-'),
    cover: 'https://example.com/p.jpg',
    title: l10n('Post'),
    excerpt: l10n('Excerpt'),
    body: l10n('Body'),
    published: true,
    publishedAt: new Date('2026-01-01T00:00:00Z').toISOString(),
    ...over,
  }),
};

export type ContentResource = keyof typeof contentPayload;

export const createVisaCategory = (over: Record<string, unknown> = {}) =>
  prisma.visaCategory.create({ data: contentPayload['visa-categories'](over) as never });
export const createService = (over: Record<string, unknown> = {}) =>
  prisma.service.create({ data: contentPayload.services(over) as never });
export const createPost = (over: Record<string, unknown> = {}) =>
  prisma.post.create({ data: contentPayload.posts(over) as never });
