import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { AlertTriangle, ArrowRight, CheckCircle2, Compass, FileStack, ListTodo, Loader2, MessageSquareText, Send, Sparkles } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { Panel } from '@/components/admin/ui';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { toastError } from '@/components/admin/labels';
import { useCaseRefresh } from '@/components/admin/case/shared';
import { reasonText } from '@/components/aiCase/api';
import { ReviewDrawer } from './ReviewDrawer';
import {
  fetchNextStep,
  fetchNextStepAi,
  nextStepAiKey,
  nextStepKey,
  openPackage,
  ruleText,
  runCall,
  scrollToSection,
  TONE_STYLE,
  type NextAction,
  type NextStep,
} from './api';

const ICON: Partial<Record<NextAction['kind'], typeof Send>> = { message: MessageSquareText, task: ListTodo, package: FileStack, review: CheckCircle2, request: Send };

/**
 * "Next step" card at the top of the admin case page: 1–3 actions from the deterministic rules, each a button
 * that runs through an existing endpoint; the AI adds a short explanation and a client message draft.
 */
export const NextStepCard = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const qc = useQueryClient();
  const refreshCase = useCaseRefresh(c.id);
  // Re-evaluated whenever the case changes (status, documents, events).
  const version = `${c.status}:${c.events[0]?.id ?? ''}:${c.requirements.reduce((a, r) => a + r.documents.map((d) => d.status[0]).join(''), '')}:${c.messages.length}`;
  const { data, isLoading } = useQuery({ queryKey: [...nextStepKey(c.id), version], queryFn: () => fetchNextStep(c.id), staleTime: 15_000 });
  const ai = useQuery({ queryKey: nextStepAiKey(c.id, data ? `${data.status}:${data.steps.map((s) => `${s.code}${JSON.stringify(s.params)}`).join('|')}` : ''), queryFn: () => fetchNextStepAi(c.id), enabled: !!data && data.steps.length > 0, staleTime: 10 * 60_000, retry: false });

  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ step: NextStep; action: Extract<NextAction, { kind: 'transition' }> } | null>(null);
  const [review, setReview] = useState<string[] | null>(null);
  const [message, setMessage] = useState<{ action: Extract<NextAction, { kind: 'message' }>; body: string; source: 'ai' | 'rules'; where: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  // The message editor starts from the AI draft (top step) when there is one, else from the step's template.
  useEffect(() => setMessage(null), [data?.generatedAt]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: nextStepKey(c.id) });
    void refreshCase();
  };

  const runAction = async (step: NextStep, a: NextAction) => {
    const key = `${step.code}:${a.id}`;
    if (a.kind === 'review') return setReview(a.documentIds);
    if (a.kind === 'package') return openPackage(c.id);
    if (a.kind === 'scroll') return scrollToSection(a.target);
    if (a.kind === 'transition') return setConfirm({ step, action: a });
    if (a.kind === 'message') {
      const aiDraft = step === data?.steps[0] && ai.data?.draft ? ai.data.draft.body : null;
      return setMessage({ action: a, body: aiDraft ?? a.draft, source: aiDraft ? 'ai' : 'rules', where: step.code });
    }
    setBusy(key);
    try {
      if (a.kind === 'request') {
        const res = await runCall<{ requested: unknown[] }>(a.request);
        toast.success(t('caseNext.card.requested', { count: res.requested.length }));
      } else if (a.kind === 'task') {
        const res = await runCall<{ task: { number: number } }>(a.request);
        toast.success(t('caseNext.card.taskCreated', { key: `T-${String(res.task.number).padStart(4, '0')}` }));
        void qc.invalidateQueries({ queryKey: ['tasks'] });
      }
      refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const sendMessage = async () => {
    if (!message) return;
    setBusy('message');
    try {
      await runCall(message.action.request, { body: message.body.trim() });
      toast.success(t('caseNext.card.sent'));
      setMessage(null);
      refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  const doTransition = async () => {
    if (!confirm) return;
    setBusy('transition');
    try {
      await runCall(confirm.action.request);
      toast.success(t('caseNext.card.done'));
      setConfirm(null);
      refresh();
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || !data) return null;
  const steps = data.steps;
  const visible = showAll ? [...steps, ...data.rest] : steps;
  // The AI draft can always be sent as a plain case message, also when the top step needs nothing from the client.
  const topHasMessage = !!steps[0]?.actions.some((a) => a.kind === 'message');
  const openAiDraft = () =>
    ai.data?.draft &&
    setMessage({
      action: { id: 'SEND_MESSAGE', kind: 'message', request: { method: 'POST', path: `/admin/cases/${c.id}/messages`, body: {} }, draft: ai.data.draft.body, locale: ai.data.draft.locale },
      body: ai.data.draft.body,
      source: 'ai',
      where: 'ai',
    });
  const editor = message && (
    <div className="mt-3 rounded-lg bg-white p-3 text-ink dark:bg-card">
      <label htmlFor="next-msg" className="label flex flex-wrap items-center justify-between gap-2">
        <span>{t('caseNext.card.draftTitle', { lang: t(`caseNext.card.lang.${message.action.locale}`) })}</span>
        <span className="text-[11px] font-normal text-muted">{message.source === 'ai' ? t('caseNext.card.draftAi') : t('caseNext.card.draftRules')}</span>
      </label>
      <textarea id="next-msg" className="input min-h-40 text-sm" value={message.body} onChange={(e) => setMessage({ ...message, body: e.target.value })} />
      <div className="mt-2 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={() => setMessage(null)} disabled={busy === 'message'}>
          {t('admin.common.cancel')}
        </button>
        <button type="button" className="btn-primary btn-sm" disabled={busy === 'message' || !message.body.trim()} onClick={() => void sendMessage()}>
          {busy === 'message' ? <Spinner className="size-3.5" /> : <Send className="size-3.5" aria-hidden />} {t('caseNext.card.send')}
        </button>
      </div>
    </div>
  );

  return (
    <Panel title={t('caseNext.card.title')} icon={Compass} id="case-next-step" bodyClassName="p-4 sm:p-5">
      {!steps.length ? (
        <p className="flex items-center gap-2 text-sm text-muted">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> {t('caseNext.card.nothing')}
        </p>
      ) : (
        <div className="space-y-4">
          {/* AI explanation (optional) */}
          <div aria-live="polite" className="min-h-0">
            {ai.isLoading ? (
              <p className="flex items-center gap-2 text-xs text-muted">
                <Loader2 className="size-3.5 animate-spin" aria-hidden /> {t('caseNext.card.aiLoading')}
              </p>
            ) : ai.data?.explanation ? (
              <div className="rounded-lg bg-surface px-3 py-2.5 text-sm text-ink/85">
                <p className="flex items-start gap-2">
                  <Sparkles className="mt-0.5 size-3.5 shrink-0 text-brand-600" aria-hidden />
                  <span>{ai.data.explanation}</span>
                </p>
                {ai.data.risk && (
                  <p className="mt-1.5 flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                    <span>
                      <span className="font-semibold">{t('caseNext.card.risk')}:</span> {ai.data.risk}
                    </span>
                  </p>
                )}
                {ai.data.draft && !topHasMessage && message?.where !== 'ai' && (
                  <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline" onClick={openAiDraft}>
                    <MessageSquareText className="size-3.5" aria-hidden /> {t('caseNext.card.draftTitle', { lang: t(`caseNext.card.lang.${ai.data.draft.locale}`) })}
                  </button>
                )}
                {message?.where === 'ai' && editor}
              </div>
            ) : ai.data?.ai.status === 'skipped' && ai.data.ai.reason ? (
              <p className="text-[11px] text-muted">{t('caseNext.card.aiUnavailable', { reason: reasonText(t, ai.data.ai.reason) })}</p>
            ) : null}
          </div>

          <ol className="space-y-3">
            {visible.map((s, i) => (
              <li key={s.code} className={clsx('rounded-xl p-3 ring-1 sm:p-4', TONE_STYLE[s.tone])}>
                <p className="flex items-start gap-2 text-sm font-semibold">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-white/70 text-[11px] tabular-nums dark:bg-white/10">{i + 1}</span>
                  <span className="min-w-0">{ruleText(t, s)}</span>
                </p>
                {s.items.length > 0 && <p className="mt-1 pl-7 text-xs opacity-80">{s.items.slice(0, 5).map((x) => tr(x)).join(' · ')}{s.items.length > 5 ? ' …' : ''}</p>}
                <div className="mt-3 flex flex-wrap gap-2 pl-7">
                  {s.actions.map((a, ai2) => {
                    const I = ICON[a.kind] ?? ArrowRight;
                    const key = `${s.code}:${a.id}`;
                    return (
                      <button
                        key={`${a.id}-${ai2}`}
                        type="button"
                        className={ai2 === 0 ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                        disabled={!!busy}
                        onClick={() => void runAction(s, a)}
                      >
                        {busy === key ? <Spinner className="size-3.5" /> : <I className="size-3.5" aria-hidden />}
                        {t(`caseNext.action.${a.id}`, { defaultValue: a.id })}
                      </button>
                    );
                  })}
                </div>
                {message?.where === s.code && editor}
              </li>
            ))}
          </ol>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
            <span>{data.typicalDays > 0 ? t('caseNext.card.inStatus', { days: data.daysInStatus, typical: data.typicalDays }) : ''}</span>
            {data.rest.length > 0 && (
              <button type="button" className="font-semibold text-brand-700 hover:underline" onClick={() => setShowAll((v) => !v)}>
                {showAll ? t('caseNext.card.showLess') : t('caseNext.card.more', { count: data.rest.length })}
              </button>
            )}
          </div>
        </div>
      )}

      {review && <ReviewDrawer open onClose={() => setReview(null)} c={c} documentIds={review} onChanged={refresh} />}
      <ConfirmDialog
        open={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={() => void doTransition()}
        title={t('caseNext.confirm.title')}
        tone="primary"
        loading={busy === 'transition'}
        confirmLabel={confirm ? t(`caseNext.action.${confirm.action.id}`) : undefined}
        message={confirm ? t(`caseNext.confirm.${confirm.action.id}`, { defaultValue: ruleText(t, confirm.step) }) : undefined}
      >
        {confirm?.action.note && <pre className="max-h-48 overflow-auto rounded-lg bg-surface p-3 text-xs whitespace-pre-wrap">{confirm.action.note}</pre>}
      </ConfirmDialog>
    </Panel>
  );
};

export default NextStepCard;
