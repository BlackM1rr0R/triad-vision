#!/usr/bin/env node
// Issues a white-label licence key (owner side only — run it on YOUR machine, never on a server).
//
//   node deploy/whitelabel/issue-license.mjs --key license-private.pem \
//     --customer "Acme Visa GmbH" --domain acme-visa.de --plan pro --expires 2027-12-31
//
// Options
//   --key <file>          Ed25519 private key (PEM). Never commit it, never copy it to a server.
//   --customer <name>     agency name (shown in the customer's System → License page)
//   --domain <domain>     site domain the key is bound to (www. is accepted too; "*.example.com" or "*")
//   --plan <name>         starter | pro | enterprise (presets below) or any name together with --modules / --staff
//   --expires <date>      YYYY-MM-DD (end of that day, UTC) — monthly subscription: e.g. one month + a few days
//   --modules <list>      comma-separated module keys, or "*" for all (overrides the plan preset)
//   --staff <n|unlimited> active staff accounts allowed (overrides the plan preset)
//   --id <id>             licence id (default: random)
//   --json                print the payload as well
//
// Other commands
//   --verify <token>      check a token against the public key compiled into the app (server/src/lib/license)
//   --keygen <dir>        new key pair: <dir>/license-private.pem + license-public.pem (then put the public key into
//                         server/src/lib/license/index.ts → LICENSE_PUBLIC_KEY_PEM and re-issue every customer key)
//
// The token format is the one server/src/lib/license/index.ts verifies:
//   TV1.<base64url(payload JSON)>.<base64url(Ed25519 signature of "TV1.<payload part>")>
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const flag = (name) => args.includes(`--${name}`);
const die = (msg) => {
  console.error(`issue-license: ${msg}`);
  process.exit(1);
};

/** Module keys straight from the server source, so the CLI never drifts from MODULE_KEYS. */
const moduleKeys = () => {
  const src = fs.readFileSync(path.join(repo, 'server/src/lib/navModules.ts'), 'utf8');
  const block = /export const MODULE_KEYS = \[([\s\S]*?)\] as const/.exec(src)?.[1];
  if (!block) die('could not read MODULE_KEYS from server/src/lib/navModules.ts');
  return [...block.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1]);
};

const publicKeyFromSource = () => {
  const src = fs.readFileSync(path.join(repo, 'server/src/lib/license/index.ts'), 'utf8');
  const pem = /LICENSE_PUBLIC_KEY_PEM = `([\s\S]*?)`/.exec(src)?.[1];
  if (!pem) die('could not read LICENSE_PUBLIC_KEY_PEM from server/src/lib/license/index.ts');
  return pem.replace(/\r\n/g, '\n'); // Windows checkouts have CRLF
};

const PLANS = {
  // Core case management for a small agency: the optional growth / marketing modules stay off.
  starter: { staff: 3, modules: ['bookings', 'reviews', 'knowledgeBase', 'guides', 'journey', 'checkIns', 'translations', 'surveys', 'announcements', 'examDates', 'interviewPrep', 'quotes'] },
  pro: { staff: 10, modules: '*' },
  enterprise: { staff: null, modules: '*' },
};

if (opt('keygen') !== undefined) {
  const dir = path.resolve(opt('keygen'));
  fs.mkdirSync(dir, { recursive: true });
  const priv = path.join(dir, 'license-private.pem');
  if (fs.existsSync(priv)) die(`${priv} exists — refusing to overwrite a private key`);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(priv, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(path.join(dir, 'license-public.pem'), publicKey.export({ type: 'spki', format: 'pem' }));
  console.log(`private key: ${priv} (keep it secret and backed up)`);
  console.log(`public key (put into server/src/lib/license/index.ts):\n${publicKey.export({ type: 'spki', format: 'pem' })}`);
  process.exit(0);
}

if (opt('verify') !== undefined) {
  const token = opt('verify').trim();
  const [prefix, body, sig] = token.split('.');
  if (prefix !== 'TV1' || !body || !sig) die('not a TV1 token');
  const ok = crypto.verify(null, Buffer.from(`${prefix}.${body}`, 'utf8'), publicKeyFromSource(), Buffer.from(sig, 'base64url'));
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  console.log(JSON.stringify({ signatureValid: ok, ...payload }, null, 2));
  process.exit(ok ? 0 : 2);
}

const keyFile = opt('key');
const customer = opt('customer');
const domain = opt('domain')?.trim().toLowerCase();
const planName = opt('plan') ?? 'pro';
const expires = opt('expires');
if (!keyFile || !customer || !domain || !expires) die('missing --key, --customer, --domain or --expires (see the header of this file)');
if (!/^\d{4}-\d{2}-\d{2}$/.test(expires)) die('--expires must be YYYY-MM-DD');
if (!/^(\*|(\*\.)?[a-z0-9.-]+\.[a-z]{2,}|localhost)$/.test(domain)) die('--domain looks wrong');

const preset = PLANS[planName] ?? { staff: null, modules: '*' };
const known = moduleKeys();
let modules = preset.modules;
if (opt('modules') !== undefined) {
  const raw = opt('modules').trim();
  modules = raw === '*' ? '*' : raw.split(',').map((s) => s.trim()).filter(Boolean);
}
if (modules !== '*') {
  const unknown = modules.filter((m) => !known.includes(m));
  if (unknown.length) die(`unknown module(s): ${unknown.join(', ')} — known: ${known.join(', ')}`);
}
let staffLimit = preset.staff;
if (opt('staff') !== undefined) {
  const raw = opt('staff');
  staffLimit = raw === 'unlimited' ? null : Number(raw);
  if (staffLimit !== null && (!Number.isInteger(staffLimit) || staffLimit < 1)) die('--staff must be a positive integer or "unlimited"');
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(path.resolve(keyFile)));
if (privateKey.asymmetricKeyType !== 'ed25519') die('the key is not an Ed25519 private key');
// The matching public key must be the one compiled into the app, or no instance would accept the token.
const derived = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'pem' }).toString().trim();
if (derived !== publicKeyFromSource().trim()) die('this private key does not belong to the public key in server/src/lib/license/index.ts');

const payload = {
  v: 1,
  id: opt('id') ?? `lic-${crypto.randomBytes(6).toString('hex')}`,
  customer,
  domain,
  plan: planName,
  modules,
  staffLimit,
  issuedAt: new Date().toISOString(),
  expiresAt: new Date(`${expires}T23:59:59.000Z`).toISOString(),
};
const body = `TV1.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`;
const token = `${body}.${crypto.sign(null, Buffer.from(body, 'utf8'), privateKey).toString('base64url')}`;

if (flag('json')) console.error(JSON.stringify(payload, null, 2));
console.log(token);
