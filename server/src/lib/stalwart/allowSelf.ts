import { networkInterfaces } from 'node:os';
import { changeAllowedIps, listAllowedIps } from './client.js';
import { stalwartConfig, type StalwartConfig } from './config.js';

/**
 * Keeps this API container's own address on Stalwart's allow list. Stalwart bans an IP after
 * repeated failed logins; when that IP is ours, every site e-mail (login codes, notifications) stops,
 * because sending goes through the same server. Only our exact container address is allowed, never
 * the docker network: connections from outside can reach Stalwart through the network gateway.
 *
 * Runs at start-up: the container gets a new address when it is recreated on deploy, so entries of
 * earlier containers (same reason prefix, other address) are removed. STALWART_ALLOW_SELF=0 turns it off.
 */
export const SELF_REASON = 'Triad Vision API container';

/** Private IPv4 addresses of this host's network interfaces (the docker network address in production). */
export const ownAddresses = (ifaces = networkInterfaces()) =>
  [...new Set(Object.values(ifaces).flatMap((list) => (list ?? []).filter((i) => i.family === 'IPv4' && !i.internal).map((i) => i.address)))].sort();

export const syncSelfAllowed = async (cfg: StalwartConfig, addresses: string[]) => {
  const current = await listAllowedIps(cfg);
  const ours = current.filter((a) => a.reason?.startsWith(SELF_REASON));
  const add = addresses.filter((ip) => !current.some((a) => a.address === ip)).map((address) => ({ address, reason: `${SELF_REASON} (transactional mail must never be banned)` }));
  const stale = ours.filter((a) => !addresses.includes(a.address)).map((a) => a.id);
  await changeAllowedIps(cfg, add, stale);
  return { added: add.map((a) => a.address), removed: stale.length };
};

export const allowSelfOnMailServer = async () => {
  const cfg = stalwartConfig();
  if (!cfg || process.env.STALWART_ALLOW_SELF === '0') return;
  const addresses = ownAddresses();
  if (!addresses.length) return;
  try {
    const r = await syncSelfAllowed(cfg, addresses);
    if (r.added.length || r.removed) console.log(`[stalwart] allow list: added ${r.added.join(', ') || '-'}, removed ${r.removed} old address(es)`);
  } catch (err) {
    console.error('[stalwart] could not put our address on the allow list', (err as Error)?.message ?? err);
  }
};
