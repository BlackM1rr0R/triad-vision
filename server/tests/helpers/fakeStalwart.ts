import http from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * In-process stand-in for Stalwart v0.16's JMAP management API: GET /jmap/session and POST /jmap
 * with the x:Domain / x:Account / x:AccountPassword / VacationResponse / x:AllowedIp / x:Action methods our client uses.
 * Mirrors the real server's shapes and error types (verified against v0.16.24).
 */

interface Account {
  id: string;
  type: 'User' | 'Group';
  name: string;
  domainId: string;
  description: string | null;
  secret: string;
  admin: boolean;
  quotas: Record<string, number>;
  aliases: Record<string, { name: string; domainId: string; enabled: boolean; description?: string | null }>;
  usedDiskQuota: number;
  createdAt: string;
  vacation: { isEnabled: boolean; subject: string | null; textBody: string | null; htmlBody: string | null; fromDate: string | null; toDate: string | null };
}

export interface FakeStalwart {
  url: string;
  domains: Record<string, string>;
  accounts: Map<string, Account>;
  /** Method names of every call, in order (e.g. "x:Account/set"). */
  calls: { user: string; method: string; args: Record<string, unknown> }[];
  /** Milliseconds to wait before answering (timeout tests). */
  delayMs: number;
  /** Failed logins seen (wrong passwords). */
  failedLogins: number;
  /** The allow list (x:AllowedIp) and how often the IP lists were reloaded (x:Action ReloadBlockedIps). */
  allowedIps: Map<string, { id: string; address: string; reason: string | null }>;
  ipListReloads: number;
  addAccount: (a: { name: string; domain?: string; password: string; description?: string | null; admin?: boolean; type?: 'User' | 'Group'; usedDiskQuota?: number }) => Account;
  reset: () => void;
  close: () => Promise<void>;
}

const emptyVacation = () => ({ isEnabled: false, subject: null, textBody: null, htmlBody: null, fromDate: null, toDate: null });

