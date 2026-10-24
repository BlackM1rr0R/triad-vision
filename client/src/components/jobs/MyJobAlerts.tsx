import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { BellRing, Plus, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import { optimistic } from '@/lib/optimistic';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesDiscover } from '@/i18n/pagesDiscover';
import { ProfessionPicker, useAlertOptions } from './JobAlertForm';

registerCopy(pagesDiscover);

interface MyAlert {
  id: string;
  professions: string[];
  germanLevel: string | null;
  kinds: string[];
  sentCount: number;
}
interface MineResponse {
  items: MyAlert[];
  suggested: { profession: string | null; germanLevel: string | null };
  emailNotifications: boolean;
}

/**
 * Job alerts of the signed-in client (profile → notifications): no double opt-in (the account e-mail is
 * verified), the profile's profession preselected; digests respect the e-mail notification switch.
 */
export const MyJobAlerts = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: options } = useAlertOptions();
  const { data } = useQuery({ queryKey: ['my-job-alerts'], queryFn: async () => (await api.get<MineResponse>('/job-alerts/mine')).data });
  const [adding, setAdding] = useState(false);
  const [professions, setProfessions] = useState<string[]>([]);
  const [germanLevel, setGermanLevel] = useState('');

  useEffect(() => {
    if (!adding || !data) return;
    setProfessions(data.suggested.profession ? [data.suggested.profession] : []);
    setGermanLevel(data.suggested.germanLevel && ['none', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2'].includes(data.suggested.germanLevel) ? data.suggested.germanLevel : '');
  }, [adding, data]);

  const label = (key: string) => options?.professions.find((p) => p.key === key)?.label ?? key;

  const create = useMutation({
    mutationFn: async () => (await api.post('/job-alerts/mine', { professions, germanLevel: germanLevel || null, lng: currentSiteLocale() })).data,
    onSuccess: () => {
      toast.success(t('discover.alerts.mine.created'));
      setAdding(false);
      void qc.invalidateQueries({ queryKey: ['my-job-alerts'] });
    },
    onError: (err) => toast.error(errorCode(err) === 'TOO_MANY_ALERTS' ? t('discover.alerts.tooMany') : t('discover.alerts.error')),
  });
  // Optimistic: the alert disappears at once and comes back if the server refuses.
  const remove = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/job-alerts/mine/${id}`)).data,
    ...optimistic<MineResponse, string>(qc, {
      key: ['my-job-alerts'],
      update: (prev, id) => prev && { ...prev, items: prev.items.filter((a) => a.id !== id) },
      onError: () => toast.error(t('discover.alerts.error')),
    }),
    onSuccess: () => toast.success(t('discover.alerts.mine.removed')),
  });

  return (
    <section className={clsx('card card-pad', className)} aria-labelledby="my-job-alerts-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600" aria-hidden>
            <BellRing className="size-5" />
          </span>
          <div>
            <h2 id="my-job-alerts-title" className="font-display text-lg font-bold text-navy-900">
              {t('discover.alerts.mine.title')}
            </h2>
            <p className="mt-0.5 text-sm text-muted">{t('discover.alerts.mine.text')}</p>
          </div>
        </div>
        {!adding && (
          <button type="button" className="btn-outline btn-sm" onClick={() => setAdding(true)}>
            <Plus className="size-4" aria-hidden /> {t('discover.alerts.mine.add')}
          </button>
        )}
      </div>

      {data && !data.emailNotifications && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{t('discover.alerts.mine.notificationsOff')}</p>}

      {data && data.items.length === 0 && !adding && <p className="mt-4 text-sm text-muted">{t('discover.alerts.mine.empty')}</p>}

      {data && data.items.length > 0 && (
        <ul className="mt-4 divide-y divide-line rounded-xl border border-line">
          {data.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center justify-between gap-3 p-3.5">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-navy-900">{a.professions.map(label).join(', ')}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {[a.germanLevel, ...a.kinds.map((k) => t(`discover.alerts.kind.${k}`)), t('discover.alerts.mine.sent', { count: a.sentCount })].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button type="button" className="btn-ghost btn-sm text-red-700" disabled={remove.isPending} onClick={() => remove.mutate(a.id)}>
                <Trash2 className="size-4" aria-hidden /> {t('discover.alerts.mine.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {adding && options && (
        <form
          className="mt-5 space-y-4 rounded-xl border border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!professions.length) return void toast.error(t('discover.alerts.pickProfession'));
            create.mutate();
          }}
        >
          <ProfessionPicker options={options.professions} value={professions} onChange={setProfessions} legend={t('discover.alerts.professions')} hint={t('discover.alerts.professionsHint')} />
          <div className="max-w-xs">
            <label htmlFor="my-alert-de" className="label">
              {t('discover.alerts.german')}
            </label>
            <select id="my-alert-de" className="input" value={germanLevel} onChange={(e) => setGermanLevel(e.target.value)}>
              <option value="">{t('discover.alerts.germanAny')}</option>
              {options.germanLevels.map((l) => (
                <option key={l} value={l}>
                  {l === 'none' ? t('discover.compare.questions.german.options.none') : l}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="btn-primary btn-sm" disabled={create.isPending}>
              {t('discover.alerts.submit')}
            </button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setAdding(false)}>
              {t('discover.compare.wizard.back')}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
