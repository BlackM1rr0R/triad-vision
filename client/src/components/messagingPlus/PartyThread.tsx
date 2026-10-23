import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { EyeOff, Lock, MessagesSquare, Pin, SendHorizontal, ShieldCheck, Trash2, Unlock, Check, X, Eye, Languages } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { useRealtime } from '@/lib/realtime';
import { registerCopy } from '@/i18n';
import { pagesMessagingPlus } from '@/i18n/pagesMessagingPlus';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { MessageBody, ShowOriginalsToggle, TranslationNote } from './MessageBody';
import { VoiceRecorder } from './VoiceRecorder';
import { LANGS, translatableText, useMessageTranslations, useShowOriginals, type Lang, type TranslationMap, type VoiceInfo } from './useTranslations';

registerCopy(pagesMessagingPlus);

type Side = 'CANDIDATE' | 'COMPANY' | 'STAFF';
type PinTopic = 'INTERVIEW_TIME' | 'START_DATE' | 'ACCOMMODATION' | 'OTHER';
const PIN_TOPICS: PinTopic[] = ['INTERVIEW_TIME', 'START_DATE', 'ACCOMMODATION', 'OTHER'];

interface PartyMessage {
  id: string;
  side: Side;
  mine: boolean;
  authorName: string | null;
  body: string;
  lang: Lang | null;
  voice: VoiceInfo | null;
  status: 'VISIBLE' | 'HELD' | 'REJECTED' | 'HIDDEN' | 'DELETED';
  holdReason: string | null;
  createdAt: string;
}

interface ThreadView {
  thread: {
    id: string;
    title: string;
    status: 'OPEN' | 'CLOSED';
    showCompany: boolean;
    candidateName: string | null;
    companyName: string | null;
    staff: string[];
    pins: { id: string; topic: PinTopic; text: string; at: string }[];
  };
  side: Side;
  messages: PartyMessage[];
  translations: TranslationMap;
  heldCount?: number;
}

export interface PartyThreadSummary {
  id: string;
  applicationId: string | null;
  caseId: string | null;
  title: string;
  candidateName: string | null;
  companyName: string | null;
  status: 'OPEN' | 'CLOSED';
  lastMessageAt: string | null;
  unread: number;
  heldCount?: number;
}

const threadKey = (id: string, lang: string) => ['party-thread', id, lang] as const;

/** The viewer's threads (candidate: own, employer: own company, staff: all). */
export const usePartyThreads = (enabled = true) => {
  const { locale } = useL10n();
  const qc = useQueryClient();
  useRealtime('party.updated', () => void qc.invalidateQueries({ queryKey: ['party-threads'] }));
  return useQuery({
    queryKey: ['party-threads', locale],
    queryFn: async () => (await api.get<{ items: PartyThreadSummary[] }>('/messaging-plus/threads', { params: { lang: locale } })).data.items,
    enabled,
    staleTime: 30_000,
  });
};

/** ?thread=<id> in the URL: the dialog opens directly from a notification link. */
export const useThreadParam = () => {
  const [params, setParams] = useSearchParams();
  const id = params.get('thread');
  const set = useCallback(
    (v: string | null) => {
      const next = new URLSearchParams(params);
      if (v) next.set('thread', v);
      else next.delete('thread');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );
  return [id, set] as const;
};

const StatusTag = ({ m }: { m: PartyMessage }) => {
  const { t } = useTranslation();
  if (m.status === 'VISIBLE') return null;
  const label =
    m.status === 'HELD' ? (m.mine ? null : t('msgPlus.party.heldStaff')) : m.status === 'REJECTED' ? t('msgPlus.party.rejected') : m.status === 'HIDDEN' ? t('msgPlus.party.hidden') : null;
  if (!label) return null;
  return <span className="badge bg-warning-bg text-[10px] text-warning-fg">{label}</span>;
};

const ModerationBar = ({ m, onAction, busy }: { m: PartyMessage; onAction: (a: string) => void; busy: boolean }) => {
  const { t } = useTranslation();
  const btn = 'inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-[11px] font-semibold hover:bg-surface disabled:opacity-50';
  if (m.status === 'DELETED') return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {(m.status === 'HELD' || m.status === 'REJECTED') && (
        <button type="button" className={clsx(btn, 'text-emerald-700')} disabled={busy} onClick={() => onAction('APPROVE')}>
          <Check className="size-3" aria-hidden /> {t('msgPlus.party.approve')}
        </button>
      )}
      {m.status === 'HELD' && (
        <button type="button" className={clsx(btn, 'text-amber-800')} disabled={busy} onClick={() => onAction('REJECT')}>
          <X className="size-3" aria-hidden /> {t('msgPlus.party.reject')}
        </button>
      )}
      {m.status === 'VISIBLE' && (
        <button type="button" className={clsx(btn, 'text-ink/70')} disabled={busy} onClick={() => onAction('HIDE')}>
          <EyeOff className="size-3" aria-hidden /> {t('msgPlus.party.hide')}
        </button>
      )}
      {m.status === 'HIDDEN' && (
        <button type="button" className={clsx(btn, 'text-ink/70')} disabled={busy} onClick={() => onAction('UNHIDE')}>
          <Eye className="size-3" aria-hidden /> {t('msgPlus.party.unhide')}
        </button>
      )}
      <button
        type="button"
        className={clsx(btn, 'text-danger')}
        disabled={busy}
        onClick={() => {
          // TODO(ui): ConfirmDialog
          if (window.confirm(t('msgPlus.party.deleteConfirm'))) onAction('DELETE');
        }}
      >
        <Trash2 className="size-3" aria-hidden /> {t('msgPlus.party.delete')}
      </button>
    </div>
  );
};

