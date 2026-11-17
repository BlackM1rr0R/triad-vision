import { Router } from 'express';
import { parse } from '../../lib/http.js';
import { audit } from '../../lib/audit.js';
import { getEurAzn, storedRate } from '../../lib/life/cbar.js';
import { LIFE_DEFAULTS, LIFE_PROFESSIONS, getLifeSettings, lifeSettingsSchema, saveLifeSettings } from '../../lib/life/settings.js';
import { clearLiveNumbersCache, liveNumbers, MIN_COUNT } from '../../lib/life/liveNumbers.js';
import { rateAlertStats } from '../../lib/rateAlerts/service.js';

/**
 * Admin side of "Life in Germany" — mounted at /api/admin/life (ADMIN+, Admin → Settings):
 *   GET  /settings        live numbers board toggles, Baku salary reference, stored CBAR rate, board preview
 *   PUT  /settings        save (audited); clears the board cache
 *   POST /rate/refresh    ask CBAR now (otherwise at most once a day)
 */
export const adminLifeRouter = Router();

adminLifeRouter.get('/settings', async (_req, res) => {
  const [settings, rate, board, rateAlerts] = await Promise.all([getLifeSettings(), storedRate(), liveNumbers(), rateAlertStats()]);
  // rateAlerts: counts only (active / paused / pending) of the EUR → AZN rate alerts (lib/rateAlerts).
  res.json({ settings, defaults: LIFE_DEFAULTS, professions: LIFE_PROFESSIONS, rate, board, minCount: MIN_COUNT, rateAlerts });
});

adminLifeRouter.put('/settings', async (req, res) => {
  const settings = parse(lifeSettingsSchema, req.body);
  await saveLifeSettings(settings);
  clearLiveNumbersCache();
  await audit(req, 'LIFE_SETTINGS_UPDATED', 'lifeInGermany', { board: settings.board, baku: settings.baku.enabled });
  res.json({ settings });
});

adminLifeRouter.post('/rate/refresh', async (req, res) => {
  const rate = await getEurAzn({ force: true });
  await audit(req, 'CBAR_RATE_REFRESHED', 'cbarEurAzn', { ok: !!rate && !rate.stale });
  res.json({ rate });
});
