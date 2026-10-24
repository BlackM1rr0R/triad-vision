import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, FileSignature, Pencil, Plus, Sparkles } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { PanelBodySkeleton } from '@/components/admin/case/TabSkeleton';
import { Spinner } from '@/components/ui/Spinner';
import { Panel } from '@/components/admin/ui';
import { fmtDate } from '@/components/admin/labels';
import { TONE_CLASS } from '@/components/ui/status';
import { useJobLabels } from '@/components/jobs/labels';
import { contentUrl } from '@/components/drive/api';
import { BLUE_CARD_TONE, CONTRACT_TYPES, contractWarningText, dateInput, toastPlacementError, type BlueCardCheck, type ContractType, type ContractWarning, type EmploymentContract } from './api';

registerCopy(pagesPlacement);

interface ContractResponse {
  contract: EmploymentContract | null;
  context: { blueCard: boolean; visaType: string; companyId: string | null; companyName: string | null };
}
interface Prefill {
  proposal: Partial<Record<'employerName' | 'jobTitle' | 'startDate' | 'endDate', string | null>> & {
    contractType: ContractType | null;
    grossMonthly: number | null;
    grossYearly: number | null;
    weeklyHours: number | null;
    vacationDays: number | null;
    probationMonths: number | null;
    driveNodeId: string | null;
  };
}

type Form = Record<
  'employerName' | 'jobTitle' | 'grossMonthly' | 'grossYearly' | 'weeklyHours' | 'vacationDays' | 'startDate' | 'endDate' | 'probationMonths' | 'probationEndsAt' | 'signedAt' | 'driveNodeId' | 'note',
  string
> & { contractType: ContractType };

const str = (v: number | string | null | undefined) => (v === null || v === undefined ? '' : String(v));

const formOf = (c: EmploymentContract | null, ctx: ContractResponse['context']): Form => ({
  employerName: c?.employerName ?? ctx.companyName ?? '',
  jobTitle: c?.jobTitle ?? '',
  contractType: c?.contractType ?? (ctx.visaType === 'AUSBILDUNG' ? 'AUSBILDUNG' : 'UNLIMITED'),
  grossMonthly: str(c?.grossMonthly),
  grossYearly: str(c?.grossYearly),
  weeklyHours: str(c?.weeklyHours),
  vacationDays: str(c?.vacationDays),
  startDate: dateInput(c?.startDate),
  endDate: dateInput(c?.endDate),
  probationMonths: str(c?.probationMonths),
  probationEndsAt: dateInput(c?.probationEndsAt),
  signedAt: dateInput(c?.signedAt),
  driveNodeId: c?.driveNodeId ?? '',
  note: c?.note ?? '',
});

const numOrNull = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')));

/** The warning badges of a contract (also used by the contracts list). */
export const ContractWarnings = ({ warnings, blueCardCheck, compact }: { warnings: ContractWarning[]; blueCardCheck?: BlueCardCheck | null; compact?: boolean }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap gap-1.5">
      {blueCardCheck && blueCardCheck !== 'NOT_APPLICABLE' && <span className={clsx('badge', BLUE_CARD_TONE[blueCardCheck])}>{t(`placement.contract.blueCard.${blueCardCheck}`)}</span>}
      {warnings.map((w) => (
        <span key={w.code} className={clsx('badge max-w-full whitespace-normal', w.severity === 'BLOCKER' ? TONE_CLASS.danger : TONE_CLASS.warning)} title={compact ? contractWarningText(w) : undefined}>
          <AlertTriangle className="mr-1 inline size-3" aria-hidden />
          {compact ? t(`placement.contract.warningShort.${w.code}`, { defaultValue: w.code }) : contractWarningText(w)}
        </span>
      ))}
    </div>
  );
};

/**
 * Case page (Sənədlər tab): the employment contract tracker — agreed terms, signature, file and the deterministic
 * checks (Blue Card thresholds from the case-AI settings, minimum wage, 48 h, 20 vacation days, probation ≤ 6 months,
 * fixed term needs an end). "Fill from AI check" copies the latest AI contract check into the form.
 */