/** Staff: "how the other side will read it" before sending. */
export const PreviewTranslation = ({ text, defaultTarget }: { text: string; defaultTarget?: Lang }) => {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const [target, setTarget] = useState<Lang>(defaultTarget ?? (locale === 'de' ? 'az' : 'de'));
  const [result, setResult] = useState<string | null>(null);
  const m = useMutation({
    mutationFn: async () => (await api.post<{ translations: Partial<Record<Lang, string>>; unavailable?: string }>('/messaging-plus/translate/preview', { text, targets: [target] })).data,
    onSuccess: (d) => (d.translations[target] ? setResult(d.translations[target]!) : toast.error(t('msgPlus.tr.previewFailed'))),
    onError: () => toast.error(t('msgPlus.tr.previewFailed')),
  });
  useEffect(() => setResult(null), [text, target]);
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <button type="button" className="inline-flex min-h-8 items-center gap-1 font-semibold text-brand-700 hover:underline disabled:opacity-50" disabled={!text.trim() || m.isPending} onClick={() => m.mutate()}>
        {m.isPending ? <Spinner className="size-3" /> : <Languages className="size-3.5" aria-hidden />} {t('msgPlus.tr.preview')}
      </button>
      <select aria-label={t('msgPlus.tr.preview')} className="min-h-8 rounded-md border border-line bg-white px-1.5 text-[11px]" value={target} onChange={(e) => setTarget(e.target.value as Lang)}>
        {LANGS.map((l) => (
          <option key={l} value={l}>
            {t(`msgPlus.tr.lang.${l}`)}
          </option>
        ))}
      </select>
      {result && (
        <p className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs whitespace-pre-wrap text-ink">
          <span className="mb-0.5 block text-[10px] font-semibold text-muted">{t('msgPlus.tr.previewTitle')}</span>
          {result}
        </p>
      )}
    </div>
  );
};

const StaffTools = ({ view, refresh }: { view: ThreadView; refresh: () => void }) => {
  const { t } = useTranslation();
  const id = view.thread.id;
  const [topic, setTopic] = useState<PinTopic>('INTERVIEW_TIME');
  const [text, setText] = useState('');
  const patch = useMutation({ mutationFn: (body: Record<string, unknown>) => api.patch(`/messaging-plus/threads/${id}`, body), onSuccess: refresh, onError: () => toast.error(t('msgPlus.party.openFailed')) });
  const pin = useMutation({
    mutationFn: () => api.post(`/messaging-plus/threads/${id}/pins`, { topic, text: text.trim() }),
    onSuccess: () => {
      setText('');
      refresh();
    },
    onError: () => toast.error(t('msgPlus.party.openFailed')),
  });
  return (
    <div className="space-y-2 border-b border-line bg-surface/60 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="size-3.5 accent-brand-600" checked={view.thread.showCompany} disabled={patch.isPending} onChange={(e) => patch.mutate({ showCompany: e.target.checked })} />
          {t('msgPlus.party.showCompany')}
        </label>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={patch.isPending}
          onClick={() => patch.mutate({ status: view.thread.status === 'OPEN' ? 'CLOSED' : 'OPEN' })}
        >
          {view.thread.status === 'OPEN' ? <Lock className="size-3.5" aria-hidden /> : <Unlock className="size-3.5" aria-hidden />}
          {view.thread.status === 'OPEN' ? t('msgPlus.party.close') : t('msgPlus.party.reopen')}
        </button>
        {!!view.heldCount && <span className="badge bg-warning-bg text-warning-fg">{t('msgPlus.party.heldCount', { count: view.heldCount })}</span>}
      </div>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) pin.mutate();
        }}
      >
        <select aria-label={t('msgPlus.party.addPin')} className="min-h-9 rounded-md border border-line bg-white px-2" value={topic} onChange={(e) => setTopic(e.target.value as PinTopic)}>
          {PIN_TOPICS.map((p) => (
            <option key={p} value={p}>
              {t(`msgPlus.party.pinTopic.${p}`)}
            </option>
          ))}
        </select>
        <input aria-label={t('msgPlus.party.pinText')} className="input min-h-9 min-w-0 flex-1 py-1 text-xs" maxLength={300} placeholder={t('msgPlus.party.pinText')} value={text} onChange={(e) => setText(e.target.value)} />
        <button type="submit" className="btn-secondary btn-sm" disabled={!text.trim() || pin.isPending}>
          <Pin className="size-3.5" aria-hidden /> {t('msgPlus.party.addPin')}
        </button>
      </form>
    </div>
  );
};

