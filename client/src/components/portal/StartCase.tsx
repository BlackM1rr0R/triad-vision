import { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { FilePlus2, Rocket } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { useApiError } from './useApiError';
import { OVERVIEW_KEY } from './useOverview';

/** Guided "start your application" card shown when the client has no active case. */
export const StartCase = ({ hasCases, defaultProfession }: { hasCases: boolean; defaultProfession?: string | null }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const onError = useApiError();
  const { data: content } = useSiteContent();
  const professionId = useId();
  const visaId = useId();
  const [profession, setProfession] = useState(defaultProfession ?? '');
  const [visaCategoryId, setVisaCategoryId] = useState('');
  const [busy, setBusy] = useState(false);

  const categories = [...(content?.visaCategories ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const steps = t('accountPage.dash.start.steps', { returnObjects: true }) as unknown as string[];

  const refresh = () =>
    Promise.all([qc.invalidateQueries({ queryKey: ['cases'] }), qc.invalidateQueries({ queryKey: OVERVIEW_KEY })]);

  const submit = async () => {
    if (profession.trim().length < 2) return;
    setBusy(true);
    try {
      const res = await api.post<{ case: { id: string } }>('/cases', {
        profession: profession.trim(),
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
        <div className="relative overflow-hidden bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white sm:p-8">
          <div className="pointer-events-none absolute -right-10 -bottom-10 size-48 rounded-full bg-[radial-gradient(closest-side,var(--color-white),transparent)] opacity-10" aria-hidden />
          <span className="eyebrow text-white/75">{t('accountPage.dash.start.eyebrow')}</span>
          <div className="mt-4 flex items-center gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15">
              <Rocket className="size-5" aria-hidden />
            </span>
            <h2 id="start-title" className="text-xl font-extrabold sm:text-2xl">
              {t('portal.startTitle')}
            </h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-white/80">{t('portal.startText')}</p>
          <ol className="relative mt-6 space-y-3">
            {(Array.isArray(steps) ? steps : []).map((s, i) => (
              <li key={s} className="flex items-center gap-3 text-sm font-semibold">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold ${
                    i === 0 ? 'bg-white text-brand-700' : 'bg-white/15 text-white'
                  }`}
                  aria-hidden
                >
                  {i + 1}
                </span>
                <span className={i === 0 ? 'text-white' : 'text-white/75'}>{s}</span>
              </li>
            ))}
          </ol>
          {!hasCases && <p className="mt-6 text-xs font-semibold text-white/60">{t('portal.noCases')}</p>}
        </div>
        <form
          className="space-y-4 p-5 sm:p-8"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <div>
            <label htmlFor={professionId} className="label">
              {t('portal.profession')}
            </label>
            <input
              id={professionId}
              className="input"
              value={profession}
              onChange={(e) => setProfession(e.target.value)}
              placeholder={t('portal.professionPh')}
              required
              minLength={2}
              maxLength={120}
            />
            {defaultProfession && profession === defaultProfession && (
              <p className="mt-1.5 text-xs text-muted">{t('accountPage.dash.start.profileHint')}</p>
            )}
          </div>
          <div>
            <label htmlFor={visaId} className="label">
              {t('portal.visaType')}
            </label>
            <select id={visaId} className="input" value={visaCategoryId} onChange={(e) => setVisaCategoryId(e.target.value)}>
              <option value="">{t('portal.notSure')}</option>
              {categories.map((v) => (
                <option key={v.id} value={v.id}>
                  {tr(v.title)} ({v.visaLabel})
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto" disabled={busy || profession.trim().length < 2}>
            {busy ? <Spinner className="size-4" /> : <FilePlus2 className="size-4" aria-hidden />}
            {t('portal.create')}
          </button>
        </form>
      </div>
    </section>
  );
};

export default StartCase;
