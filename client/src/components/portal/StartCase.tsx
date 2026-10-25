import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Award, Briefcase, FilePlus2, GraduationCap, Plane, Rocket, School, Search, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { useApiError } from './useApiError';
import { OVERVIEW_KEY } from './useOverview';
import { forgetVisa, rememberedVisa } from '@/lib/referralCookie';
import { Traveller } from '@/components/illustrations';

type VisaTypeKey = 'WORK' | 'AUSBILDUNG' | 'WEITERBILDUNG' | 'JOB_SEEKER' | 'STUDY' | 'FAMILY' | 'TOURIST';

/** The kinds of application a client can start (instead of typing a profession). */
const VISA_TYPES: { key: VisaTypeKey; icon: LucideIcon }[] = [
  { key: 'WORK', icon: Briefcase },
  { key: 'AUSBILDUNG', icon: School },
  { key: 'WEITERBILDUNG', icon: Award },
  { key: 'JOB_SEEKER', icon: Search },
  { key: 'STUDY', icon: GraduationCap },
  { key: 'FAMILY', icon: Users },
  { key: 'TOURIST', icon: Plane },
];

/** Guided "start your application" card shown when the client has no active case. */
export const StartCase = ({ hasCases, defaultProfession }: { hasCases: boolean; defaultProfession?: string | null }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onError = useApiError();
  const { data: content } = useSiteContent();
  const visaId = useId();
  const [visaType, setVisaType] = useState<VisaTypeKey | ''>('');
  const [visaCategoryId, setVisaCategoryId] = useState('');
  // Visa chosen before registering (calculator → /register?visa=<slug>): preselect it once.
  const [prefill, setPrefill] = useState(rememberedVisa);
  if (prefill && content?.visaCategories?.length) {
    const cat = content.visaCategories.find((v) => v.slug === prefill);
    setPrefill('');
    forgetVisa();
    if (cat) {
      setVisaType(cat.slug === 'ausbildung' ? 'AUSBILDUNG' : 'WORK');
      setVisaCategoryId(cat.id);
    }
  }
  const [busy, setBusy] = useState(false);

  const categories = [...(content?.visaCategories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const steps = t('accountPage.dash.start.steps', { returnObjects: true }) as unknown as string[];

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['cases'] }), qc.invalidateQueries({ queryKey: OVERVIEW_KEY })]);

  /** Ausbildung has its own visa category; the sector list only applies to work visas. */
  const pickType = (key: VisaTypeKey) => {
    setVisaType(key);
    if (key === 'AUSBILDUNG') setVisaCategoryId(categories.find((v) => v.slug === 'ausbildung')?.id ?? '');
    else if (key !== 'WORK') setVisaCategoryId('');
    else if (categories.find((v) => v.id === visaCategoryId)?.slug === 'ausbildung') setVisaCategoryId('');
  };

  const submit = async () => {
    if (!visaType) return;
    setBusy(true);
    try {
      const res = await api.post<{ case: { id: string } }>('/cases', {
        visaType,
        // The profession comes from the profile (if filled); the server falls back to the visa type.
        ...(defaultProfession ? { profession: defaultProfession } : {}),
        visaCategoryId: visaCategoryId || null,
      });
      await refresh();
      navigate(`/account/cases/${res.data.case.id}`);
    } catch (err) {
      onError(err);
      if (errorCode(err) === 'ACTIVE_CASE_EXISTS') await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <section id="start" className="card scroll-mt-28 overflow-hidden lg:scroll-mt-36" aria-labelledby="start-title">
      <div className="grid lg:grid-cols-[1fr_1.15fr]">
        <div className="relative overflow-hidden border-b border-line bg-highlight-bg p-6 text-ink sm:p-9 lg:border-r lg:border-b-0">
          <span className="type-overline inline-flex items-center gap-2 text-ink">
            <span className="size-2 rounded-full bg-highlight" aria-hidden />
            {t('accountPage.dash.start.eyebrow')}
          </span>
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-card text-ink">
              <Rocket className="size-5" aria-hidden />
            </span>
            <h2 id="start-title" className="text-xl font-semibold sm:text-2xl">
              {t('portal.startTitle')}
            </h2>
          </div>
          <p className="mt-3 max-w-[60ch] leading-relaxed text-ink/80">{t('portal.startText')}</p>
          <ol className="relative mt-6 space-y-3">
            {(Array.isArray(steps) ? steps : []).map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm font-semibold">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                    i === 0 ? 'bg-primary text-primary-contrast' : 'border border-line bg-card text-muted'
                  }`}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className={i === 0 ? 'text-ink' : 'text-muted'}>{s}</span>
              </li>
            ))}
          </ol>
          {!hasCases && <p className="mt-6 text-xs font-semibold text-muted">{t('portal.noCases')}</p>}
          <Traveller className="mt-8 hidden w-52 lg:block" />
        </div>
        <form
          className="space-y-5 p-6 sm:p-9"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <fieldset>
            <legend className="label">{t('portal.applicationType')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {VISA_TYPES.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => pickType(key)}
                  aria-pressed={visaType === key}
                  className={`flex min-h-14 items-start gap-3 rounded-2xl border p-3.5 text-left transition-colors ${
                    visaType === key ? 'border-primary bg-sunken ring-2 ring-focus/30' : 'border-line hover:border-line-strong hover:bg-sunken'
                  }`}
                >
                  <span className={`grid size-10 shrink-0 place-items-center rounded-xl ${visaType === key ? 'bg-primary text-primary-contrast' : 'chip-soft'}`}>
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">{t(`portal.visaTypes.${key}`)}</span>
                    <span className="block text-xs leading-snug text-muted">{t(`portal.visaTypeHints.${key}`)}</span>
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
          {visaType === 'WORK' && categories.length > 0 && (
            <div>
              <label htmlFor={visaId} className="label">
                {t('portal.sectorLabel')}
              </label>
              <select id={visaId} className="input" value={visaCategoryId} onChange={(e) => setVisaCategoryId(e.target.value)}>
                <option value="">{t('portal.notSure')}</option>
                {categories
                  .filter((v) => v.slug !== 'ausbildung')
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {tr(v.title)} ({v.visaLabel})
                    </option>
                  ))}
              </select>
            </div>
          )}
          <button type="submit" className="btn-primary btn-lg min-h-12 w-full sm:w-auto" disabled={busy || !visaType}>
            {busy ? <Spinner className="size-4" /> : <FilePlus2 className="size-4" aria-hidden />}
            {t('portal.create')}
          </button>
        </form>
      </div>
    </section>
  );
};

export default StartCase;