const ThreadBody = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const { locale, dateTime } = useL10n();
  const qc = useQueryClient();
  const prefs = useShowOriginals();
  const key = threadKey(id, locale);
  const { data, isLoading, isError } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<ThreadView>(`/messaging-plus/threads/${id}`, { params: { lang: locale } })).data,
    refetchInterval: 60_000,
  });
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ['party-thread', id] }), [qc, id]);
  useRealtime('party.updated', (p) => {
    if ((p as { threadId?: string }).threadId === id) refresh();
  });

  const items = useMemo(() => (data?.messages ?? []).filter((m) => m.status !== 'DELETED').map((m) => ({ id: m.id, text: translatableText(m), lang: m.lang ?? m.voice?.transcriptLang ?? null })), [data?.messages]);
  const tx = useMessageTranslations({ scope: 'party', id, items, initial: data?.translations, enabled: !!data });

  // Mark read whenever new messages arrive while the dialog is open.
  const count = data?.messages.length ?? 0;
  useEffect(() => {
    if (!data) return;
    void api.post(`/messaging-plus/threads/${id}/read`).catch(() => undefined);
    void qc.invalidateQueries({ queryKey: ['party-threads'] });
  }, [id, count, data, qc]);

  const scroller = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  const [body, setBody] = useState('');
  const send = useMutation({
    mutationFn: async (text: string) => (await api.post<{ held: boolean }>(`/messaging-plus/threads/${id}/messages`, { body: text })).data,
    onSuccess: (r) => {
      setBody('');
      if (r.held) toast.message(t('msgPlus.party.held'));
      refresh();
    },
    onError: (err) => toast.error(errorCode(err) === 'THREAD_CLOSED' ? t('msgPlus.party.closed') : t('msgPlus.party.openFailed')),
  });
  const moderate = useMutation({
    mutationFn: ({ messageId, action }: { messageId: string; action: string }) => api.post(`/messaging-plus/threads/${id}/messages/${messageId}/moderate`, { action }),
    onSuccess: refresh,
    onError: () => toast.error(t('msgPlus.party.openFailed')),
  });
  const unpin = useMutation({ mutationFn: (pinId: string) => api.delete(`/messaging-plus/threads/${id}/pins/${pinId}`), onSuccess: refresh });

  if (isLoading) return <div className="grid min-h-40 place-items-center"><Spinner className="size-6 text-brand-600" /></div>;
  if (isError || !data) return <p className="p-6 text-center text-sm text-muted">{t('msgPlus.party.openFailed')}</p>;

  const { thread, side } = data;
  const staff = side === 'STAFF';
  const closed = thread.status === 'CLOSED';
  const sideLabel = (m: PartyMessage) => {
    if (m.mine) return t('msgPlus.party.you');
    if (m.side === 'STAFF') return m.authorName ?? t('msgPlus.party.team');
    if (m.side === 'COMPANY') return m.authorName ?? t('msgPlus.party.employerFallback');
    return m.authorName ?? t('msgPlus.party.candidate');
  };
  const privacy = side === 'COMPANY' ? t('msgPlus.party.privacyCompany') : side === 'CANDIDATE' ? t('msgPlus.party.privacyCandidate') : t('msgPlus.party.privacyStaff');

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-1 border-b border-line px-4 py-3">
        <p className="text-xs text-muted">
          {[side !== 'CANDIDATE' ? thread.candidateName : null, side !== 'COMPANY' ? thread.companyName ?? t('msgPlus.party.employerFallback') : thread.companyName, thread.staff.join(', ') || t('msgPlus.party.team')]
            .filter(Boolean)
            .join(' · ')}
        </p>
        <p className="flex items-start gap-1.5 text-[11px] text-muted">
          <ShieldCheck className="mt-px size-3.5 shrink-0 text-brand-600" aria-hidden /> {privacy}
        </p>
        <ShowOriginalsToggle tx={tx} setter={prefs.set} />
      </div>
      {staff && <StaffTools view={data} refresh={refresh} />}
      {thread.pins.length > 0 && (
        <ul className="flex flex-wrap gap-2 border-b border-line px-4 py-2" aria-label={t('msgPlus.party.pins')}>
          {thread.pins.map((p) => (
            <li key={p.id} className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-800">
              <Pin className="size-3 shrink-0" aria-hidden />
              <span className="font-semibold">{t(`msgPlus.party.pinTopic.${p.topic}`)}:</span>
              <span className="min-w-0 truncate">{p.text}</span>
              {staff && (
                <button type="button" className="ml-0.5 grid size-6 place-items-center rounded-full hover:bg-brand-100" onClick={() => unpin.mutate(p.id)} aria-label={t('msgPlus.party.removePin')}>
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      <div ref={scroller} className="min-h-40 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-surface/50 px-4 py-4">
        <TranslationNote tx={tx} />
        {data.messages.length === 0 && <p className="py-8 text-center text-sm text-muted">{t('msgPlus.party.empty')}</p>}
        {data.messages.map((m) => {
          const mine = m.mine;
          const onDark = mine && m.status === 'VISIBLE';
          return (
            <div key={m.id} className={clsx('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <span className="mb-1 flex flex-wrap items-center gap-1.5 px-1 text-[11px] font-semibold text-muted">
                {sideLabel(m)}
                {!mine && <span className="font-normal">· {m.side === 'STAFF' ? t('msgPlus.party.team') : m.side === 'COMPANY' ? t('msgPlus.party.employer') : t('msgPlus.party.candidate')}</span>}
                <StatusTag m={m} />
              </span>
              <div
                className={clsx(
                  'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm',
                  m.status === 'DELETED' ? 'border border-dashed border-line bg-transparent text-muted italic' : onDark ? 'rounded-br-md bg-brand-600 text-white' : m.status === 'VISIBLE' ? 'rounded-bl-md border border-line bg-white text-ink' : 'border border-amber-200 bg-amber-50 text-ink',
                )}
              >
                {m.status === 'DELETED' ? t('msgPlus.party.deleted') : <MessageBody m={m} tx={tx} onDark={onDark} />}
              </div>
              {mine && m.status === 'HELD' && <p className="mt-1 max-w-[88%] px-1 text-right text-[11px] text-amber-800">{m.holdReason === 'VOICE_REVIEW' ? t('msgPlus.party.heldVoice') : t('msgPlus.party.held')}</p>}
              <time className="mt-1 px-1 text-[10px] text-muted" dateTime={m.createdAt}>
                {dateTime(m.createdAt)}
              </time>
              {staff && <ModerationBar m={m} busy={moderate.isPending} onAction={(action) => moderate.mutate({ messageId: m.id, action })} />}
            </div>
          );
        })}
      </div>
      {closed ? (
        <p className="border-t border-line px-4 py-3 text-center text-sm text-muted">
          <Lock className="mr-1 inline size-3.5" aria-hidden /> {t('msgPlus.party.closed')}
        </p>
      ) : (
        <div className="space-y-2 border-t border-line p-3">
          {staff && <PreviewTranslation text={body} />}
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (body.trim() && !send.isPending) send.mutate(body.trim());
            }}
          >
            <label htmlFor={`party-${id}`} className="sr-only">
              {t('msgPlus.party.placeholder')}
            </label>
            <textarea
              id={`party-${id}`}
              className="input max-h-40 min-h-11 resize-y"
              rows={2}
              maxLength={4000}
              placeholder={t('msgPlus.party.placeholder')}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  if (body.trim()) send.mutate(body.trim());
                }
              }}
            />
            <VoiceRecorder
              uploadUrl={`/messaging-plus/threads/${id}/voice`}
              onSent={(d) => {
                if ((d as { held?: boolean }).held) toast.message(t('msgPlus.party.heldVoice'));
                refresh();
              }}
            />
            <button type="submit" className="btn-primary size-11 shrink-0 p-0" disabled={!body.trim() || send.isPending} aria-label={t('msgPlus.party.send')}>
              {send.isPending ? <Spinner className="size-4" /> : <SendHorizontal className="size-4.5" aria-hidden />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

/** Dialog with one three-party thread (bottom sheet on phones). No backdrop blur. */
export const PartyThreadDialog = ({ id, onClose }: { id: string | null; onClose: () => void }) => {
  const { t } = useTranslation();
  return (
    <Modal
      open={!!id}
      onClose={onClose}
      title={t('msgPlus.party.title')}
      closeLabel={t('msgPlus.party.dialogClose')}
      icon={
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-brand-600">
          <MessagesSquare className="size-4.5" aria-hidden />
        </span>
      }
      size="lg"
      zIndex={90}
      padded={false}
      className="h-[92svh] sm:h-[85vh]"
      bodyClassName="flex flex-col"
    >
      {id && <ThreadBody id={id} />}
    </Modal>
  );
};

/** Opens the dialog from ?thread=<id> (notification links). Mount once on a page. */
export const PartyThreadFromQuery = () => {
  const [id, setId] = useThreadParam();
  return <PartyThreadDialog id={id} onClose={() => setId(null)} />;
};

/** Staff: "3-tərəfli söhbət" — opens (creating if needed) the thread of an application or a company case. */
export const PartyThreadButton = ({ applicationId, caseId, className }: { applicationId?: string; caseId?: string; className?: string }) => {
  const { t } = useTranslation();
  const [, setId] = useThreadParam();
  const qc = useQueryClient();
  const open = useMutation({
    mutationFn: async () => (await api.post<{ thread: { id: string } }>('/messaging-plus/threads', applicationId ? { applicationId } : { caseId })).data.thread.id,
    onSuccess: (id) => {
      setId(id);
      void qc.invalidateQueries({ queryKey: ['party-threads'] });
    },
    onError: (err) => {
      const code = errorCode(err);
      toast.error(code === 'NO_COMPANY' ? t('msgPlus.party.noCompany') : code === 'APPLICATION_NOT_PROPOSED' ? t('msgPlus.party.notProposed') : t('msgPlus.party.openFailed'));
    },
  });
  return (
    <button type="button" className={clsx('btn-secondary btn-sm', className)} disabled={open.isPending} onClick={() => open.mutate()}>
      {open.isPending ? <Spinner className="size-3.5" /> : <MessagesSquare className="size-3.5" aria-hidden />} {t('msgPlus.party.openStaff')}
    </button>
  );
};

/** Candidate / employer: "Söhbət" button for an application, shown once staff opened the thread. */
export const PartyChatButton = ({ thread, className }: { thread: PartyThreadSummary | undefined; className?: string }) => {
  const { t } = useTranslation();
  const [, setId] = useThreadParam();
  if (!thread) return null;
  return (
    <button type="button" className={clsx('btn-white btn-sm relative border border-line', className)} onClick={() => setId(thread.id)}>
      <MessagesSquare className="size-3.5" aria-hidden /> {t('msgPlus.party.open')}
      {thread.unread > 0 && <span className="badge bg-brand-600 text-[10px] text-white">{t('msgPlus.party.unread', { count: thread.unread })}</span>}
    </button>
  );
};

/** Conversations not tied to an application card (case threads), for the candidate and employer portals. */
export const PartyConversations = ({ threads, exclude }: { threads: PartyThreadSummary[] | undefined; exclude?: Set<string> }) => {
  const { t } = useTranslation();
  const rest = (threads ?? []).filter((th) => !(th.applicationId && exclude?.has(th.applicationId)));
  if (!rest.length) return null;
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="party-conv-title">
      <h3 id="party-conv-title" className="mb-3 flex items-center gap-2 text-sm font-bold text-navy-900">
        <MessagesSquare className="size-4 text-brand-600" aria-hidden /> {t('msgPlus.party.conversations')}
      </h3>
      <ul className="space-y-2">
        {rest.map((th) => (
          <li key={th.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{th.title}</p>
              <p className="truncate text-xs text-muted">{[th.candidateName, th.companyName].filter(Boolean).join(' · ') || t('msgPlus.party.title')}</p>
            </div>
            <PartyChatButton thread={th} />
          </li>
        ))}
      </ul>
    </section>
  );
};
