import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertOctagon, AlertTriangle, CheckCircle2, ClipboardList, Copy, FileSignature, Info, Quote } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { toastError } from '@/components/admin/labels';
import { copyText, findingTaskMessage, fmtDay, l10n, SEVERITY_STYLE, type ContractResult, type FindingTaskResponse, type ContractTerms, type Run, type Severity } from './api';

const ICON: Record<Severity, typeof Info> = { BLOCKER: AlertOctagon, WARNING: AlertTriangle, INFO: Info };

const LIGHT_STYLE = {
  GREEN: 'border-success-border bg-success-bg text-success-fg dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
  YELLOW: SEVERITY_STYLE.WARNING,
  RED: SEVERITY_STYLE.BLOCKER,
};
const DOT = { GREEN: 'bg-success', YELLOW: 'bg-warning', RED: 'bg-danger' };

/**
 * Traffic-light card of a contract check: the terms read from the contract, every rule issue in plain
 * language with the exact contract quote, and the one-click follow-ups. `onSendAnyway` is given where a
 * signature request can be started (case page, e-signature drawer).
 */
export const ContractView = ({ caseId, run, onSendAnyway, compact = false }: { caseId: string; run: Run<ContractResult>; onSendAnyway?: () => void; compact?: boolean }) => {
  const { t } = useTranslation();
  const r = run.result;
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const problems = r.issues.filter((i) => i.severity !== 'INFO').length;

  const task = async (target: 'employer' | 'contractIssue', key?: string) => {
    setBusy(`${target}:${key ?? ''}`);
    try {
      const res = await api.post<FindingTaskResponse>(`/admin/cases/${caseId}/ai/tasks`, { runId: run.id, target, key });
      toast.success(findingTaskMessage(t, res.data));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const copyEmail = async () => {
    const ok = await copyText(`${r.email.subject}\n\n${r.email.body}`);
    if (ok) toast.success(t('aiCase.actions.copied'));
  };

  const sendAnyway = async () => {
    setBusy('send');
    try {
      await api.post(`/admin/cases/${caseId}/ai/contract/${run.id}/override`, {});
      setConfirmSend(false);
      onSendAnyway?.();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const term = (k: keyof ContractTerms): string => {
    const v = r.terms[k];
    if (v === null || v === undefined) return '';
    if (k === 'employer' || k === 'employee') return [(v as { name: string | null }).name, (v as { address: string | null }).address].filter(Boolean).join(', ');
    if (k === 'startDate' || k === 'endDate') return fmtDay(v as string);
    if (k === 'contractType') return t(`aiCase.contract.type.${v as string}`);
    if (k === 'grossMonthlySalary') return `${(v as number).toLocaleString('de-DE')} €`;
    if (k === 'probationMonths') return t('aiCase.contract.months', { n: v });
    if (k === 'vacationDays') return t('aiCase.contract.days', { n: v });
    return String(v);
  };
  const TERMS: (keyof ContractTerms)[] = ['employer', 'employee', 'position', 'startDate', 'endDate', 'contractType', 'grossMonthlySalary', 'weeklyHours', 'probationMonths', 'vacationDays', 'placeOfWork', 'noticePeriod', 'collectiveAgreement'];

  return (
    <div className="space-y-3">
      <div className={clsx('flex flex-wrap items-center gap-3 rounded-lg border px-3.5 py-3', LIGHT_STYLE[r.light])}>
        <span className="flex gap-1" aria-hidden>
          {(['RED', 'YELLOW', 'GREEN'] as const).map((l) => (
            <span key={l} className={clsx('size-3 rounded-full', l === r.light ? DOT[l] : 'bg-black/10 dark:bg-white/15')} />
          ))}
        </span>
        <span className="min-w-0 flex-1 text-sm font-semibold">{t(`aiCase.contract.light.${r.light}`)}</span>
        <span className="min-w-0 truncate text-xs opacity-80">{t('aiCase.contract.file', { name: r.file.name })}</span>
      </div>
      {!r.file.textLayer && <p className="text-xs text-muted">{t('aiCase.contract.scan')}</p>}

      {!!r.issues.length && (
        <ul className="space-y-2">
          {r.issues.map((i) => {
            const I = ICON[i.severity];
            return (
              <li key={i.code} className={clsx('rounded-lg border px-3.5 py-3', SEVERITY_STYLE[i.severity])}>
                <div className="flex items-start gap-2.5">
                  <I className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold tracking-wide uppercase opacity-80">{t(`aiCase.severity.${i.severity}`)}</p>
                    <p className="mt-0.5 text-sm font-medium break-words text-ink">{l10n(i.message)}</p>
                    {i.quote && (
                      <blockquote className="mt-1.5 flex gap-1.5 rounded-md bg-white/70 px-2.5 py-1.5 text-xs text-ink/80 italic dark:bg-black/20">
                        <Quote className="mt-0.5 size-3 shrink-0" aria-hidden />
                        <span className="min-w-0 break-words">
                          „{i.quote}“{!i.quoteVerified && r.file.textLayer && <span className="ml-1 not-italic opacity-70">({t('aiCase.contract.quoteUnverified')})</span>}
                        </span>
                      </blockquote>
                    )}
                    {!compact && i.severity !== 'INFO' && (
                      <button type="button" className="btn-secondary btn-sm mt-2 border border-line" disabled={!!busy} onClick={() => void task('contractIssue', i.code)}>
                        {busy === `contractIssue:${i.code}` ? <Spinner className="size-3.5" /> : <ClipboardList className="size-3.5" aria-hidden />} {t('aiCase.actions.task')}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="flex flex-wrap gap-1.5">
        {onSendAnyway && (
          <button type="button" className={problems ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'} disabled={!!busy} onClick={() => (problems ? setConfirmSend(true) : onSendAnyway())}>
            <FileSignature className="size-3.5" aria-hidden /> {problems ? t('aiCase.contract.sendAnyway') : t('aiCase.contract.send')}
          </button>
        )}
        {problems > 0 && (
          <>
            <button type="button" className="btn-secondary btn-sm" disabled={!!busy} onClick={() => void task('employer')}>
              {busy === 'employer:' ? <Spinner className="size-3.5" /> : <ClipboardList className="size-3.5" aria-hidden />} {t('aiCase.contract.employerTask')}
            </button>
            <button type="button" className="btn-secondary btn-sm" onClick={() => void copyEmail()}>
              <Copy className="size-3.5" aria-hidden /> {t('aiCase.contract.copyEmail')}
            </button>
          </>
        )}
      </div>

      {!compact && (
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-semibold text-ink">{t('aiCase.contract.terms')}</summary>
          <dl className="grid gap-x-4 gap-y-1.5 border-t border-line px-3.5 py-3 text-sm sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
            {TERMS.map((k) => (
              <div key={k} className="contents">
                <dt className="text-xs text-muted">{t(`aiCase.contract.term.${k}`)}</dt>
                <dd className="min-w-0 break-words text-ink">{term(k) || '—'}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
      {!compact && problems > 0 && (
        <details className="rounded-lg border border-line">
          <summary className="cursor-pointer px-3.5 py-2.5 text-sm font-semibold text-ink">{t('aiCase.contract.email')}</summary>
          <pre className="max-h-72 overflow-auto border-t border-line px-3.5 py-3 font-sans text-xs whitespace-pre-wrap text-ink">
            {r.email.to ? `${r.email.to}\n` : ''}
            {r.email.subject}
            {'\n\n'}
            {r.email.body}
          </pre>
        </details>
      )}
      {r.issues.length === 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted">
          <CheckCircle2 className="size-3.5 text-success-fg" aria-hidden /> {t('aiCase.contract.light.GREEN')}
        </p>
      )}

      <ConfirmDialog
        open={confirmSend}
        onClose={() => setConfirmSend(false)}
        onConfirm={() => void sendAnyway()}
        loading={busy === 'send'}
        title={t('aiCase.contract.sendAnywayTitle')}
        message={t('aiCase.contract.sendAnywayBody', { count: problems })}
        confirmLabel={t('aiCase.contract.sendAnyway')}
      />
    </div>
  );
};
