import type { StalwartConfig } from './config.js';

/**
 * Minimal Stalwart v0.16 management client. Stalwart exposes its management API as JMAP:
 *
 *   GET  {url}/jmap/session   (Basic auth)  → accounts / primaryAccounts['urn:stalwart:jmap']
 *   POST {url}/jmap           (Basic auth)  → { using, methodCalls } with
 *        x:Domain/get, x:Account/query, x:Account/get, x:Account/set     (admin, capability urn:stalwart:jmap)
 *        VacationResponse/get|set  with accountId = the mailbox's account id (an admin may address any account)
 *        x:AccountPassword/set     as the mailbox user itself (self-service; Stalwart checks currentSecret)
 *
 * These are the same calls `stalwart-cli` makes (`--debug` shows /api/schema, /jmap/session, POST /jmap).
 * Errors are mapped to StalwartError codes; credentials, request bodies and secrets never appear in
 * error messages (Stalwart only echoes field names and short descriptions).
 */

export type StalwartErrorCode =
  | 'MAIL_SERVER_UNREACHABLE'
  | 'MAIL_SERVER_TIMEOUT'
  | 'MAIL_SERVER_AUTH'
  | 'MAIL_SERVER_ERROR'
  | 'MAIL_DOMAIN_MISSING'
  | 'MAILBOX_NOT_FOUND'
  | 'MAILBOX_EXISTS'
  | 'MAILBOX_INVALID'
  | 'MAILBOX_PASSWORD_WRONG';

export class StalwartError extends Error {
  constructor(
    public code: StalwartErrorCode,
    /** Short, secret-free explanation from Stalwart (e.g. "Password must be at least 8 characters long."). */
    public detail?: string,
  ) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'StalwartError';
  }
}

interface Creds {
  user: string;
  password: string;
}

const CORE = 'urn:ietf:params:jmap:core';
const STALWART = 'urn:stalwart:jmap';
const VACATION = 'urn:ietf:params:jmap:vacationresponse';

type MethodCall = [string, Record<string, unknown>, string];
type MethodResponse = [string, Record<string, unknown>, string];

const clip = (s: unknown, n = 200) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : undefined);

const basic = (c: Creds) => `Basic ${Buffer.from(`${c.user}:${c.password}`, 'utf8').toString('base64')}`;

