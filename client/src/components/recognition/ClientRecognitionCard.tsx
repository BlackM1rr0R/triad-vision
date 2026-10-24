import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, CircleDashed, GraduationCap } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesRecognition } from '@/i18n/pagesRecognition';
import { Card } from '@/components/ui/Card';
import { TONE_CLASS } from '@/components/ui/status';
import { STATUS_TONE, type CheckKey, type ProcedureType, type ProcessStatus } from './api';

registerCopy(pagesRecognition);

// GET /api/account/recognition/cases/:caseId (server lib/recognition/service.ts clientRecognition)
interface ClientProcess {
  id: string;
  procedureType: ProcedureType;
  profession: string;
  authority: string | null;
  status: ProcessStatus;
  submittedAt: string | null;
  decisionAt: string | null;
  adaptationMeasure: string | null;
  adaptationUntil: string | null;
  deficitNotes: string | null;
  progress: { done: number; total: number };
  clientTodo: { key: CheckKey; optional: boolean }[];
  timeline: { status: ProcessStatus | null; at: string }[];
}

/**
 * Client portal case page (overview, #recognition): read-only status of the recognition of the client's
 * qualification — procedure, authority, steps, deficits / adaptation measure and the documents we still
 * need from the client. Renders nothing when the case has no recognition procedure.
 */
export const ClientRecognitionCard = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const q = useQuery({ queryKey: ['account-recognition', caseId], queryFn: async () => (await api.get<{ items: ClientProcess[] }>(`/account/recognition/cases/${caseId}`)).data.items });
  const items = q.data ?? [];
  if (!items.length) return null;
  const day = (iso: string) => date(iso, { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div id="recognition" className="scroll-mt-40">
      <Card title={t('recognition.portal.title')} subtitle={t('recognition.portal.hint')} icon={GraduationCap}>
        <div className="space-y-5">
          {items.map((p) => (
            <section key={p.id} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-navy-900">{t(`recognition.procedure.${p.procedureType}`)}</h3>
                <span className={clsx('badge', TONE_CLASS[STATUS_TONE[p.status]])}>{t(`recognition.status.${p.status}`)}</span>
              </div>
              <p className="text-xs text-muted">
                {[p.profession, p.authority, p.submittedAt ? t('recognition.portal.submitted', { date: day(p.submittedAt) }) : null, p.decisionAt ? t('recognition.portal.decision', { date: day(p.decisionAt) }) : null].filter(Boolean).join(' · ')}
              </p>
              {p.timeline.length > 1 && (
                <ol className="flex flex-wrap gap-1.5" aria-label={t('recognition.portal.timeline')}>
                  {p.timeline.map((e, i) => (
                    <li key={`${e.status}-${i}`} className="badge bg-surface text-ink/80">
                      {e.status ? t(`recognition.status.${e.status}`) : '—'} · {day(e.at)}
                    </li>
                  ))}
                </ol>
              )}
              {p.deficitNotes && (
                <div className="rounded-xl bg-warning-bg/60 px-3 py-2 text-xs text-warning-fg">
                  <p className="font-semibold">{t('recognition.portal.deficits')}</p>
                  <p className="mt-0.5 whitespace-pre-line">{p.deficitNotes}</p>
                  {p.adaptationMeasure && (
                    <p className="mt-1">
                      {t('recognition.portal.measure')}: {t(`recognition.measure.${p.adaptationMeasure}`)}
                      {p.adaptationUntil ? ` · ${t('recognition.portal.until', { date: day(p.adaptationUntil) })}` : ''}
                    </p>
                  )}
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-navy-900">
                  {t('recognition.portal.todo')} <span className="font-normal text-muted tabular-nums">· {t('recognition.portal.progress', p.progress)}</span>
                </p>
                {p.clientTodo.length === 0 ? (
                  <p className="mt-1 flex items-center gap-1.5 text-xs text-success-fg">
                    <CheckCircle2 className="size-3.5" aria-hidden /> {t('recognition.portal.todoNone')}
                  </p>
                ) : (
                  <ul className="mt-1 space-y-1">
                    {p.clientTodo.map((i) => (
                      <li key={i.key} className="flex items-center gap-1.5 text-sm text-ink">
                        <CircleDashed className="size-3.5 text-warning-fg" aria-hidden /> {t(`recognition.check.${i.key}`)}
                        {i.optional && <span className="text-[11px] text-muted">({t('recognition.checklist.optional')})</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          ))}
        </div>
      </Card>
    </div>
  );
};

export default ClientRecognitionCard;
