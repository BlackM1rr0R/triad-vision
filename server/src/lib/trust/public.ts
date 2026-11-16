import { getBrand } from '../brand/index.js';
import { MEASURES } from './measures.js';
import { getTrustSettings, isAvvAvailable } from './settings.js';
import { currentSubprocessors } from './subprocessors.js';

/**
 * Public Trust Center data (GET /api/trust): only what the code implements (MEASURES), the configured
 * sub-processors and the owner's confirmed facts. The data location is shown only when the owner entered it.
 */
export const trustCenterView = async () => {
  const [s, avv, brand] = await Promise.all([getTrustSettings(), isAvvAvailable(), getBrand()]);
  const subs = await currentSubprocessors(s.dataLocation);
  return {
    dataLocation: s.dataLocation || null,
    dataLocationConfirmed: !!s.dataLocation && s.dataLocationConfirmed,
    backupLocation: s.backupLocation || null,
    securityEmail: s.securityEmail || brand.supportEmail || null,
    note: s.note || null,
    measures: MEASURES.map((m) => ({ key: m.key, category: m.category })),
    subprocessors: subs.map((x) => ({ key: x.key, name: x.name, optional: x.optional })),
    avvAvailable: avv,
    links: { privacy: '/privacy', imprint: '/impressum', status: '/status' },
  };
};
