import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Briefcase, ChevronDown, ChevronUp, Inbox, MailCheck, RefreshCw, RotateCcw, ShieldAlert, Sparkles, UserPlus, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Popover } from '@/components/tasks/bits';
import type { MessageDetail } from '@/components/mail/types';
import { aiMailError, aiMailKeys, useStaffOptions, useTriage, useTriageStatus, type Triage } from './api';
import { CategoryChip, UrgencyChip } from './TriageChips';

const LANG_LABEL: Record<string, string> = { az: 'AZ', de: 'DE', en: 'EN', ru: 'RU', other: '—' };

const ActionBtn = ({ onClick, children, disabled, title, primary, busy }: { onClick: () => void; children: ReactNode; disabled?: boolean; title?: string; primary?: boolean; busy?: boolean }) => (
  // The wrapper carries the tooltip: disabled buttons do not show their own title in every browser.
  <span title={title} className="inline-flex">
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      className={clsx(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50',
        primary ? 'border-brand-600 bg-brand-600 text-white hover:bg-brand-700' : 'border-line bg-card text-ink hover:border-brand-400 hover:bg-brand-50',
      )}
    >
      {busy && <Spinner className="size-3" />}
      {children}
    </button>
  </span>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 gap-2 text-xs">
    <dt className="w-24 shrink-0 text-muted">{label}</dt>
    <dd className="min-w-0 flex-1 break-words text-ink">{children}</dd>
  </div>
);

/**
 * AI card at the top of a message in the workspace mail reading pane: chips, summary, extracted
 * contact, client match and one-click actions. No prompts: the analysis runs automatically (or on
 * one click) and every action is a button.
 */
