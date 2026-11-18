import { expect } from 'vitest';
import { anon, ORIGIN, sessionAgent, type Agent } from './api';
import { prisma } from './db';
import { expectStatus } from './workflow';
import { createVerificationToken } from '../../src/lib/emailVerification.js';

/**
 * Helpers for the end-to-end journey tests (tests/e2e/journeys): a client goes through the real sign-up and e-mail
 * confirmation routes instead of a factory row, and the portal cards are read the way the client UI reads them.
 */

let seq = 0;

export interface RegisterInput {
  firstName: string;
  lastName: string;
  locale?: 'az' | 'de' | 'en' | 'ru';
  passportNumber?: string;
  /** Referral partner / agent code (the /p/CODE short link puts it into the form as ?ref=CODE). */
  ref?: string;
  partnerConsent?: boolean;
}

/** The web session token from a response's Set-Cookie header (tv_session). */
export const sessionTokenFrom = (setCookie: string | string[] | undefined) => {
  const raw = ([] as string[]).concat(setCookie ?? []).find((c) => c.startsWith('tv_session='));
  if (!raw) throw new Error('no tv_session cookie in the response');
  return raw.split(';')[0].slice('tv_session='.length);
};

/**
 * POST /api/auth/register (the public sign-up form), then the e-mail link (POST /api/auth/verify-email). Returns the
 * session the sign-up itself opened. A fresh verification token replaces the e-mailed one (a new link invalidates
 * the previous one), so the test does not have to parse the e-mail body.
 */
export const registerAndVerify = async (input: RegisterInput) => {
  seq++;
  const email = `journey${Date.now().toString(36)}${seq}@test.local`;
  const res = expectStatus(
    await anon()
      .post('/api/auth/register')
      .set('Origin', ORIGIN)
      .send({
        email,
        password: 'Password123',
        firstName: input.firstName,
        lastName: input.lastName,
        locale: input.locale ?? 'az',
        phone: `+99450${String(1000000 + seq * 7919).slice(-7)}`,
        birthDate: '1992-04-15',
        passportNumber: input.passportNumber ?? `C${String(10000000 + seq * 104729).slice(-8)}`,
        ...(input.ref ? { ref: input.ref, refEntered: true } : {}),
        ...(input.partnerConsent !== undefined ? { partnerConsent: input.partnerConsent } : {}),
      }),
    201,
  );
  const userId = res.body.user.id as string;
  expect(res.body.user.emailVerified).toBe(false);
  const agent = sessionAgent(sessionTokenFrom(res.headers['set-cookie']));
  // Unverified: no case yet.
  expect((await agent.post('/api/cases').send({ profession: 'X' })).body.error).toBe('EMAIL_NOT_VERIFIED');
  const token = await createVerificationToken(userId);
  expectStatus(await anon().post('/api/auth/verify-email').set('Origin', ORIGIN).send({ token }), 200);
  expect(expectStatus(await agent.get('/api/auth/me'), 200).body.user.emailVerified).toBe(true);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { user, agent, email };
};

export interface NextAction {
  kind: string;
  to: string;
  count: number;
  detail: unknown;
}

/** GET /api/account/next-step plus every action of the card (big card, secondary ones and "+N more"). */
export const nextStep = async (agent: Agent) => {
  const body = expectStatus(await agent.get('/api/account/next-step'), 200).body;
  const all = [body.primary, ...(body.secondary ?? []), ...(body.more ?? [])].filter(Boolean) as NextAction[];
  return { body, all, kinds: all.map((a) => a.kind) };
};

/** GET /api/account/stage (stage-based portal). */
export const portalStage = async (agent: Agent) => expectStatus(await agent.get('/api/account/stage'), 200).body as { stage: string; phase: string; arrived: boolean; featured: string[] };

/** GET /api/doc-progress/cases/:id (client document status overview). */
export const docProgress = async (agent: Agent, caseId: string) =>
  expectStatus(await agent.get(`/api/doc-progress/cases/${caseId}`), 200).body.overview as {
    status: string;
    percent: number | null;
    steps: { key: string; state: string }[];
    documents: { stage: string; preview: boolean; uploadOpen: boolean; counts: Record<string, number> }[];
    embassyCollection: null | { uploadOpen: boolean; preview: boolean; items: unknown[] };
  };

/** Free places of a vacancy as the public job board shows them. */
export const placesOf = async (slug: string) => {
  const v = expectStatus(await anon().get(`/api/vacancies/${slug}`), 200).body.vacancy as { positions: number; filled: number; free: number };
  return { positions: v.positions, filled: v.filled, free: v.free };
};

/** The client's in-app notifications of one type (newest first). */
export const notificationsOf = (userId: string, type: string) => prisma.notification.findMany({ where: { userId, type }, orderBy: { createdAt: 'desc' } });
