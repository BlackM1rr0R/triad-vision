/**
 * Connection to our own Stalwart mail server (management = JMAP with the urn:stalwart:jmap
 * capability). Read from the environment on every call, so tests can point it at a fake server
 * and a deployment without the variables simply reports `configured: false`.
 *
 *   STALWART_URL             base URL of the HTTP listener (default http://mail:8080, the docker service)
 *   STALWART_ADMIN_USER      Stalwart administrator login (e.g. admin@triad-vision.de)
 *   STALWART_ADMIN_PASSWORD  its password
 *   STALWART_DOMAIN          the domain whose mailboxes are managed (default triad-vision.de)
 *   STALWART_MAIL_HOST       public IMAP/SMTP host shown to users and used to match workspace accounts
 *   STALWART_TIMEOUT_MS      per-request timeout (default 10000)
 */
export interface StalwartConfig {
  url: string;
  adminUser: string;
  adminPassword: string;
  domain: string;
  mailHost: string;
  timeoutMs: number;
}

const env = (name: string) => (process.env[name] ?? '').trim();

export const stalwartDomain = () => (env('STALWART_DOMAIN') || 'triad-vision.de').toLowerCase();
export const stalwartMailHost = () => (env('STALWART_MAIL_HOST') || 'mail.triad-vision.de').toLowerCase();

/** null when the admin credentials are missing (dev, tests, not yet wired in production). */
export const stalwartConfig = (): StalwartConfig | null => {
  const adminUser = env('STALWART_ADMIN_USER');
  const adminPassword = process.env.STALWART_ADMIN_PASSWORD ?? '';
  if (!adminUser || !adminPassword) return null;
  const timeout = Number(env('STALWART_TIMEOUT_MS') || 10_000);
  return {
    url: (env('STALWART_URL') || 'http://mail:8080').replace(/\/+$/, ''),
    adminUser,
    adminPassword,
    domain: stalwartDomain(),
    mailHost: stalwartMailHost(),
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10_000,
  };
};

/** Client settings shown next to a mailbox (same for every mailbox of the domain). */
export const clientSettings = () => {
  const host = stalwartMailHost();
  return {
    imap: { host, port: 993, security: 'SSL/TLS' },
    smtp: { host, port: 465, security: 'SSL/TLS' },
  };
};