export const TriageCard = ({ message, onUseDraft, onSpam }: { message: MessageDetail; onUseDraft: (draft: { subject: string; body: string }) => void; onSpam: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useTriage(message.id);
  const status = useTriageStatus();
  const [assignOpen, setAssignOpen] = useState(false);
  const [staffId, setStaffId] = useState('');
  const [draftOpen, setDraftOpen] = useState(false);
  const staff = useStaffOptions(assignOpen);
  useEffect(() => {
    setAssignOpen(false);
    setDraftOpen(false);
  }, [message.id]);

  const triage = q.data?.triage ?? null;
  const unavailable = status.data && !status.data.available ? (status.data.message ?? t('aiMail.card.unavailable')) : null;

  const store = (next: Triage | null) => {
    qc.setQueryData(aiMailKeys.triage(message.id), (old: { triage: Triage | null; autoMailbox: boolean } | undefined) => ({ autoMailbox: old?.autoMailbox ?? false, triage: next }));
    void qc.invalidateQueries({ queryKey: ['mail', 'list'] });
    void qc.invalidateQueries({ queryKey: aiMailKeys.today });
  };

  const post = useMutation({
    mutationFn: async (v: { path: string; body?: unknown }) => (await api.post<{ triage: Triage | null; taskNumber?: number | null; created?: boolean }>(`/ai-mail/messages/${message.id}/${v.path}`, v.body ?? {})).data,
    onError: (err) => {
      toast.error(aiMailError(t, err));
      void qc.invalidateQueries({ queryKey: aiMailKeys.status });
      void q.refetch();
    },
  });
  const run = (path: string, body: unknown, done?: (r: { triage: Triage | null; taskNumber?: number | null; created?: boolean }) => void) =>
    post.mutate(
      { path, body },
      {
        onSuccess: (r) => {
          store(r.triage);
          done?.(r);
        },
      },
    );
  const busy = (path: string) => post.isPending && post.variables?.path === path;

  const analyzeBtn = (refresh: boolean) => (
    <ActionBtn primary={!refresh} onClick={() => run('analyze', refresh ? { refresh: true } : {})} disabled={!!unavailable} title={unavailable ?? undefined} busy={busy('analyze')}>
      {refresh ? <RefreshCw className="size-3.5" aria-hidden /> : <Sparkles className="size-3.5" aria-hidden />}
      {busy('analyze') ? t('aiMail.card.analyzing') : refresh ? t('aiMail.card.again') : t('aiMail.card.analyze')}
    </ActionBtn>
  );

  if (message.isDraft || message.folderRole === 'SENT' || message.folderRole === 'DRAFTS') return null;
  if (q.isLoading) return null;
  if (q.isError) return null;

  const shell = (children: ReactNode, tone = 'border-line') => (
    <section className={clsx('mx-4 mb-3 rounded-xl border bg-card p-3', tone)} aria-label={t('aiMail.card.title')}>
      {children}
    </section>
  );

  // ─── Not analysed / skipped / failed / running ───
  if (!triage || triage.status === 'SKIPPED' || triage.status === 'FAILED' || triage.status === 'PENDING') {
    const line =
      triage?.status === 'PENDING'
        ? t('aiMail.card.pending')
        : triage?.status === 'SKIPPED' && triage.skipReason
          ? t(`aiMail.card.skipped.${triage.skipReason}`)
          : triage?.status === 'FAILED'
            ? `${t('aiMail.card.failed')}${triage.errorMessage ? ` ${triage.errorMessage}` : triage.error && ['TIMEOUT', 'UPSTREAM', 'BAD_OUTPUT'].includes(triage.error) ? ` ${t(`aiMail.errors.${triage.error}`)}` : ''}`
            : q.data?.autoMailbox
              ? t('aiMail.card.notAnalysed')
              : t('aiMail.card.notAuto');
    return shell(
      <div className="flex flex-wrap items-center gap-2">
        <Sparkles className="size-4 shrink-0 text-brand-600" aria-hidden />
        <span className="min-w-0 flex-1 text-xs text-muted">{line}</span>
        {triage?.status === 'PENDING' ? <Spinner className="size-4 text-brand-600" /> : analyzeBtn(false)}
      </div>,
    );
  }

  // ─── Result ───
  const c = triage.contact ?? {};
  const contactLine = [c.name, c.email, c.phone, c.company, c.country].filter(Boolean);
  const done = triage.status !== 'NEW';
  const inJunk = message.folderRole === 'JUNK';

  return shell(
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Sparkles className="size-4 shrink-0 text-brand-600" aria-hidden />
        <h2 className="text-sm font-bold text-ink">{t('aiMail.card.title')}</h2>
        {triage.category && <CategoryChip category={triage.category} />}
        {triage.urgency && triage.urgency !== 'NORMAL' && <UrgencyChip urgency={triage.urgency} />}
        {triage.status === 'DISMISSED' && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-slate-600">{t('aiMail.card.dismissed')}</span>}
        {triage.status === 'ACTIONED' && <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-emerald-700">{t('aiMail.card.actioned')}</span>}
        <span className="flex-1" />
        <span title={unavailable ?? t('aiMail.card.again')} className="inline-flex">
          <button
            type="button"
            onClick={() => run('analyze', { refresh: true })}
            disabled={!!unavailable || busy('analyze')}
            className="grid size-7 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={t('aiMail.card.again')}
          >
            {busy('analyze') ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" />}
          </button>
        </span>
      </div>

      {triage.summary?.shown && <p className={clsx('mt-2 text-sm leading-relaxed text-ink', done && 'text-ink/80')}>{triage.summary.shown}</p>}

      <dl className="mt-2 grid gap-1">
        {contactLine.length > 0 && <Row label={t('aiMail.card.contact')}>{contactLine.join(' · ')}</Row>}
        {triage.intent && <Row label={t('aiMail.card.intent')}>{triage.intent}</Row>}
        {triage.visaCategory && <Row label={t('aiMail.card.visa')}>{[triage.visaCategory.title, triage.visaCategory.label].filter(Boolean).join(' · ')}</Row>}
        {triage.assigneeRole && triage.assigneeRole !== 'NONE' && <Row label={t('aiMail.card.team')}>{t(`aiMail.role.${triage.assigneeRole}`, { defaultValue: triage.assigneeRole })}</Row>}
        {triage.existingClient && (
          <Row label={t('aiMail.card.existingClient')}>
            <span className="inline-flex flex-wrap items-center gap-1.5">
              <span className="font-semibold">{triage.existingClient.name}</span>
              {triage.existingClient.companyName && <span className="text-muted">({triage.existingClient.companyName})</span>}
              <span className="text-muted">· {t(`aiMail.card.matchedBy.${triage.existingClient.matchedBy}`)}</span>
              {triage.existingClient.caseId && (
                <Link to={`/admin/cases/${triage.existingClient.caseId}`} className="inline-flex items-center gap-1 rounded-md bg-brand-100 px-1.5 py-0.5 text-[0.65rem] font-semibold text-brand-700 hover:underline">
                  <Briefcase className="size-3" aria-hidden /> {triage.existingClient.caseNumber} · {t('aiMail.card.openCase')}
                </Link>
              )}
            </span>
          </Row>
        )}
      </dl>

      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        {triage.assignedTo ? (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-700">
            <Users className="size-3" aria-hidden /> {t('aiMail.card.assignedTo', { name: triage.assignedTo.name })}
          </span>
        ) : (
          triage.suggestedAssignee && (
            <span className="inline-flex items-center gap-1 rounded-md bg-surface px-1.5 py-0.5 font-semibold text-muted">
              <Users className="size-3" aria-hidden /> {t('aiMail.card.suggested', { name: triage.suggestedAssignee.name })}
            </span>
          )
        )}
        {triage.lead && (
          <Link to="/admin/inquiries" className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-1.5 py-0.5 font-semibold text-violet-700 hover:underline">
            <Inbox className="size-3" aria-hidden /> {t('aiMail.card.leadCreated')} · {t('aiMail.card.openLead')}
          </Link>
        )}
      </div>

      {triage.replyDraft && (
        <div className="mt-2">
          <button type="button" onClick={() => setDraftOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline" aria-expanded={draftOpen}>
            {draftOpen ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
            {t('aiMail.card.draft', { lang: LANG_LABEL[triage.replyDraft.language] ?? triage.replyDraft.language.toUpperCase() })}
          </button>
          {draftOpen && (
            <div className="mt-1.5 rounded-lg border border-line bg-surface p-2.5 text-xs text-ink">
              <p className="font-semibold">{triage.replyDraft.subject}</p>
              <p className="mt-1 whitespace-pre-wrap">{triage.replyDraft.body}</p>
            </div>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {!triage.lead && triage.category !== 'SPAM' && (
          <ActionBtn
            primary={triage.category === 'CANDIDATE' || triage.category === 'EMPLOYER' || triage.category === 'PARTNER'}
            busy={busy('lead')}
            onClick={() => run('lead', {}, (r) => toast.success(r.created === false ? t('aiMail.toast.leadLinked') : t('aiMail.toast.leadCreated')))}
          >
            <UserPlus className="size-3.5" aria-hidden /> {t('aiMail.card.createLead')}
          </ActionBtn>
        )}
        <div className="relative inline-flex">
          <ActionBtn
            onClick={() => {
              setStaffId(triage.suggestedAssignee?.id ?? '');
              setAssignOpen((o) => !o);
            }}
            busy={busy('assign')}
          >
            <Users className="size-3.5" aria-hidden /> {t('aiMail.card.assign')}
          </ActionBtn>
          <Popover open={assignOpen} onClose={() => setAssignOpen(false)} className="w-64 p-2">
            <label className="mb-1 block text-xs font-semibold text-muted" htmlFor={`assign-${message.id}`}>
              {t('aiMail.card.pickStaff')}
            </label>
            <select id={`assign-${message.id}`} className="input w-full py-1.5 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="">—</option>
              {(staff.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="mt-2 flex gap-1.5">
              {(['task', 'notify'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  disabled={!staffId || post.isPending}
                  onClick={() =>
                    run('assign', { userId: staffId, mode }, (r) => {
                      setAssignOpen(false);
                      toast.success(mode === 'task' && r.taskNumber ? t('aiMail.toast.task', { number: String(r.taskNumber).padStart(4, '0') }) : t('aiMail.toast.notified'));
                    })
                  }
                  className="flex-1 rounded-lg border border-line px-2 py-1.5 text-xs font-semibold text-ink hover:border-brand-400 hover:bg-brand-50 disabled:opacity-50"
                >
                  {mode === 'task' ? t('aiMail.card.asTask') : t('aiMail.card.asNotification')}
                </button>
              ))}
            </div>
          </Popover>
        </div>
        {triage.replyDraft && (
          <ActionBtn
            onClick={() => {
              onUseDraft({ subject: triage.replyDraft!.subject, body: triage.replyDraft!.body });
              toast.info(t('aiMail.toast.draft'));
              void api.post(`/ai-mail/messages/${message.id}/reply-used`).then((r) => store((r.data as { triage: Triage }).triage)).catch(() => undefined);
            }}
          >
            <MailCheck className="size-3.5" aria-hidden /> {t('aiMail.card.useDraft')}
          </ActionBtn>
        )}
        {!inJunk && (
          <ActionBtn
            busy={busy('spam')}
            onClick={() =>
              run('spam', {}, () => {
                toast.success(t('aiMail.toast.spam'));
                onSpam();
              })
            }
          >
            <ShieldAlert className="size-3.5" aria-hidden /> {t('aiMail.card.spam')}
          </ActionBtn>
        )}
        {triage.status === 'DISMISSED' ? (
          <ActionBtn busy={busy('reopen')} onClick={() => run('reopen', {}, () => toast.success(t('aiMail.toast.reopened')))}>
            <RotateCcw className="size-3.5" aria-hidden /> {t('aiMail.card.reopen')}
          </ActionBtn>
        ) : (
          <ActionBtn busy={busy('dismiss')} onClick={() => run('dismiss', {}, () => toast.success(t('aiMail.toast.dismissed')))}>
            <X className="size-3.5" aria-hidden /> {t('aiMail.card.dismiss')}
          </ActionBtn>
        )}
      </div>
      <p className="mt-2 text-[0.68rem] text-muted">{t('aiMail.card.note')}</p>
    </>,
    triage.urgency === 'URGENT' && triage.status === 'NEW' ? 'border-red-300' : 'border-line',
  );
};
