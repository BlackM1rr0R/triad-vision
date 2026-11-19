import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { registerCopy } from '@/i18n';
import { vacancyFolders } from '@/i18n/vacancyFolders';
import { toast } from 'sonner';
import { placesErrorText, useApplicationPolicy } from '@/components/vacancyPlaces/api'; // only our open vacancies with free places
import { VacancyOnlyPicker, unavailableOption, useVacancyOptionLabel, type VacancyOption } from '@/components/vacancyPlaces/VacancyPicker';
import { orderForVisa, preselectForVisa } from '@/components/vacancyPlaces/visaPreference'; // ?visa= from the calculator
import { WaitlistForm } from '@/components/jobs/WaitlistForm'; // no vacancy with a free place: "Uyğun vakansiya açılanda xəbər ver"

registerCopy(vacancyFolders);

/** Application kinds with a target job: the job is one of our open vacancies (never free text). */
const JOB_TYPES: VisaTypeKey[] = ['WORK', 'AUSBILDUNG', 'WEITERBILDUNG'];

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
  const [busy, setBusy] = useState(false);
  const [vacancyId, setVacancyId] = useState('');
  const vacancyFieldId = useId();
  // Admin setting "clients can only apply to active vacancies" (default on): the vacancy is the only choice and
  // decides the visa type (server lib/vacancyPlaces); off: the old free choice of the application kind.
  const { data: policy } = useApplicationPolicy();
  const onlyVacancies = policy?.clientsOnlyActiveVacancies ?? true;
  const withJob = onlyVacancies || (!!visaType && JOB_TYPES.includes(visaType));
  const { data: vacancies, isLoading: vacanciesLoading } = useQuery({
    queryKey: ['vacancy-options'],
    // closed=1: deactivated vacancies are listed last, flagged and not selectable (server lib/vacancyActive.ts).
    queryFn: async () => (await api.get<{ items: VacancyOption[] }>('/vacancies/options', { params: { closed: 1 } })).data.items,
    enabled: withJob,
    staleTime: 60_000,
  });
  // Visa chosen before registering (calculator → /register?visa=<slug>), applied once per visit; it is kept (7 days,
  // lib/referralCookie) until a case was started. Free choice: preselects the kind and sector. Vacancies only: the
  // vacancies of that visa come first, and the only one with a free place is preselected.
  const [prefill, setPrefill] = useState(rememberedVisa);
  const [visaPrefCategory, setVisaPrefCategory] = useState('');
  if (prefill && content?.visaCategories?.length && policy && (!onlyVacancies || vacancies)) {
    const cat = content.visaCategories.find((v) => v.slug === prefill);
    setPrefill('');
    if (!cat) forgetVisa();
    else if (onlyVacancies) {
      setVisaPrefCategory(cat.id);
      const pick = preselectForVisa(vacancies ?? [], cat.id, unavailableOption);
      if (pick) setVacancyId(pick);
    } else {
      setVisaType(cat.slug === 'ausbildung' ? 'AUSBILDUNG' : 'WORK');
      setVisaCategoryId(cat.id);
    }
  }
  const openVacancies = (vacancies ?? []).filter((v) => !unavailableOption(v));
  const orderedVacancies = orderForVisa(vacancies ?? [], visaPrefCategory, unavailableOption);
  const optionLabel = useVacancyOptionLabel();

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
    if (onlyVacancies ? !vacancyId : !visaType) return;
    setBusy(true);
    try {
      const res = await api.post<{ case: { id: string } }>(
        '/cases',
        onlyVacancies
          ? { vacancyId } // visa type, category and profession come from the vacancy
          : {
              visaType,
              // The target job is one of our vacancies (it sets the profession); else the profile's profession, else the visa type.
              ...(withJob && vacancyId ? { vacancyId } : defaultProfession ? { profession: defaultProfession } : {}),
              visaCategoryId: visaCategoryId || null,
            },
      );
      forgetVisa(); // the remembered calculator choice is used up
      await refresh();
      navigate(`/account/cases/${res.data.case.id}`);
    } catch (err) {
      const placesText = placesErrorText(t, err);
      if (placesText) {
        // The last place was taken / the vacancy closed meanwhile: reload the list.
        toast.error(placesText);
        setVacancyId('');
        await qc.invalidateQueries({ queryKey: ['vacancy-options'] });
        return;
      }
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
          {onlyVacancies ? (
            <VacancyOnlyPicker
              id={vacancyFieldId}
              vacancies={orderedVacancies}
              loading={vacanciesLoading}
              hasOpen={openVacancies.length > 0}
              value={vacancyId}
              onChange={setVacancyId}
            />
          ) : (
            <>
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
              {withJob && !!vacancies?.length && (
                <div>
                  <label htmlFor={vacancyFieldId} className="label">
                    {t('vacFolders.position.label')}
                  </label>
                  <select id={vacancyFieldId} className="input" value={vacancyId} onChange={(e) => setVacancyId(e.target.value)}>
                    <option value="">{t('vacFolders.position.notSure')}</option>
                    {vacancies.map((v) => (
                      <option key={v.id} value={v.id} disabled={unavailableOption(v)}>
                        {optionLabel(v)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
          <button type="submit" className="btn-primary btn-lg min-h-12 w-full sm:w-auto" disabled={busy || (onlyVacancies ? !vacancyId : !visaType)}>
            {busy ? <Spinner className="size-4" /> : <FilePlus2 className="size-4" aria-hidden />}
            {t('portal.create')}
          </button>
        </form>
      </div>
      {/* Only our vacancies can be chosen and none has a free place: the vacancy waitlist (outside the form above). */}
      {onlyVacancies && !vacanciesLoading && openVacancies.length === 0 && (
        <div className="border-t border-line p-6 sm:p-9" id="waitlist">
          <WaitlistForm profession={defaultProfession} bare />
        </div>
      )}
    </section>
  );
};

export default StartCase;
