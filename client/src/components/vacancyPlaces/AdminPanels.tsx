import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { ShieldCheck, Users } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { hasMinRole } from '@/lib/types';
import { Switch } from '@/components/ui/Switch';
import { Spinner } from '@/components/ui/Spinner';
import { Panel } from '@/components/admin/ui';
import { registerCopy } from '@/i18n';
import { pagesVacancyPlaces } from '@/i18n/pagesVacancyPlaces';
import { POLICY_KEY, type ApplicationPolicy, type Places } from './api';
import { PlacesBadge } from './PlacesBadge';

registerCopy(pagesVacancyPlaces);

/**
 * Admin › Vacancies: "Clients can only apply to active vacancies" and "Allow applications to external Germany job
 * listings" (server lib/vacancyPlaces/policy.ts). Everyone on staff sees the rules; ADMIN+ can change them.
 */
export const ApplicationPolicyPanel = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canEdit = hasMinRole(useAuth().user?.role, 'ADMIN');
  const { data } = useQuery({
    queryKey: ['admin-vacancy-policy'],
    queryFn: async () => (await api.get<{ policy: ApplicationPolicy }>('/admin/vacancies/policy')).data.policy,
  });
  const save = useMutation({
    mutationFn: async (patch: Partial<ApplicationPolicy>) => (await api.put<{ policy: ApplicationPolicy }>('/admin/vacancies/policy', patch)).data.policy,
    onSuccess: (policy) => {
      qc.setQueryData(['admin-vacancy-policy'], policy);
      void qc.invalidateQueries({ queryKey: POLICY_KEY });
      toast.success(t('vacPlaces.admin.saved'));
    },
    onError: (err) => toast.error(errorCode(err)),
  });
  return (
    <Panel title={t('vacPlaces.admin.policyTitle')} icon={ShieldCheck} className={className}>
      {!data ? (
        <Spinner className="size-5 text-link" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Switch
            checked={data.clientsOnlyActiveVacancies}
            onChange={(v) => save.mutate({ clientsOnlyActiveVacancies: v })}
            label={t('vacPlaces.admin.onlyActive')}
            hint={t('vacPlaces.admin.onlyActiveHint')}
            showLabel
            disabled={!canEdit || save.isPending}
          />
          {/* "Apply via Triad Vision" for external listings is retired (the candidate applies directly): no switch. */}
        </div>
      )}
    </Panel>
  );
};

/**
 * Admin › vacancy drawer: places taken / free and the manual correction (filledAdjustment). The number of places
 * itself is edited in the vacancy form.
 */
export const VacancyPlacesPanel = ({ vacancyId, places, adjustment, onSaved }: { vacancyId: string; places: Places; adjustment: number; onSaved: () => void }) => {
  const { t } = useTranslation();
  const [value, setValue] = useState(String(adjustment));
  const save = useMutation({
    mutationFn: () => api.patch(`/admin/vacancies/${vacancyId}`, { filledAdjustment: Number(value) || 0 }),
    onSuccess: () => {
      toast.success(t('jobsArea.admin.saved'));
      onSaved();
    },
    onError: (err) => toast.error(errorCode(err)),
  });
  return (
    <Panel title={t('vacPlaces.admin.placesTitle')} icon={Users}>
      <dl className="grid grid-cols-3 gap-3 text-center">
        {(
          [
            ['positions', places.positions],
            ['filled', places.filled ?? 0],
            ['free', places.free ?? places.positions],
          ] as const
        ).map(([k, n]) => (
          <div key={k} className="rounded-xl bg-sunken p-3">
            <dt className="text-xs text-muted">{t(`vacPlaces.admin.${k}`)}</dt>
            <dd className="font-display text-xl font-semibold text-ink tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3">
        <PlacesBadge v={places} />
      </div>
      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <label className="label" htmlFor={`adj-${vacancyId}`}>
            {t('vacPlaces.admin.adjustment')}
          </label>
          <input
            id={`adj-${vacancyId}`}
            type="number"
            min={-500}
            max={500}
            step={1}
            inputMode="numeric"
            className="input w-28"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-describedby={`adj-${vacancyId}-hint`}
          />
        </div>
        <button type="submit" className="btn-secondary" disabled={save.isPending || Number(value) === adjustment}>
          {save.isPending && <Spinner className="size-4" />} {t('vacPlaces.admin.save')}
        </button>
      </form>
      <p id={`adj-${vacancyId}-hint`} className="mt-2 text-xs leading-relaxed text-muted">
        {t('vacPlaces.admin.adjustmentHint')}
      </p>
    </Panel>
  );
};