export const startFakeStalwart = async (opts: { domain: string; adminUser: string; adminPassword: string }): Promise<FakeStalwart> => {
  let seq = 0;
  const nextId = () => (seq++).toString(36) + 'x';
  const domains: Record<string, string> = {};
  const accounts = new Map<string, Account>();
  const allowedIps: FakeStalwart['allowedIps'] = new Map();

  const domainIdOf = (name: string) => {
    const hit = Object.entries(domains).find(([, n]) => n === name);
    if (hit) return hit[0];
    const id = `d${Object.keys(domains).length}`;
    domains[id] = name;
    return id;
  };
  const addressOf = (a: Account) => `${a.name}@${domains[a.domainId]}`;
  const addAccount: FakeStalwart['addAccount'] = (a) => {
    const acc: Account = {
      id: nextId(),
      type: a.type ?? 'User',
      name: a.name,
      domainId: domainIdOf(a.domain ?? opts.domain),
      description: a.description ?? null,
      secret: a.password,
      admin: a.admin ?? false,
      quotas: {},
      aliases: {},
      usedDiskQuota: a.usedDiskQuota ?? 0,
      createdAt: '2026-10-01T10:00:00Z',
      vacation: emptyVacation(),
    };
    accounts.set(acc.id, acc);
    return acc;
  };

  const seed = () => {
    accounts.clear();
    for (const k of Object.keys(domains)) delete domains[k];
    seq = 0;
    domainIdOf(opts.domain);
    domainIdOf('other.test');
    const [local, dom] = opts.adminUser.split('@');
    addAccount({ name: local, domain: dom ?? opts.domain, password: opts.adminPassword, description: 'System administrator', admin: true });
  };
  seed();

  const fake: FakeStalwart = {
    url: '',
    domains,
    accounts,
    calls: [],
    delayMs: 0,
    failedLogins: 0,
    allowedIps,
    ipListReloads: 0,
    addAccount,
    reset: () => {
      seed();
      fake.calls.length = 0;
      fake.delayMs = 0;
      fake.failedLogins = 0;
      allowedIps.clear();
      fake.ipListReloads = 0;
    },
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      }),
  };

  const authenticate = (req: http.IncomingMessage): Account | null => {
    const h = req.headers.authorization ?? '';
    if (!h.startsWith('Basic ')) return null;
    const raw = Buffer.from(h.slice(6), 'base64').toString('utf8');
    const i = raw.indexOf(':');
    const user = raw.slice(0, i).toLowerCase();
    const pass = raw.slice(i + 1);
    const acc = [...accounts.values()].find((a) => addressOf(a) === user);
    if (!acc || acc.secret !== pass) {
      fake.failedLogins++;
      return null;
    }
    return acc;
  };

  const view = (a: Account) => ({
    id: a.id,
    '@type': a.type,
    name: a.name,
    domainId: a.domainId,
    description: a.description,
    emailAddress: addressOf(a),
    usedDiskQuota: a.usedDiskQuota,
    quotas: a.quotas,
    aliases: a.aliases,
    credentials: { '0': { credentialId: 'a', secret: '****', '@type': 'Password' } },
    roles: { '@type': a.admin ? 'Admin' : 'User' },
    createdAt: a.createdAt,
  });

  const emailTaken = (name: string, domainId: string, exceptId?: string) =>
    [...accounts.values()].some((a) => a.id !== exceptId && ((a.name === name && a.domainId === domainId) || Object.values(a.aliases).some((x) => x.name === name && x.domainId === domainId)));

  const weak = (secret: unknown) => typeof secret !== 'string' || secret.length < 8;

  const handle = (me: Account, method: string, args: Record<string, unknown>, results: Map<string, Record<string, unknown>>): [string, Record<string, unknown>] => {
    const isAdmin = me.admin;
    const forbidden: [string, Record<string, unknown>] = ['error', { type: 'forbidden' }];
    switch (method) {
      case 'x:Domain/get':
        if (!isAdmin) return forbidden;
        return [method, { accountId: args.accountId, list: Object.entries(domains).map(([id, name]) => ({ id, name })), notFound: [] }];
      case 'x:Account/query': {
        if (!isAdmin) return forbidden;
        const f = (args.filter ?? {}) as { domainId?: string };
        return [method, { accountId: args.accountId, ids: [...accounts.values()].filter((a) => !f.domainId || a.domainId === f.domainId).map((a) => a.id) }];
      }
      case 'x:Account/get': {
        if (!isAdmin) return forbidden;
        let ids = args.ids as string[] | undefined;
        const ref = args['#ids'] as { resultOf: string } | undefined;
        if (ref) ids = (results.get(ref.resultOf)?.ids as string[]) ?? [];
        ids = ids ?? [...accounts.keys()];
        return [method, { accountId: args.accountId, list: ids.filter((id) => accounts.has(id)).map((id) => view(accounts.get(id)!)), notFound: ids.filter((id) => !accounts.has(id)) }];
      }
      case 'x:Account/set': {
        if (!isAdmin) return forbidden;
        const out: Record<string, unknown> = { accountId: args.accountId };
        const create = (args.create ?? {}) as Record<string, Record<string, unknown>>;
        for (const [key, c] of Object.entries(create)) {
          const name = String(c.name ?? '');
          const domainId = String(c.domainId ?? '');
          const secret = (c.credentials as Record<string, { secret?: string }> | undefined)?.['0']?.secret;
          if (!name || !domains[domainId]) {
            out.notCreated = { ...(out.notCreated as object), [key]: { type: 'invalidProperties', properties: ['name'] } };
          } else if (emailTaken(name, domainId)) {
            out.notCreated = { ...(out.notCreated as object), [key]: { type: 'primaryKeyViolation', properties: ['email'] } };
          } else if (weak(secret)) {
            out.notCreated = { ...(out.notCreated as object), [key]: { type: 'invalidProperties', description: 'Password must be at least 8 characters long.', properties: ['secret'] } };
          } else {
            const acc = addAccount({ name, domain: domains[domainId], password: secret!, description: (c.description as string | null) ?? null });
            acc.quotas = (c.quotas as Record<string, number>) ?? {};
            acc.aliases = (c.aliases as Account['aliases']) ?? {};
            out.created = { ...(out.created as object), [key]: { id: acc.id } };
          }
        }
        const update = (args.update ?? {}) as Record<string, Record<string, unknown>>;
        for (const [id, patch] of Object.entries(update)) {
          const acc = accounts.get(id);
          if (!acc) {
            out.notUpdated = { ...(out.notUpdated as object), [id]: { type: 'notFound' } };
            continue;
          }
          let error: Record<string, unknown> | null = null;
          for (const [k, v] of Object.entries(patch)) {
            if (k === 'description') acc.description = v as string | null;
            else if (k === 'quotas/maxDiskQuota') {
              if (v === null) delete acc.quotas.maxDiskQuota;
              else acc.quotas.maxDiskQuota = v as number;
            } else if (k === 'aliases') {
              const next = v as Account['aliases'];
              const clash = Object.values(next).find((x) => emailTaken(x.name, x.domainId, acc.id));
              if (clash) error = { type: 'primaryKeyViolation', properties: ['email'] };
              else acc.aliases = next;
            } else if (/^credentials\/\w+\/secret$/.test(k)) {
              if (weak(v)) error = { type: 'invalidProperties', description: 'Password must be at least 8 characters long.', properties: ['secret'] };
              else acc.secret = v as string;
            } else error = { type: 'invalidPatch', description: `unsupported ${k}` };
          }
          if (error) out.notUpdated = { ...(out.notUpdated as object), [id]: error };
          else out.updated = { ...(out.updated as object), [id]: null };
        }
        for (const id of (args.destroy as string[] | undefined) ?? []) {
          if (accounts.delete(id)) out.destroyed = [...((out.destroyed as string[]) ?? []), id];
          else out.notDestroyed = { ...(out.notDestroyed as object), [id]: { type: 'notFound' } };
        }
        return [method, out];
      }
      case 'x:AccountPassword/set': {
        if (args.accountId !== me.id) return forbidden;
        const s = ((args.update as Record<string, Record<string, string>>)?.singleton ?? {}) as { currentSecret?: string; secret?: string };
        if (s.currentSecret !== me.secret) return [method, { accountId: me.id, notUpdated: { singleton: { type: 'forbidden', description: 'Current secret is incorrect.' } } }];
        if (weak(s.secret)) return [method, { accountId: me.id, notUpdated: { singleton: { type: 'invalidProperties', description: 'Password must be at least 8 characters long.', properties: ['secret'] } } }];
        me.secret = s.secret!;
        return [method, { accountId: me.id, updated: { singleton: null } }];
      }
      case 'VacationResponse/get':
      case 'VacationResponse/set': {
        const acc = accounts.get(String(args.accountId));
        if (!acc) return ['error', { type: 'accountNotFound' }];
        if (!isAdmin && acc.id !== me.id) return forbidden;
        if (method === 'VacationResponse/get') return [method, { accountId: acc.id, list: [{ id: 'singleton', ...acc.vacation }], notFound: [] }];
        const u = ((args.update as Record<string, Record<string, unknown>>)?.singleton ?? {}) as Partial<Account['vacation']>;
        acc.vacation = { ...acc.vacation, ...u };
        return [method, { accountId: acc.id, updated: { singleton: null } }];
      }
      case 'x:AllowedIp/query':
        if (!isAdmin) return forbidden;
        return [method, { accountId: args.accountId, ids: [...allowedIps.keys()] }];
      case 'x:AllowedIp/get': {
        if (!isAdmin) return forbidden;
        const ref = args['#ids'] as { resultOf: string } | undefined;
        const ids = (ref ? (results.get(ref.resultOf)?.ids as string[]) : (args.ids as string[] | undefined)) ?? [...allowedIps.keys()];
        return [method, { accountId: args.accountId, list: ids.filter((id) => allowedIps.has(id)).map((id) => ({ ...allowedIps.get(id)!, createdAt: '2026-10-01T10:00:00Z', expiresAt: null })), notFound: ids.filter((id) => !allowedIps.has(id)) }];
      }
      case 'x:AllowedIp/set': {
        if (!isAdmin) return forbidden;
        const out: Record<string, unknown> = { accountId: args.accountId };
        for (const [key, v] of Object.entries((args.create ?? {}) as Record<string, { address?: string; reason?: string }>)) {
          if ([...allowedIps.values()].some((a) => a.address === v.address)) {
            out.notCreated = { ...(out.notCreated as object), [key]: { type: 'primaryKeyViolation' } };
            continue;
          }
          const id = nextId();
          allowedIps.set(id, { id, address: String(v.address), reason: v.reason ?? null });
          out.created = { ...(out.created as object), [key]: { id } };
        }
        for (const id of (args.destroy as string[] | undefined) ?? []) {
          if (allowedIps.delete(id)) out.destroyed = [...((out.destroyed as string[]) ?? []), id];
          else out.notDestroyed = { ...(out.notDestroyed as object), [id]: { type: 'notFound' } };
        }
        return [method, out];
      }
      case 'x:Action/set': {
        if (!isAdmin) return forbidden;
        const created: Record<string, { id: string }> = {};
        for (const [key, v] of Object.entries((args.create ?? {}) as Record<string, { '@type'?: string }>)) {
          if (v['@type'] === 'ReloadBlockedIps') fake.ipListReloads++;
          created[key] = { id: nextId() };
        }
        return [method, { accountId: args.accountId, created }];
      }
      default:
        return ['error', { type: 'unknownMethod', description: method }];
    }
  };

  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      const reply = (status: number, body?: unknown) => {
        if (res.destroyed) return;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(body === undefined ? '' : JSON.stringify(body));
      };
      const run = () => {
        const me = authenticate(req);
        if (!me) return reply(401, { type: 'about:blank', status: 401, title: 'Unauthorized' });
        if (req.method === 'GET' && req.url === '/jmap/session') {
          return reply(200, { username: addressOf(me), accounts: { [me.id]: { name: addressOf(me) } }, primaryAccounts: { 'urn:stalwart:jmap': me.id } });
        }
        if (req.method === 'POST' && req.url === '/jmap') {
          let body: { methodCalls?: [string, Record<string, unknown>, string][] };
          try {
            body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            return reply(400, { type: 'urn:ietf:params:jmap:error:notJSON' });
          }
          const results = new Map<string, Record<string, unknown>>();
          const methodResponses = (body.methodCalls ?? []).map(([method, args, id]) => {
            fake.calls.push({ user: addressOf(me), method, args });
            const [name, out] = handle(me, method, args, results);
            results.set(id, out);
            return [name, out, id];
          });
          return reply(200, { methodResponses, sessionState: 's1' });
        }
        reply(404, {});
      };
      if (fake.delayMs) setTimeout(run, fake.delayMs);
      else run();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return fake;
};
