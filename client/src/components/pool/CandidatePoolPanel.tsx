import { useEffect, useId, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Eye, EyeOff, Info, Plus, Save, ShieldCheck, Trash2, UsersRound } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { registerCopy } from '@/i18n';
import { pagesPool } from '@/i18n/pagesPool';
import { PoolCardView } from './PoolCardView';
import { fmtDay, poolError, POOL_AVAILABILITY, POOL_LANGUAGE_LEVELS, POOL_LANGUAGES, POOL_REGIONS, POOL_TRACKS, splitList, type PoolCard, type PoolLanguage } from './types';

registerCopy(pagesPool);

interface PoolState {
  currentVersion: string;
  profile: {
    code: string;
    consent: boolean;
    consentAt: string | null;
    consentVersion: string | null;
    visible: boolean;
    staffReady: boolean;
    pausedByTeam: boolean;
    professions: string[];
    languages: PoolLanguage[];
    regions: string[];
    earliestStart: string | null;
    availability: string | null;
    skills: string[];
    track: string;
  };
  missing: string[];
  preview: PoolCard;
  stats: { views30d: number; interests: number };
}

const KEY = ['account-candidate-pool'] as const;

/** Client portal: opt-in to the anonymous candidate pool (default off) and the pool details. Profile → Professional tab. */
export const CandidatePoolPanel = ({ className }: { className?: string }) => {
  const { t, i18n } = useTranslation();
  const p = (k: string, o?: Record<string, unknown>) => t(`pool.client.${k}`, o);
  const uid = useId();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<PoolState>('/account/candidate-pool')).data });

  const [form, setForm] = useState({ professions: '', skills: '', regions: [] as string[], earliestStart: '', availability: '', track: 'JOB', languages: [] as PoolLanguage[] });
  useEffect(() => {
    const s = q.data?.profile;
    if (!s) return;
    setForm({
      professions: s.professions.join(', '),
      skills: s.skills.join(', '),
      regions: s.regions,
      earliestStart: s.earliestStart ?? '',
      availability: s.availability ?? '',
      track: s.track,
      languages: s.languages,
    });
  }, [q.data]);

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.put<PoolState>('/account/candidate-pool', body)).data,
    onSuccess: (data, body) => {
      qc.setQueryData(KEY, data);
      if (body.consent === true) toast.success(p('turnedOn'));
      else if (body.consent === false) toast.success(p('turnedOff'));
      else toast.success(p('saved'));
    },
    onError: (err) => toast.error(poolError(err)),
  });

  if (q.isLoading || !q.data) {
    return (
      <div className={clsx('card card-pad grid min-h-32 place-items-center', className)}>
        <Spinner className="size-5" />
      </div>
    );
  }
  const s = q.data;
  const on = s.profile.consent && s.profile.consentVersion === s.currentVersion;
  const blocked = s.missing.length > 0 && !s.profile.consent;

  const toggle = () => save.mutate(on ? { consent: false } : { consent: true, version: s.currentVersion });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate({
      professions: splitList(form.professions, 3),
      skills: splitList(form.skills, 12),
      regions: form.regions,
      earliestStart: form.earliestStart || null,
      availability: form.availability || null,
      track: form.track,
      languages: form.languages,
    });
  };
  const toggleRegion = (r: string) => setForm((f) => ({ ...f, regions: f.regions.includes(r) ? f.regions.filter((x) => x !== r) : [...f.regions, r] }));
  const setLang = (i: number, patch: Partial<PoolLanguage>) => setForm((f) => ({ ...f, languages: f.languages.map((l, j) => (j === i ? { ...l, ...patch } : l)) }));

  return (
    <section className={clsx('card card-pad', className)} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className="type-card-title flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-soft">
          <UsersRound className="size-4.5" aria-hidden />
        </span>
        {p('title')}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{p('intro')}</p>

      {s.profile.staffReady && !on && (
        <p className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-sunken p-3 text-sm text-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-link" aria-hidden /> {p('staffReady')}
        </p>
      )}

      <div className="mt-5 rounded-xl border border-line p-4">
        <div className="flex items-center gap-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl chip-soft">{on ? <Eye className="size-5" aria-hidden /> : <EyeOff className="size-5" aria-hidden />}</span>
          <div className="min-w-0 flex-1">
            <p id={`${uid}-sw`} className="text-sm font-semibold text-ink">
              {p('switchLabel')}
            </p>
            <p className="text-xs text-muted">
              {on && s.profile.consentAt ? p('consentGiven', { date: fmtDay(s.profile.consentAt, i18n.language) }) : p('hiddenOff')}
              {on && (s.profile.visible ? ` · ${p('visible')}` : '')}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby={`${uid}-sw`}
            aria-describedby={`${uid}-consent`}
            disabled={save.isPending || blocked}
            onClick={toggle}
            className={clsx('relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60', on ? 'bg-primary' : 'bg-line-strong')}
          >
            <span className={clsx('inline-block size-5 rounded-full bg-card shadow transition-transform duration-200', on ? 'translate-x-6' : 'translate-x-1')} aria-hidden />
          </button>
        </div>
        <p id={`${uid}-consent`} className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{p('consentText')}</span>
        </p>
        {blocked && <p className="mt-2 text-xs font-semibold text-danger">{p('missingProfession')}</p>}
        {s.profile.pausedByTeam && on && <p className="mt-2 text-xs font-semibold text-warning-fg">{p('pausedByTeam')}</p>}
        {on && <p className="mt-2 text-xs text-muted">{p('stats', { views: s.stats.views30d, interests: s.stats.interests })}</p>}
      </div>

      <form className="mt-6" onSubmit={submit}>
        <h3 className="text-sm font-semibold text-ink">{p('detailsTitle')}</h3>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor={`${uid}-prof`} className="label">
              {p('professions')}
            </label>
            <input id={`${uid}-prof`} className="input" maxLength={260} value={form.professions} onChange={(e) => setForm((f) => ({ ...f, professions: e.target.value }))} />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor={`${uid}-skills`} className="label">
              {p('skills')}
            </label>
            <input id={`${uid}-skills`} className="input" maxLength={600} value={form.skills} aria-describedby={`${uid}-skills-h`} onChange={(e) => setForm((f) => ({ ...f, skills: e.target.value }))} />
            <p id={`${uid}-skills-h`} className="mt-1.5 text-xs text-muted">
              {p('skillsHint')}
            </p>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${uid}-avail`} className="label">
              {p('availability')}
            </label>
            <select id={`${uid}-avail`} className="input" value={form.availability} onChange={(e) => setForm((f) => ({ ...f, availability: e.target.value }))}>
              <option value="">{p('none')}</option>
              {POOL_AVAILABILITY.map((a) => (
                <option key={a} value={a}>
                  {t(`pool.availability.${a}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${uid}-start`} className="label">
              {p('earliestStart')}
            </label>
            <input id={`${uid}-start`} type="date" className="input" value={form.earliestStart} onChange={(e) => setForm((f) => ({ ...f, earliestStart: e.target.value }))} />
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor={`${uid}-track`} className="label">
              {p('track')}
            </label>
            <select id={`${uid}-track`} className="input" value={form.track} onChange={(e) => setForm((f) => ({ ...f, track: e.target.value }))}>
              {POOL_TRACKS.map((tr) => (
                <option key={tr} value={tr}>
                  {t(`pool.track.${tr}`)}
                </option>
              ))}
            </select>
          </div>
          <fieldset className="min-w-0 sm:col-span-2">
            <legend className="label">{p('regions')}</legend>
            <div className="flex flex-wrap gap-1.5">
              {POOL_REGIONS.filter((r) => r !== 'ANY').map((r) => {
                const sel = form.regions.includes(r);
                return (
                  <button
                    key={r}
                    type="button"
                    aria-pressed={sel}
                    onClick={() => toggleRegion(r)}
                    className={clsx('min-h-9 rounded-lg border px-2.5 text-xs font-semibold transition-colors', sel ? 'border-primary bg-primary text-primary-contrast' : 'border-line text-ink hover:border-line-strong')}
                  >
                    {t(`pool.regions.${r}`)}
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-muted">{p('regionsHint')}</p>
          </fieldset>
          <fieldset className="min-w-0 sm:col-span-2">
            <legend className="label">{p('languages')}</legend>
            <div className="space-y-2">
              {form.languages.map((l, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select aria-label={p('languages')} className="input w-auto min-w-40 flex-1" value={l.lang} onChange={(e) => setLang(i, { lang: e.target.value as PoolLanguage['lang'] })}>
                    {POOL_LANGUAGES.map((x) => (
                      <option key={x} value={x}>
                        {t(`pool.languages.${x}`)}
                      </option>
                    ))}
                  </select>
                  <select aria-label={t('pool.labels.languages')} className="input w-auto" value={l.level} onChange={(e) => setLang(i, { level: e.target.value as PoolLanguage['level'] })}>
                    {POOL_LANGUAGE_LEVELS.map((x) => (
                      <option key={x} value={x}>
                        {x === 'native' ? t('pool.native') : x}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn-ghost btn-sm" aria-label={p('removeLanguage')} onClick={() => setForm((f) => ({ ...f, languages: f.languages.filter((_, j) => j !== i) }))}>
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                </div>
              ))}
              {form.languages.length < 8 && (
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={() => setForm((f) => ({ ...f, languages: [...f.languages, { lang: POOL_LANGUAGES.find((x) => !f.languages.some((l) => l.lang === x)) ?? 'en', level: 'B1' }] }))}
                >
                  <Plus className="size-4" aria-hidden /> {p('addLanguage')}
                </button>
              )}
            </div>
          </fieldset>
        </div>
        <div className="mt-6 flex justify-end border-t border-line pt-5">
          <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto" disabled={save.isPending}>
            {save.isPending ? <Spinner className="size-4" /> : <Save className="size-4" aria-hidden />}
            {p('save')}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-ink">{p('previewTitle')}</h3>
        <PoolCardView card={s.preview} detailed className="mt-3" />
      </div>
    </section>
  );
};
