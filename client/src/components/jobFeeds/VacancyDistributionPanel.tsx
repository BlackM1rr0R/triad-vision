import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Rss, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesJobFeeds } from '@/i18n/pagesJobFeeds';
import { Panel } from '@/components/admin/ui';
import { fmtDateTime, toastError } from '@/components/admin/labels';
import { Badge } from '@/components/ui/Badge';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { Spinner } from '@/components/ui/Spinner';
import { CHANNELS, FEED_LANGUAGES, STATUS_TONE, type Channel, type Distribution, type Occupation, type VacancyDistributionView } from './types';

registerCopy(pagesJobFeeds);

const day = (v: string | null) => (v ? v.slice(0, 10) : '');

/** Error codes of a channel check, translated. */
export const useErrorLabel = () => {
  const { t } = useTranslation();
  return (codes: string | string[] | null | undefined) =>
    (Array.isArray(codes) ? codes : (codes ?? '').split(','))
      .filter(Boolean)
      .map((c) => t(`jobFeeds.errorCode.${c}`, { defaultValue: c }))
      .join(' · ');
};

/**
 * "Paylaşım" section of the vacancy drawer (ADMIN+): which job boards get this vacancy, in which language,
 * how the employer is shown, the KldB / BA occupation codes and the per-channel status.
 */
export function VacancyDistributionPanel({ vacancyId }: { vacancyId: string }) {
  const { user } = useAuth();
  if (!hasMinRole(user?.role, 'ADMIN')) return null;
  return <DistributionEditor vacancyId={vacancyId} />;
}