const send = async (cfg: StalwartConfig, creds: Creds, path: string, body?: unknown): Promise<unknown> => {
  let res: Response;
  try {
    res = await fetch(`${cfg.url}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: basic(creds), Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(cfg.timeoutMs),
      redirect: 'follow',
    });
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') throw new StalwartError('MAIL_SERVER_TIMEOUT');
    throw new StalwartError('MAIL_SERVER_UNREACHABLE');
  }
  if (res.status === 401 || res.status === 403) {
    await res.body?.cancel().catch(() => undefined);
    throw new StalwartError('MAIL_SERVER_AUTH');
  }
  if (!res.ok) {
    await res.body?.cancel().catch(() => undefined);
    throw new StalwartError('MAIL_SERVER_ERROR', `HTTP ${res.status}`);
  }
  try {
    return await res.json();
  } catch {
    throw new StalwartError('MAIL_SERVER_ERROR', 'invalid JSON');
  }
};

/** The JMAP account id to use for management calls (the admin's own account). */
const sessionAccountId = async (cfg: StalwartConfig, creds: Creds) => {
  const s = (await send(cfg, creds, '/jmap/session')) as { primaryAccounts?: Record<string, string>; accounts?: Record<string, unknown> };
  const id = s?.primaryAccounts?.[STALWART] ?? Object.keys(s?.accounts ?? {})[0];
  if (!id) throw new StalwartError('MAIL_SERVER_ERROR', 'no JMAP account in session');
  return id;
};

const adminIds = new Map<string, string>();
const adminCreds = (cfg: StalwartConfig): Creds => ({ user: cfg.adminUser, password: cfg.adminPassword });
const cacheKey = (cfg: StalwartConfig) => `${cfg.url}|${cfg.adminUser}`;

const adminAccountId = async (cfg: StalwartConfig) => {
  const key = cacheKey(cfg);
  const hit = adminIds.get(key);
  if (hit) return hit;
  const id = await sessionAccountId(cfg, adminCreds(cfg));
  adminIds.set(key, id);
  return id;
};

const call = async (cfg: StalwartConfig, creds: Creds, using: string[], calls: MethodCall[]) => {
  const out = (await send(cfg, creds, '/jmap', { using, methodCalls: calls })) as { methodResponses?: MethodResponse[] };
  const responses = out?.methodResponses;
  if (!Array.isArray(responses)) throw new StalwartError('MAIL_SERVER_ERROR', 'no methodResponses');
  for (const r of responses) {
    if (r[0] === 'error') {
      const type = clip(r[1]?.type, 60);
      if (type === 'accountNotFound') throw new StalwartError('MAILBOX_NOT_FOUND');
      if (type === 'forbidden' || type === 'accountNotSupportedByMethod') throw new StalwartError('MAIL_SERVER_AUTH', type);
      throw new StalwartError('MAIL_SERVER_ERROR', [type, clip(r[1]?.description)].filter(Boolean).join(': '));
    }
  }
  return responses;
};

const adminCall = async (cfg: StalwartConfig, using: string[], build: (accountId: string) => MethodCall[]) => {
  try {
    return await call(cfg, adminCreds(cfg), using, build(await adminAccountId(cfg)));
  } catch (err) {
    // A changed admin password or a recreated admin account: forget the cached id.
    if (err instanceof StalwartError && err.code === 'MAIL_SERVER_AUTH') adminIds.delete(cacheKey(cfg));
    throw err;
  }
};

const response = (responses: MethodResponse[], callId: string) => {
  const r = responses.find((x) => x[2] === callId);
  if (!r) throw new StalwartError('MAIL_SERVER_ERROR', `missing response ${callId}`);
  return r[1];
};

/** Throws the mapped error of the first item in notCreated / notUpdated / notDestroyed. */
const checkSet = (res: Record<string, unknown>) => {
  for (const k of ['notCreated', 'notUpdated', 'notDestroyed']) {
    const failures = res[k] as Record<string, { type?: string; description?: string; properties?: string[] }> | null | undefined;
    const first = failures ? Object.values(failures)[0] : undefined;
    if (!first) continue;
    const detail = clip(first.description) ?? (first.properties?.length ? `invalid: ${first.properties.join(', ')}` : undefined);
    switch (first.type) {
      case 'primaryKeyViolation':
        throw new StalwartError('MAILBOX_EXISTS', detail);
      case 'notFound':
        throw new StalwartError('MAILBOX_NOT_FOUND');
      case 'invalidProperties':
      case 'invalidPatch':
        throw new StalwartError('MAILBOX_INVALID', detail);
      case 'forbidden':
        throw new StalwartError('MAIL_SERVER_AUTH', detail);
      default:
        throw new StalwartError('MAIL_SERVER_ERROR', [clip(first.type, 60), detail].filter(Boolean).join(': '));
    }
  }
};

// ─── Domains ─────────────────────────────────────────────────────────

interface RawDomain {
  id: string;
  name: string;
}

const domainCache = new Map<string, { at: number; domains: RawDomain[] }>();
const DOMAIN_TTL = 5 * 60 * 1000;

export const listDomains = async (cfg: StalwartConfig): Promise<RawDomain[]> => {
  const key = cacheKey(cfg);
  const hit = domainCache.get(key);
  if (hit && Date.now() - hit.at < DOMAIN_TTL) return hit.domains;
  const r = await adminCall(cfg, [CORE, STALWART], (accountId) => [['x:Domain/get', { accountId, properties: ['name'] }, 'd']]);
  const list = ((response(r, 'd').list as RawDomain[] | undefined) ?? []).map((d) => ({ id: String(d.id), name: String(d.name ?? '').toLowerCase() }));
  domainCache.set(key, { at: Date.now(), domains: list });
  return list;
};

const ourDomainId = async (cfg: StalwartConfig) => {
  let d = (await listDomains(cfg)).find((x) => x.name === cfg.domain);
  if (!d) {
    domainCache.delete(cacheKey(cfg));
    d = (await listDomains(cfg)).find((x) => x.name === cfg.domain);
  }
  if (!d) throw new StalwartError('MAIL_DOMAIN_MISSING', cfg.domain);
  return d.id;
};

// ─── Accounts ────────────────────────────────────────────────────────

interface RawAlias {
  name?: string;
  domainId?: string;
  enabled?: boolean;
  description?: string | null;
}

interface RawAccount {
  id: string;
  '@type'?: string;
  name?: string;
  domainId?: string;
  description?: string | null;
  emailAddress?: string;
  usedDiskQuota?: number;
  quotas?: Record<string, number>;
  aliases?: Record<string, RawAlias>;
  credentials?: Record<string, { '@type'?: string }>;
  roles?: { '@type'?: string };
  createdAt?: string;
}

export interface Mailbox {
  id: string;
  address: string;
  localPart: string;
  displayName: string | null;
  usedBytes: number;
  /** null = no disk quota (unlimited). */
  quotaBytes: number | null;
  createdAt: string | null;
  /** Full addresses (enabled and disabled). */
  aliases: string[];
  /** Stalwart administrator role. */
  isAdmin: boolean;
}

const ACCOUNT_PROPS = ['name', 'domainId', 'description', 'emailAddress', 'usedDiskQuota', 'quotas', 'aliases', 'credentials', 'roles', 'createdAt'];

const toMailbox = (a: RawAccount, domains: RawDomain[], domain: string): Mailbox => {
  const localPart = String(a.name ?? '').toLowerCase();
  const domainName = (id?: string) => domains.find((d) => d.id === id)?.name ?? domain;
  const quota = a.quotas?.maxDiskQuota;
  return {
    id: String(a.id),
    address: (a.emailAddress ?? `${localPart}@${domainName(a.domainId)}`).toLowerCase(),
    localPart,
    displayName: a.description ?? null,
    usedBytes: Number(a.usedDiskQuota ?? 0),
    quotaBytes: typeof quota === 'number' && quota > 0 ? quota : null,
    createdAt: a.createdAt ?? null,
    aliases: Object.values(a.aliases ?? {})
      .filter((x) => x?.name)
      .map((x) => `${String(x.name).toLowerCase()}@${domainName(x.domainId)}`),
    isAdmin: a.roles?.['@type'] === 'Admin',
  };
};

const isOurs = (a: RawAccount, domainId: string) => (a['@type'] ?? 'User') === 'User' && String(a.domainId) === domainId;

const getRaw = async (cfg: StalwartConfig, id: string): Promise<RawAccount | null> => {
  const r = await adminCall(cfg, [CORE, STALWART], (accountId) => [['x:Account/get', { accountId, ids: [id], properties: ACCOUNT_PROPS }, 'g']]);
  const list = (response(r, 'g').list as RawAccount[] | undefined) ?? [];
  return list.find((a) => String(a.id) === id) ?? null;
};

/** Every user mailbox of the configured domain, sorted by address. */
export const listMailboxes = async (cfg: StalwartConfig): Promise<Mailbox[]> => {
  const domainId = await ourDomainId(cfg);
  const r = await adminCall(cfg, [CORE, STALWART], (accountId) => [
    ['x:Account/query', { accountId, filter: { domainId }, limit: 500 }, 'q'],
    ['x:Account/get', { accountId, '#ids': { resultOf: 'q', name: 'x:Account/query', path: '/ids' }, properties: ACCOUNT_PROPS }, 'g'],
  ]);
  const domains = await listDomains(cfg);
  return ((response(r, 'g').list as RawAccount[] | undefined) ?? [])
    .filter((a) => isOurs(a, domainId))
    .map((a) => toMailbox(a, domains, cfg.domain))
    .sort((a, b) => a.address.localeCompare(b.address));
};

/** One mailbox of our domain, or null (unknown id, another domain, a group). */
export const getMailbox = async (cfg: StalwartConfig, id: string): Promise<Mailbox | null> => {
  const domainId = await ourDomainId(cfg);
  const raw = await getRaw(cfg, id);
  if (!raw || !isOurs(raw, domainId)) return null;
  return toMailbox(raw, await listDomains(cfg), cfg.domain);
};

export const findMailboxByAddress = async (cfg: StalwartConfig, address: string) => {
  const a = address.trim().toLowerCase();
  return (await listMailboxes(cfg)).find((m) => m.address === a) ?? null;
};

const aliasMap = (localParts: string[], domainId: string, keep: RawAlias[] = []) => {
  const out: Record<string, RawAlias> = {};
  [...keep, ...localParts.map((name): RawAlias => ({ name, domainId, enabled: true }))].forEach((a, i) => {
    out[String(i)] = { name: a.name, domainId: a.domainId, enabled: a.enabled ?? true, ...(a.description ? { description: a.description } : {}) };
  });
  return out;
};

export interface CreateMailboxInput {
  localPart: string;
  displayName: string | null;
  password: string;
  quotaBytes: number | null;
  aliases: string[];
}

export const createMailbox = async (cfg: StalwartConfig, input: CreateMailboxInput): Promise<Mailbox> => {
  const domainId = await ourDomainId(cfg);
  const r = await adminCall(cfg, [CORE, STALWART], (accountId) => [
    [
      'x:Account/set',
      {
        accountId,
        create: {
          n: {
            '@type': 'User',
            name: input.localPart,
            domainId,
            description: input.displayName,
            credentials: { '0': { '@type': 'Password', secret: input.password } },
            quotas: input.quotaBytes ? { maxDiskQuota: input.quotaBytes } : {},
            aliases: aliasMap(input.aliases, domainId),
          },
        },
      },
      's',
    ],
  ]);
  const res = response(r, 's');
  checkSet(res);
  const id = (res.created as Record<string, { id?: string }> | undefined)?.n?.id;
  if (!id) throw new StalwartError('MAIL_SERVER_ERROR', 'account not created');
  const m = await getMailbox(cfg, String(id));
  if (!m) throw new StalwartError('MAIL_SERVER_ERROR', 'created account not readable');
  return m;
};

export interface UpdateMailboxInput {
  displayName?: string | null;
  /** null removes the disk quota. */
  quotaBytes?: number | null;
  /** Local parts in our domain; aliases in other domains are kept as they are. */
  aliases?: string[];
}

export const updateMailbox = async (cfg: StalwartConfig, id: string, input: UpdateMailboxInput): Promise<Mailbox> => {
  const domainId = await ourDomainId(cfg);
  const patch: Record<string, unknown> = {};
  if (input.displayName !== undefined) patch.description = input.displayName;
  if (input.quotaBytes !== undefined) patch['quotas/maxDiskQuota'] = input.quotaBytes;
  if (input.aliases !== undefined) {
    const raw = await getRaw(cfg, id);
    if (!raw) throw new StalwartError('MAILBOX_NOT_FOUND');
    const foreign = Object.values(raw.aliases ?? {}).filter((a) => String(a.domainId) !== domainId);
    patch.aliases = aliasMap(input.aliases, domainId, foreign);
  }
  if (Object.keys(patch).length) {
    const r = await adminCall(cfg, [CORE, STALWART], (accountId) => [['x:Account/set', { accountId, update: { [id]: patch } }, 's']]);
    checkSet(response(r, 's'));
  }
  const m = await getMailbox(cfg, id);
  if (!m) throw new StalwartError('MAILBOX_NOT_FOUND');
  return m;
};

/** Replaces the account's password credential (app passwords and API keys are left alone). */
export const setMailboxPassword = async (cfg: StalwartConfig, id: string, password: string) => {
  const raw = await getRaw(cfg, id);
  if (!raw) throw new StalwartError('MAILBOX_NOT_FOUND');
  const creds = raw.credentials ?? {};
  const key = Object.keys(creds).find((k) => creds[k]?.['@type'] === 'Password');
  const patch = key !== undefined ? { [`credentials/${key}/secret`]: password } : { credentials: { ...creds, [String(Object.keys(creds).length)]: { '@type': 'Password', secret: password } } };
  const r = await adminCall(cfg, [CORE, STALWART], (accountId) => [['x:Account/set', { accountId, update: { [id]: patch } }, 's']]);
  checkSet(response(r, 's'));
};

/** Deletes the account and every message in it. */
export const deleteMailbox = async (cfg: StalwartConfig, id: string) => {
  const r = await adminCall(cfg, [CORE, STALWART], (accountId) => [['x:Account/set', { accountId, destroy: [id] }, 's']]);
  const res = response(r, 's');
  checkSet(res);
  const destroyed = (res.destroyed as string[] | undefined) ?? [];
  if (!destroyed.map(String).includes(id)) throw new StalwartError('MAIL_SERVER_ERROR', 'account not destroyed');
};

// ─── Auto-reply (JMAP VacationResponse) ─────────────────────────────

export interface AutoReply {
  enabled: boolean;
  subject: string | null;
  text: string | null;
  fromDate: string | null;
  toDate: string | null;
}

/** JMAP UTCDate: no fractional seconds. */
const utc = (iso: string | null) => (iso ? new Date(iso).toISOString().replace(/\.\d{3}Z$/, 'Z') : null);

/**
 * Stalwart lets an administrator call VacationResponse/get|set with any account id (verified on
 * v0.16.24), so no mailbox password is needed for this.
 */
export const getAutoReply = async (cfg: StalwartConfig, id: string): Promise<AutoReply> => {
  const r = await call(cfg, adminCreds(cfg), [CORE, VACATION], [['VacationResponse/get', { accountId: id, ids: ['singleton'] }, 'v']]);
  const v = ((response(r, 'v').list as Record<string, unknown>[] | undefined) ?? [])[0] ?? {};
  return {
    enabled: v.isEnabled === true,
    subject: (v.subject as string | null) ?? null,
    text: (v.textBody as string | null) ?? null,
    fromDate: (v.fromDate as string | null) ?? null,
    toDate: (v.toDate as string | null) ?? null,
  };
};

export const setAutoReply = async (cfg: StalwartConfig, id: string, v: AutoReply): Promise<AutoReply> => {
  const r = await call(cfg, adminCreds(cfg), [CORE, VACATION], [
    [
      'VacationResponse/set',
      { accountId: id, update: { singleton: { isEnabled: v.enabled, subject: v.subject, textBody: v.text, htmlBody: null, fromDate: utc(v.fromDate), toDate: utc(v.toDate) } } },
      'v',
    ],
  ]);
  checkSet(response(r, 'v'));
  return getAutoReply(cfg, id);
};

// ─── Self-service ────────────────────────────────────────────────────

/**
 * Changes a mailbox password as the mailbox user itself: logs in with the current password (a
 * wrong one → MAILBOX_PASSWORD_WRONG) and sets the new one through x:AccountPassword, where
 * Stalwart checks `currentSecret` again.
 */
export const changeOwnPassword = async (cfg: StalwartConfig, address: string, current: string, next: string) => {
  const creds = { user: address, password: current };
  let accountId: string;
  try {
    accountId = await sessionAccountId(cfg, creds);
  } catch (err) {
    if (err instanceof StalwartError && err.code === 'MAIL_SERVER_AUTH') throw new StalwartError('MAILBOX_PASSWORD_WRONG');
    throw err;
  }
  const r = await call(cfg, creds, [CORE, STALWART], [['x:AccountPassword/set', { accountId, update: { singleton: { currentSecret: current, secret: next } } }, 'p']]);
  try {
    checkSet(response(r, 'p'));
  } catch (err) {
    if (err instanceof StalwartError && err.code === 'MAIL_SERVER_AUTH') throw new StalwartError('MAILBOX_PASSWORD_WRONG');
    throw err;
  }
};

/** Test hook: forget cached session ids and domains. */
export const resetStalwartCaches = () => {
  adminIds.clear();
  domainCache.clear();
};
