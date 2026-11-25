import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { BellRing, Building2, Heart, MapPin, Search, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesGermanyJobAlerts } from '@/i18n/pagesGermanyJobAlerts';
import { pagesPortalNav } from '@/i18n/pagesPortalNav';
import { fmtDate } from '@/components/admin/labels';
import { Spinner } from '@/components/ui/Spinner';
import { buttonClass } from '@/components/ui/Button';
import { DirectApplyButton, DirectApplyHelpers, DirectApplyNote } from '@/components/germanyJobs/DirectApply'; // the candidate applies directly
import { useSavedJobs } from '@/components/germanyJobs/savedJobs';
import { useAlertSummary } from '@/components/germanyJobs/alertSummary';
import { searchToParams, type AlertFrequency, type GermanyJobAlertView, type SavedGermanyJob } from '@/lib/germanyJobs';

registerCopy(pagesGermanyJobAlerts);
registerCopy(pagesPortalNav);

const SOURCE_NAME: Record<string, string> = { arbeitnow: 'Arbeitnow', careerjet: 'Careerjet', jooble: 'Jooble', adzuna: 'Adzuna' };

/**
 * /account/saved-jobs — Learn › Saved jobs: listings saved in the Germany job search (snapshot; the ad opens at its
 * source, "no longer available" when it left the source; the candidate applies to the employer directly, with the free
 * Lebenslauf / Anschreiben helpers) and the client's Germany job alerts (frequency, delete).
 * Server: routes/germanyJobAlerts.ts.
 */
export default function AccountSavedJobs() {
  const { t } = useTranslation();
  usePageTitle(t('gjPortal.title'));
  const qc = useQueryClient();
  const saved = useSavedJobs();
  const summary = useAlertSummary();
  const alerts = useQuery({
    queryKey: ['germany-job-alerts-mine'],
    queryFn: async () => (await api.get<{ items: GermanyJobAlertView[]; emailNotifications: boolean }>('/germany-jobs/alerts/mine')).data,
  });

  const removeSaved = async (j: SavedGermanyJob) => {
    try {
      await saved.remove(j.id);
    } catch {
      toast.error(t('gjPortal.error'));
    }
  };

  const setFrequency = async (a: GermanyJobAlertView, frequency: AlertFrequency) => {
    try {
      await api.patch(`/germany-jobs/alerts/mine/${a.id}`, { frequency });
      void qc.invalidateQueries({ queryKey: ['germany-job-alerts-mine'] });
    } catch {
      toast.error(t('gjPortal.error'));
    }
  };

  const removeAlert = async (a: GermanyJobAlertView) => {
    try {
      await api.delete(`/germany-jobs/alerts/mine/${a.id}`);
      toast.success(t('gjPortal.removed'));
      void qc.invalidateQueries({ queryKey: ['germany-job-alerts-mine'] });
    } catch {
      toast.error(t('gjPortal.error'));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="type-page-title">{t('gjPortal.title')}</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('gjPortal.intro')}</p>
      </div>

      <section className="card card-pad" aria-labelledby="saved-h">
        <h3 id="saved-h" className="type-card-title flex items-center gap-2 text-ink">
          <Heart className="size-4" aria-hidden /> {t('gjPortal.savedTitle')}
        </h3>
        {saved.loading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4" />
          </p>
        ) : !saved.items.length ? (
          <div className="mt-3">
            <p className="text-sm text-muted">{t('gjPortal.savedEmpty')}</p>
            <Link to="/jobs/germany/search" className={buttonClass({ variant: 'outline', className: 'mt-3' })}>
              <Search className="size-4" aria-hidden /> {t('gjPortal.toSearch')}
            </Link>
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {saved.items.map((j) => {
              const gone = j.status === 'gone';
              return (
                <li key={j.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className={clsx('min-w-0', gone && 'opacity-70')}>
                    <p className="font-semibold break-words text-ink">{j.title}</p>
                    <p className="mt-0.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
                      {j.company && (
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="size-3.5" aria-hidden /> {j.company}
                        </span>
                      )}
                      {j.location && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="size-3.5" aria-hidden /> {j.location}
                        </span>
                      )}
                      <span>{t('gjPortal.via', { name: SOURCE_NAME[j.source] ?? j.source })}</span>
                    </p>
                    <p className="mt-1 text-xs text-subtle">{t('gjPortal.savedOn', { date: fmtDate(j.savedAt) })}</p>
                    {gone && (
                      <p className="mt-2 inline-flex flex-wrap items-center gap-2 text-xs">
                        <span className="badge bg-sunken text-ink">{t('gjPortal.gone')}</span>
                        <span className="text-muted">{t('gjPortal.goneHint')}</span>
                      </p>
                    )}
                    {!gone && (
                      <>
                        <DirectApplyNote className="mt-2" />
                        <DirectApplyHelpers listing={j} className="mt-2" />
                      </>
                    )}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <DirectApplyButton url={j.url} size="sm" />
                    <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => void removeSaved(j)}>
                      <Trash2 className="size-3.5" aria-hidden /> {t('gjPortal.remove')}
                      <span className="sr-only">: {j.title}</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card card-pad" aria-labelledby="alerts-h">
        <h3 id="alerts-h" className="type-card-title flex items-center gap-2 text-ink">
          <BellRing className="size-4" aria-hidden /> {t('gjPortal.alertsTitle')}
        </h3>
        {alerts.data && !alerts.data.emailNotifications && alerts.data.items.length > 0 && (
          <p className="mt-3 rounded-xl bg-warning-bg px-4 py-3 text-sm text-warning-fg">{t('gjPortal.emailOff')}</p>
        )}
        {alerts.isLoading ? (
          <p className="mt-4 flex items-center gap-2 text-sm text-muted">
            <Spinner className="size-4" />
          </p>
        ) : !alerts.data?.items.length ? (
          <p className="mt-3 text-sm text-muted">{t('gjPortal.alertsEmpty')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {alerts.data.items.map((a) => (
              <li key={a.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link to={`/jobs/germany/search?${searchToParams({ ...a.search, page: 1 }).toString()}`} className="font-semibold break-words text-link hover:underline">
                    {summary(a.search)}
                  </Link>
                  <p className="mt-0.5 text-xs text-subtle">{a.lastSentAt ? t('gjPortal.lastSent', { date: fmtDate(a.lastSentAt) }) : t('gjPortal.never')}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <label className="sr-only" htmlFor={`freq-${a.id}`}>
                    {t('gjPortal.frequency')}
                  </label>
                  <select id={`freq-${a.id}`} className="input h-9 w-auto py-0 text-sm" value={a.frequency} onChange={(e) => void setFrequency(a, e.target.value as AlertFrequency)}>
                    <option value="daily">{t('gjAlert.daily')}</option>
                    <option value="weekly">{t('gjAlert.weekly')}</option>
                  </select>
                  <button type="button" className={buttonClass({ variant: 'ghost', size: 'sm' })} onClick={() => void removeAlert(a)}>
                    <Trash2 className="size-3.5" aria-hidden /> {t('gjPortal.remove2')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
