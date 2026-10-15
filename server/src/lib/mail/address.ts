/**
 * E-mail address helpers (pure). Addresses are stored as { name, address } lists in the JSON
 * columns of MailMessage.
 */
export interface Address {
  name: string;
  address: string;
}

const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

export const isEmail = (s: string) => EMAIL_RE.test(s);

/** Lower-cases the domain only (the local part is case-sensitive by the RFC, in practice never). */
export const normalizeEmail = (s: string) => {
  const t = s.trim().replace(/^<|>$/g, '');
  const at = t.lastIndexOf('@');
  return at < 0 ? t.toLowerCase() : `${t.slice(0, at)}@${t.slice(at + 1).toLowerCase()}`;
};

/** Parses one address token: `Name <a@b>`, `"Name" <a@b>`, `a@b`, `<a@b>`. Returns null when there is no address. */
export const parseAddress = (raw: string): Address | null => {
  const s = raw.trim();
  if (!s) return null;
  const m = /^(.*?)\s*<([^<>]+)>\s*$/.exec(s);
  if (m) {
    const address = normalizeEmail(m[2]!);
    if (!isEmail(address)) return null;
    const name = m[1]!.trim().replace(/^"(.*)"$/, '$1').replace(/\\"/g, '"').trim();
    return { name, address };
  }
  const address = normalizeEmail(s);
  return isEmail(address) ? { name: '', address } : null;
};

/** Splits a comma/semicolon separated list, honouring quotes and angle brackets. */
export const parseAddressList = (raw: string): Address[] => {
  const out: Address[] = [];
  let cur = '';
  let quoted = false;
  let angle = false;
  for (const ch of raw) {
    if (ch === '"' && !angle) quoted = !quoted;
    else if (ch === '<' && !quoted) angle = true;
    else if (ch === '>' && !quoted) angle = false;
    if ((ch === ',' || ch === ';') && !quoted && !angle) {
      const a = parseAddress(cur);
      if (a) out.push(a);
      cur = '';
      continue;
    }
    cur += ch;
  }
  const last = parseAddress(cur);
  if (last) out.push(last);
  return out;
};

/** `Name <a@b>` for headers; names with specials are quoted. */
export const formatAddress = (a: Address) => {
  const name = (a.name ?? '').trim();
  if (!name) return a.address;
  const needsQuote = /[^\w\s.\-À-ɏЀ-ӿ]/.test(name);
  return `${needsQuote ? `"${name.replace(/"/g, '\\"')}"` : name} <${a.address}>`;
};

export const formatAddressList = (list: Address[]) => list.map(formatAddress).join(', ');

/** Display name of a correspondent: name, else the local part of the address. */
export const displayName = (a: Address | null | undefined) => {
  if (!a) return '';
  if (a.name?.trim()) return a.name.trim();
  return a.address.split('@')[0] ?? a.address;
};

/** Splits a display name into first/last for the address book (`"Aysel Mammadova"` → Aysel / Mammadova). */
export const splitName = (a: Address): { firstName: string; lastName: string | null } => {
  const name = (a.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) {
    const local = (a.address.split('@')[0] ?? '').replace(/[._-]+/g, ' ').trim();
    const parts = local.split(' ').filter(Boolean);
    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    return { firstName: parts.length ? cap(parts[0]!) : a.address, lastName: parts.length > 1 ? cap(parts.slice(1).join(' ')) : null };
  }
  // "Last, First" → First Last
  if (name.includes(',')) {
    const [last, first] = name.split(',').map((s) => s.trim());
    if (first) return { firstName: first, lastName: last || null };
  }
  const parts = name.split(' ');
  return { firstName: parts[0]!, lastName: parts.length > 1 ? parts.slice(1).join(' ') : null };
};

/** Address list from a mailparser AddressObject (or array of them). */
export const fromParsed = (
  obj: { value: { name: string; address?: string | undefined; group?: unknown }[] } | { value: { name: string; address?: string | undefined; group?: unknown }[] }[] | undefined,
): Address[] => {
  if (!obj) return [];
  const objs = Array.isArray(obj) ? obj : [obj];
  const out: Address[] = [];
  for (const o of objs) {
    for (const v of o.value ?? []) {
      if (v.address && isEmail(v.address)) out.push({ name: (v.name ?? '').trim(), address: normalizeEmail(v.address) });
      else if (Array.isArray(v.group)) {
        for (const g of v.group as { name: string; address?: string }[]) {
          if (g.address && isEmail(g.address)) out.push({ name: (g.name ?? '').trim(), address: normalizeEmail(g.address) });
        }
      }
    }
  }
  return out;
};

/** Validates and cleans a JSON address list coming from the database. */
export const asAddressList = (json: unknown): Address[] => {
  if (!Array.isArray(json)) return [];
  const out: Address[] = [];
  for (const v of json) {
    if (v && typeof v === 'object' && typeof (v as Address).address === 'string') {
      out.push({ name: String((v as Address).name ?? ''), address: (v as Address).address });
    }
  }
  return out;
};

/** Removes duplicates (by address, case-insensitive) and the given own addresses. */
export const dedupeAddresses = (list: Address[], exclude: string[] = []) => {
  const seen = new Set(exclude.map((e) => e.toLowerCase()));
  const out: Address[] = [];
  for (const a of list) {
    const k = a.address.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
};
