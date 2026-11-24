import { promises as dnsp } from 'node:dns';

/**
 * Read-only SPF / DKIM / DMARC check of our sending domain (Admin → E-poçt göndərişi). Plain DNS TXT lookups, no
 * external service. The evaluators are pure (unit-tested); `checkSendingDomain` does the lookups with a timeout.
 */

export type CheckStatus = 'OK' | 'WARN' | 'MISSING' | 'ERROR';

export interface RecordCheck {
  status: CheckStatus;
  records: string[];
  /** Warning codes for the client texts. */
  warnings: string[];
}

export const evaluateSpf = (txt: string[]): RecordCheck => {
  const records = txt.filter((t) => /^v=spf1(\s|$)/i.test(t.trim()));
  if (!records.length) return { status: 'MISSING', records, warnings: ['SPF_MISSING'] };
  if (records.length > 1) return { status: 'ERROR', records, warnings: ['SPF_MULTIPLE'] };
  const r = records[0]!.toLowerCase();
  const warnings: string[] = [];
  if (/\s\+all\b/.test(r) || /\sall\b/.test(r.replace(/[-~?]all\b/g, ''))) warnings.push('SPF_PASS_ALL');
  else if (/\?all\b/.test(r)) warnings.push('SPF_NEUTRAL');
  else if (!/[-~]all\b/.test(r) && !/\bredirect=/.test(r)) warnings.push('SPF_NO_ALL');
  const lookups = (r.match(/\b(include:|a\b|a:|mx\b|mx:|ptr|exists:|redirect=)/g) ?? []).length;
  if (lookups > 10) warnings.push('SPF_TOO_MANY_LOOKUPS');
  return { status: warnings.some((w) => w === 'SPF_PASS_ALL') ? 'ERROR' : warnings.length ? 'WARN' : 'OK', records, warnings };
};

export const evaluateDmarc = (txt: string[]): RecordCheck & { policy: string | null } => {
  const records = txt.filter((t) => /^v=dmarc1\s*;/i.test(t.trim()));
  if (!records.length) return { status: 'MISSING', records, warnings: ['DMARC_MISSING'], policy: null };
  if (records.length > 1) return { status: 'ERROR', records, warnings: ['DMARC_MULTIPLE'], policy: null };
  const tags = new Map(
    records[0]!
      .split(';')
      .map((p) => p.trim().split('='))
      .filter((kv) => kv.length === 2)
      .map(([k, v]) => [k!.trim().toLowerCase(), v!.trim().toLowerCase()] as const),
  );
  const policy = tags.get('p') ?? null;
  const warnings: string[] = [];
  if (!policy || !['none', 'quarantine', 'reject'].includes(policy)) return { status: 'ERROR', records, warnings: ['DMARC_INVALID'], policy };
  if (policy === 'none') warnings.push('DMARC_POLICY_NONE');
  if (!tags.get('rua')) warnings.push('DMARC_NO_RUA');
  const pct = Number(tags.get('pct') ?? '100');
  if (Number.isFinite(pct) && pct < 100) warnings.push('DMARC_PARTIAL');
  return { status: warnings.includes('DMARC_POLICY_NONE') ? 'WARN' : warnings.length ? 'WARN' : 'OK', records, warnings, policy };
};

export const evaluateDkim = (found: { selector: string; records: string[] }[]): RecordCheck & { selectors: string[] } => {
  const ok = found.filter((f) => f.records.some((r) => /(^|;)\s*(v=dkim1|k=|p=)/i.test(r) && !/(^|;)\s*p=\s*(;|$)/i.test(r)));
  if (!ok.length) return { status: 'MISSING', records: [], warnings: ['DKIM_NOT_FOUND'], selectors: [] };
  return { status: 'OK', records: ok.flatMap((f) => f.records.map((r) => (r.length > 120 ? `${r.slice(0, 117)}…` : r))), warnings: [], selectors: ok.map((f) => f.selector) };
};

/** Common selectors; DKIM_SELECTORS (comma-separated) in the environment adds the real ones. */
export const DEFAULT_DKIM_SELECTORS = ['default', 'mail', 'dkim', 's1', 's2', 'selector1', 'selector2', 'k1', 'google', 'stalwart', 'rsa', 'ed25519'];

const withTimeout = <T>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('DNS_TIMEOUT')), ms))]);

const txtOf = async (name: string): Promise<string[] | 'ERROR'> => {
  try {
    const rows = await withTimeout(dnsp.resolveTxt(name), 4000);
    return rows.map((chunks) => chunks.join(''));
  } catch (err) {
    const code = (err as { code?: string }).code;
    return code === 'ENOTFOUND' || code === 'ENODATA' ? [] : 'ERROR';
  }
};

export interface DomainCheck {
  domain: string;
  spf: RecordCheck;
  dmarc: RecordCheck & { policy: string | null };
  dkim: RecordCheck & { selectors: string[] };
  mx: string[];
  checkedAt: string;
}

const VALID_DOMAIN = /^(?=.{3,190}$)([a-z0-9-]+\.)+[a-z]{2,}$/;

export const checkSendingDomain = async (domain: string, extraSelectors: string[] = []): Promise<DomainCheck> => {
  const d = domain.trim().toLowerCase();
  if (!VALID_DOMAIN.test(d)) throw new Error('INVALID_DOMAIN');
  const selectors = Array.from(new Set([...extraSelectors.map((s) => s.trim()).filter((s) => /^[a-z0-9._-]{1,63}$/i.test(s)), ...DEFAULT_DKIM_SELECTORS])).slice(0, 20);
  const [root, dmarc, mx, ...dkim] = await Promise.all([
    txtOf(d),
    txtOf(`_dmarc.${d}`),
    withTimeout(dnsp.resolveMx(d), 4000).then(
      (rows) => rows.sort((a, b) => a.priority - b.priority).map((r) => r.exchange),
      () => [] as string[],
    ),
    ...selectors.map((s) => txtOf(`${s}._domainkey.${d}`)),
  ]);
  const err = (r: RecordCheck): RecordCheck => r;
  return {
    domain: d,
    spf: root === 'ERROR' ? err({ status: 'ERROR', records: [], warnings: ['DNS_ERROR'] }) : evaluateSpf(root),
    dmarc: dmarc === 'ERROR' ? { status: 'ERROR', records: [], warnings: ['DNS_ERROR'], policy: null } : evaluateDmarc(dmarc),
    dkim: evaluateDkim(selectors.map((selector, i) => ({ selector, records: dkim[i] === 'ERROR' ? [] : (dkim[i] as string[]) }))),
    mx: mx as string[],
    checkedAt: new Date().toISOString(),
  };
};