function DistributionEditor({ vacancyId }: { vacancyId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const errorLabel = useErrorLabel();
  const key = ['admin-job-feeds-vacancy', vacancyId];
  const q = useQuery({ queryKey: key, queryFn: async () => (await api.get<VacancyDistributionView>(`/admin/job-feeds/vacancies/${vacancyId}`)).data });
  const [f, setF] = useState<Distribution | null>(null);
  const [occQuery, setOccQuery] = useState('');
  useEffect(() => {
    if (q.data) setF(q.data.distribution);
  }, [q.data]);
  const occ = useQuery({
    queryKey: ['admin-job-feeds-occupations', occQuery],
    queryFn: async () => (await api.get<{ items: Occupation[] }>('/admin/job-feeds/occupations', { params: { q: occQuery } })).data.items,
    enabled: occQuery.trim().length > 0,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });
  const save = useMutation({
    mutationFn: async (d: Distribution) =>
      (
        await api.put<VacancyDistributionView>(`/admin/job-feeds/vacancies/${vacancyId}`, {
          ...d,
          employerLabel: d.employerLabel || null,
          applyUrl: d.applyUrl || null,
          occupationCode: d.occupationCode || null,
          baTitleCode: d.baTitleCode || null,
          postalCode: d.postalCode || null,
          limitedUntil: d.limited ? d.limitedUntil || null : null,
          startDate: d.startDate || null,
        })
      ).data,
    onSuccess: (view) => {
      qc.setQueryData(key, view);
      void qc.invalidateQueries({ queryKey: ['admin-job-feeds'] });
      toast.success(t('jobFeeds.panel.saved'));
    },
    onError: (e) => toastError(e),
  });

  if (!q.data || !f) {
    return (
      <Panel title={t('jobFeeds.panel.title')} icon={Rss}>
        {q.isError ? <p className="text-sm text-danger-fg">{t('admin.common.loadFailed')}</p> : <Spinner className="size-5 text-link" />}
      </Panel>
    );
  }
  const v = q.data;
  const set = <K extends keyof Distribution>(k: K, val: Distribution[K]) => setF((cur) => (cur ? { ...cur, [k]: val } : cur));
  const toggle = (c: Channel) => set('channels', f.channels.includes(c) ? f.channels.filter((x) => x !== c) : [...f.channels, c]);
  const stateOf = (c: Channel) => v.states.find((s) => s.channel === c);

  return (
    <Panel title={t('jobFeeds.panel.title')} icon={Rss}>
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate(f);
        }}
      >
        <p className="text-sm text-muted">{t('jobFeeds.panel.intro')}</p>
        {!v.vacancy.live && <p className="rounded-lg bg-warning-bg px-3 py-2 text-sm text-warning-fg">{t('jobFeeds.panel.notLive')}</p>}

        <fieldset className="grid gap-2">
          <legend className="label">{t('jobFeeds.panel.channels')}</legend>
          {CHANNELS.map((c) => {
            const s = stateOf(c);
            const problems = v.check[c] ?? [];
            return (
              <div key={c} className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-line px-3 py-2">
                <Checkbox label={t(`jobFeeds.channel.${c}`)} hint={t(`jobFeeds.channelHint.${c}`)} checked={f.channels.includes(c)} onChange={() => toggle(c)} />
                <div className="flex flex-col items-end gap-1 text-xs text-muted">
                  {s && (
                    <Badge tone={STATUS_TONE[s.status]} dot>
                      {t(`jobFeeds.status.${s.status}`)}
                    </Badge>
                  )}
                  {s?.lastExportAt && <span>{t('jobFeeds.panel.lastExport', { date: fmtDateTime(s.lastExportAt) })}</span>}
                  {s?.error && <span className="text-danger-fg">{errorLabel(s.error)}</span>}
                  {f.channels.includes(c) && !s?.error && (
                    <span className={problems.length ? 'text-danger-fg' : 'text-success-fg'}>{problems.length ? errorLabel(problems) : t('jobFeeds.panel.ok')}</span>
                  )}
                </div>
              </div>
            );
          })}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t('jobFeeds.panel.language')} hint={t('jobFeeds.panel.languageHint')}>
            <Select value={f.language} onChange={(e) => set('language', e.target.value)}>
              {FEED_LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t('jobFeeds.panel.applyUrl')}>
            <Input type="url" inputMode="url" maxLength={500} placeholder={v.applyUrls.indeed.split('?')[0]} value={f.applyUrl ?? ''} onChange={(e) => set('applyUrl', e.target.value)} />
          </Field>
        </div>

        <div className="grid gap-2">
          <Checkbox label={t('jobFeeds.panel.hideEmployer')} hint={v.vacancy.companyName ?? undefined} checked={f.hideEmployer} onChange={(e) => set('hideEmployer', e.target.checked)} />
          {f.hideEmployer && (
            <Field label={t('jobFeeds.panel.employerLabel')}>
              <Input maxLength={160} placeholder={t('jobFeeds.panel.employerLabelPlaceholder')} value={f.employerLabel ?? ''} onChange={(e) => set('employerLabel', e.target.value)} />
            </Field>
          )}
        </div>

        <div className="grid gap-2">
          <Field label={t('jobFeeds.panel.occupation')} hint={t('jobFeeds.panel.occupationSource')}>
            <Input inputMode="numeric" maxLength={5} placeholder="52122" value={f.occupationCode ?? ''} onChange={(e) => set('occupationCode', e.target.value.replace(/\D/g, ''))} />
          </Field>
          {v.suggestion && v.suggestion.code !== f.occupationCode && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
              {t('jobFeeds.panel.suggestion', { code: v.suggestion.code, name: v.suggestion.de })}
              <button type="button" className="btn-secondary btn-sm" onClick={() => set('occupationCode', v.suggestion!.code)}>
                {t('jobFeeds.panel.useSuggestion')}
              </button>
            </p>
          )}
          <label className="relative block">
            <span className="sr-only">{t('jobFeeds.panel.occupationSearch')}</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input pl-9" type="search" maxLength={80} placeholder={t('jobFeeds.panel.occupationSearch')} value={occQuery} onChange={(e) => setOccQuery(e.target.value)} />
          </label>
          {occQuery.trim() && !!occ.data?.length && (
            <ul className="max-h-48 divide-y divide-line overflow-auto rounded-lg border border-line">
              {occ.data.map((o) => (
                <li key={o.code}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-sunken"
                    onClick={() => {
                      set('occupationCode', o.code);
                      setOccQuery('');
                    }}
                  >
                    <span>
                      <span className="code-id mr-2">{o.code}</span>
                      {o.de}
                      <span className="ml-2 text-xs text-muted">{o.az}</span>
                    </span>
                    {o.verify && <span className="text-xs text-warning-fg">{t('jobFeeds.panel.verify')}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={t('jobFeeds.panel.baTitleCode')}>
            <Input inputMode="numeric" maxLength={12} value={f.baTitleCode ?? ''} onChange={(e) => set('baTitleCode', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label={t('jobFeeds.panel.postalCode')}>
            <Input inputMode="numeric" maxLength={5} value={f.postalCode ?? ''} onChange={(e) => set('postalCode', e.target.value.replace(/\D/g, ''))} />
          </Field>
          <Field label={t('jobFeeds.panel.weeklyHours')}>
            <Input type="number" min={1} max={60} value={f.weeklyHours ?? ''} onChange={(e) => set('weeklyHours', e.target.value ? Number(e.target.value) : null)} />
          </Field>
          <Field label={t('jobFeeds.panel.startDate')}>
            <Input type="date" value={day(f.startDate)} onChange={(e) => set('startDate', e.target.value || null)} />
          </Field>
          <div className="flex items-end pb-2">
            <Checkbox label={t('jobFeeds.panel.limited')} checked={f.limited} onChange={(e) => set('limited', e.target.checked)} />
          </div>
          {f.limited && (
            <Field label={t('jobFeeds.panel.limitedUntil')}>
              <Input type="date" value={day(f.limitedUntil)} onChange={(e) => set('limitedUntil', e.target.value || null)} />
            </Field>
          )}
        </div>

        <div>
          <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
            {save.isPending && <Spinner className="size-3.5" />} {t('jobFeeds.panel.save')}
          </button>
        </div>
      </form>
    </Panel>
  );
}