export const EmploymentContractPanel = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const L = useJobLabels();
  const qc = useQueryClient();
  const key = ['employment-contract', caseId];
  const { data, isLoading } = useQuery({ queryKey: key, queryFn: async () => (await api.get<ContractResponse>(`/admin/placement/cases/${caseId}/contract`)).data });
  const [form, setForm] = useState<Form | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = useMutation({
    mutationFn: async (f: Form) =>
      (
        await api.put<{ contract: EmploymentContract }>(`/admin/placement/cases/${caseId}/contract`, {
          employerName: f.employerName.trim() || null,
          jobTitle: f.jobTitle.trim() || null,
          contractType: f.contractType,
          grossMonthly: numOrNull(f.grossMonthly),
          // Empty yearly gross is derived from the monthly one on the server.
          ...(f.grossYearly.trim() ? { grossYearly: numOrNull(f.grossYearly) } : {}),
          weeklyHours: numOrNull(f.weeklyHours),
          vacationDays: numOrNull(f.vacationDays),
          startDate: f.startDate || null,
          endDate: f.endDate || null,
          probationMonths: numOrNull(f.probationMonths),
          probationEndsAt: f.probationEndsAt || null,
          signedAt: f.signedAt || null,
          driveNodeId: f.driveNodeId.trim() || null,
          note: f.note.trim() || null,
        })
      ).data.contract,
    onSuccess: (contract) => {
      toast.success(t('placement.contract.saved'));
      qc.setQueryData<ContractResponse>(key, (old) => (old ? { ...old, contract } : old));
      void qc.invalidateQueries({ queryKey: ['employment-contracts'] });
      setForm(null);
    },
    onError: toastPlacementError,
  });
  const prefill = useMutation({
    mutationFn: async () => (await api.get<Prefill>(`/admin/placement/cases/${caseId}/contract/prefill`)).data,
    onSuccess: ({ proposal: p }) => {
      setForm((f) =>
        f
          ? {
              ...f,
              employerName: p.employerName ?? f.employerName,
              jobTitle: p.jobTitle ?? f.jobTitle,
              contractType: p.contractType ?? f.contractType,
              grossMonthly: p.grossMonthly != null ? String(p.grossMonthly) : f.grossMonthly,
              grossYearly: p.grossYearly != null ? String(p.grossYearly) : f.grossYearly,
              weeklyHours: p.weeklyHours != null ? String(p.weeklyHours) : f.weeklyHours,
              vacationDays: p.vacationDays != null ? String(p.vacationDays) : f.vacationDays,
              startDate: p.startDate ?? f.startDate,
              endDate: p.endDate ?? f.endDate,
              probationMonths: p.probationMonths != null ? String(p.probationMonths) : f.probationMonths,
              driveNodeId: p.driveNodeId ?? f.driveNodeId,
            }
          : f,
      );
      toast.info(t('placement.contract.prefilled'));
    },
    onError: (err) => (errorCode(err) === 'NO_CONTRACT_CHECK' ? toast.info(t('placement.contract.noPrefill')) : toastPlacementError(err)),
  });

  const c = data?.contract ?? null;
  const field = (k: keyof Form, type: 'text' | 'number' | 'date' = 'text', extra: { step?: string; hint?: string; max?: number } = {}) => (
    <div className="min-w-0">
      <label className="label" htmlFor={`ec-${k}`}>
        {t(`placement.contract.fields.${k}`)}
      </label>
      <input
        id={`ec-${k}`}
        type={type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        step={extra.step}
        min={type === 'number' ? 0 : undefined}
        max={extra.max}
        className="input"
        value={form![k] as string}
        onChange={(e) => set(k, e.target.value as never)}
      />
      {extra.hint && <p className="mt-1 text-[11px] text-muted">{extra.hint}</p>}
    </div>
  );

  return (
    <Panel
      id="case-employment"
      title={t('placement.contract.title')}
      icon={FileSignature}
      actions={
        data && !form ? (
          <button type="button" className="btn-secondary btn-sm" onClick={() => setForm(formOf(c, data.context))}>
            {c ? <Pencil className="size-3.5" /> : <Plus className="size-3.5" />} {c ? t('placement.contract.edit') : t('placement.contract.create')}
          </button>
        ) : undefined
      }
    >
      <p className="-mt-1 mb-3 text-xs text-muted">{t('placement.contract.subtitle')}</p>
      {isLoading || !data ? (
        <PanelBodySkeleton rows={3} />
      ) : form ? (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(form);
          }}
        >
          <div className="flex justify-end">
            <button type="button" className="btn-white btn-sm border border-line" disabled={prefill.isPending} onClick={() => prefill.mutate()}>
              {prefill.isPending ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5 text-violet-600" />} {t('placement.contract.prefill')}
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {field('employerName')}
            {field('jobTitle')}
            <div className="min-w-0">
              <label className="label" htmlFor="ec-type">
                {t('placement.contract.fields.contractType')}
              </label>
              <select id="ec-type" className="input" value={form.contractType} onChange={(e) => set('contractType', e.target.value as ContractType)}>
                {CONTRACT_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t(`placement.contract.types.${x}`)}
                  </option>
                ))}
              </select>
            </div>
            {field('signedAt', 'date')}
            {field('grossMonthly', 'number', { step: '0.01' })}
            {field('grossYearly', 'number', { step: '0.01', hint: t('placement.contract.yearlyAuto') })}
            {field('weeklyHours', 'number', { step: '0.5', max: 80 })}
            {field('vacationDays', 'number', { step: '1', max: 60 })}
            {field('startDate', 'date')}
            {field('endDate', 'date')}
            {field('probationMonths', 'number', { step: '1', max: 24 })}
            {field('probationEndsAt', 'date', { hint: t('placement.contract.probationAuto') })}
            {field('driveNodeId')}
          </div>
          <div>
            <label className="label" htmlFor="ec-note">
              {t('placement.contract.fields.note')}
            </label>
            <textarea id="ec-note" rows={2} maxLength={4000} className="input" value={form.note} onChange={(e) => set('note', e.target.value)} />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            <button type="button" className="btn-secondary btn-sm" onClick={() => setForm(null)}>
              {t('placement.contract.cancel')}
            </button>
            <button type="submit" className="btn-primary btn-sm" disabled={save.isPending}>
              {save.isPending && <Spinner className="size-3.5" />} {t('placement.contract.save')}
            </button>
          </div>
        </form>
      ) : !c ? (
        <p className="text-sm text-muted">{t('placement.contract.empty')}</p>
      ) : (
        <div className="space-y-3">
          {c.warnings.length || (c.blueCardCheck && c.blueCardCheck !== 'NOT_APPLICABLE') ? (
            <ContractWarnings warnings={c.warnings} blueCardCheck={c.blueCardCheck} />
          ) : (
            <p className={clsx('inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold', TONE_CLASS.success)}>
              <CheckCircle2 className="size-3.5" aria-hidden /> {t('placement.contract.noWarnings')}
            </p>
          )}
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
            {(
              [
                ['employerName', c.employerName],
                ['jobTitle', c.jobTitle],
                ['contractType', t(`placement.contract.types.${c.contractType}`)],
                ['grossMonthly', c.grossMonthly != null ? L.euro(c.grossMonthly) : null],
                ['grossYearly', c.grossYearly != null ? L.euro(c.grossYearly) : null],
                ['weeklyHours', c.weeklyHours],
                ['vacationDays', c.vacationDays],
                ['startDate', c.startDate ? fmtDate(c.startDate) : null],
                ['endDate', c.endDate ? fmtDate(c.endDate) : null],
                ['probationMonths', c.probationMonths],
                ['probationEndsAt', c.probationEndsAt ? fmtDate(c.probationEndsAt) : null],
                ['signedAt', c.signedAt ? fmtDate(c.signedAt) : t('placement.contract.notSigned')],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line/60 py-1">
                <dt className="text-xs text-muted">{t(`placement.contract.fields.${k}`)}</dt>
                <dd className="text-right font-medium text-navy-900 tabular-nums">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
          {c.driveNodeId && (
            <a href={contentUrl(c.driveNodeId)} target="_blank" rel="noopener noreferrer" className="inline-flex text-xs font-semibold text-brand-700 hover:underline">
              {t('placement.contract.openFile')}
            </a>
          )}
          {c.note && <p className="rounded-md bg-surface px-3 py-2 text-xs whitespace-pre-line text-ink/80">{c.note}</p>}
        </div>
      )}
    </Panel>
  );
};
