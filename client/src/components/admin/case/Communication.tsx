import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { History, Lock, MessageCircle, Send, StickyNote, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { RealtimeBridge } from '@/lib/realtime';
import type { CaseDetail } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesMessaging } from '@/i18n/pagesMessaging';
import { Spinner } from '@/components/ui/Spinner';
import { ChannelBadge, LiveDot, ReadTicks, TypingIndicator } from '@/components/messaging/ThreadBits';
import { useThread } from '@/components/messaging/useThread';
import { eventLabel, fmtDateTime, fullName, roleLabel, statusLabel, toastError } from '../labels';
import { Panel } from '../ui';
import { useCaseRefresh } from './shared';
import { ReplyDraftButton } from '@/components/aiStaff/ReplyDraftButton';
import { MessageBody, ShowOriginalsToggle, TranslationNote } from '@/components/messagingPlus/MessageBody';
import { VoiceRecorder } from '@/components/messagingPlus/VoiceRecorder';
import { PartyThreadButton, PartyThreadFromQuery } from '@/components/messagingPlus/PartyThread';
import { translatableText, useMessageTranslations, useShowOriginals } from '@/components/messagingPlus/useTranslations';
import { CaseDraftPreview } from '@/components/messagingPlus/DraftPreview';

registerCopy(pagesMessaging);

export const Messages = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const refresh = useCaseRefresh(c.id);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const meId = user?.id ?? '';

  const thread = useThread({ caseId: c.id, base: '/admin/cases', initial: c.messages, meId, onNewMessage: () => void refresh() });
  const { messages, typingName } = thread;
  const lastId = messages[messages.length - 1]?.id;
  // Messaging plus: translation into the staff member's language, voice messages, three-party thread.
  const prefs = useShowOriginals();
  const tx = useMessageTranslations({
    scope: 'case',
    id: c.id,
    items: messages.filter((m) => !m.pending && !m.failed).map((m) => ({ id: m.id, text: translatableText(m), lang: m.lang ?? m.voice?.transcriptLang })),
  });
  const companyId = (c as CaseDetail & { companyId?: string | null }).companyId;

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, lastId, typingName]);

  const send = async () => {
    const text = body.trim();
    if (!text || !user) return;
    setBusy(true);
    setBody('');
    try {
      await thread.send(text, { id: user.id, firstName: user.firstName, lastName: user.lastName, role: user.role });
      void refresh();
    } catch (err) {
      setBody(text);
      toastError(err, t('admin.case.comm.sendFailed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel
      id="messages"
      title={t('admin.case.comm.messagesTitle')}
      icon={MessageCircle}
      actions={
        <span className="flex flex-wrap items-center gap-2">
          {companyId && <PartyThreadButton caseId={c.id} />}
          <LiveDot connected={thread.connected} />
        </span>
      }
      bodyClassName="p-0"
      className="scroll-mt-24"
    >
      <RealtimeBridge />
      <PartyThreadFromQuery />
      <div
        ref={(el) => {
          scrollRef.current = el;
          thread.listRef(el);
        }}
        className="max-h-[420px] space-y-3 overflow-y-auto px-5 py-5 sm:px-6"
      >
        {messages.length === 0 && <p className="py-6 text-center text-sm text-muted">{t('admin.case.comm.noMessages')}</p>}
        {messages.map((m, i) => {
          const fromClient = m.author.role === 'CLIENT';
          // "Oxundu · 14:32" printed under the newest team message the client has read (all ticks keep it in the tooltip).
          const lastRead = !fromClient && !!m.readAt && !messages.slice(i + 1).some((x) => x.author.role !== 'CLIENT' && x.readAt);
          const mine = m.author.id === meId;
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx('flex', fromClient ? 'justify-start' : 'justify-end')}
            >
              <div
                className={clsx(
                  'max-w-[85%] rounded-xl px-3.5 py-2 text-sm',
                  fromClient ? 'rounded-bl-sm bg-sunken text-ink' : 'rounded-br-sm bg-primary text-primary-contrast',
                  m.pending && 'opacity-70',
                  m.failed && 'bg-danger',
                )}
              >
                <MessageBody m={m} tx={tx} onDark={!fromClient} />
                <p className={clsx('mt-1 flex flex-wrap items-center gap-1.5 text-[10px]', fromClient ? 'text-muted' : 'text-primary-contrast/70')}>
                  <ChannelBadge channel={m.channel} onDark={!fromClient} />
                  <span>
                    {fullName(m.author)} · {fmtDateTime(m.createdAt)}
                  </span>
                  {!fromClient && <ReadTicks m={m} onDark withTime={lastRead} />}
                  {mine && m.failed && (
                    <button type="button" className="inline-flex items-center gap-0.5 underline" onClick={() => thread.dismissFailed(m.id)}>
                      <X className="size-3" aria-hidden /> {t('messaging.chat.failed')}
                    </button>
                  )}
                </p>
              </div>
            </motion.div>
          );
        })}
        <TypingIndicator name={typingName} />
        <TranslationNote tx={tx} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-3 pt-2 sm:px-4">
        <ReplyDraftButton endpoint={`/admin/ai-staff/cases/${c.id}/reply-draft`} onInsert={(text) => setBody(text)} />
        <ShowOriginalsToggle tx={tx} setter={prefs.set} />
      </div>
      <CaseDraftPreview text={body} clientLocale={c.client.locale} />
      <form
        className="flex items-end gap-2 p-3 sm:px-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="msg-body" className="sr-only">
          {t('admin.case.comm.message')}
        </label>
        <textarea
          id="msg-body"
          className="input min-h-[42px] resize-y"
          rows={1}
          value={body}
          maxLength={4000}
          placeholder={t('admin.case.comm.placeholder')}
          onChange={(e) => {
            setBody(e.target.value);
            if (e.target.value.trim()) thread.notifyTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <VoiceRecorder
          uploadUrl={`/messaging-plus/cases/${c.id}/voice`}
          onSent={(d) => {
            const m = (d as { message?: Parameters<typeof thread.upsert>[0] }).message;
            if (m) thread.upsert(m);
            void refresh();
          }}
        />
        <button type="submit" className="btn-primary size-11 shrink-0 p-0" disabled={!body.trim() || busy} aria-label={t('admin.case.comm.send')}>
          {busy ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </button>
      </form>
    </Panel>
  );
};

export const InternalNotes = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const refresh = useCaseRefresh(c.id);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const notes = c.events.filter((e) => e.type === 'INTERNAL_NOTE');

  const add = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/cases/${c.id}/notes`, { note: note.trim() });
      setNote('');
      await refresh();
      toast.success(t('admin.case.comm.noteAdded'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title={t('admin.case.comm.notesTitle')} icon={StickyNote} actions={<span className="text-[11px] text-muted">{t('admin.case.comm.clientCantSee')}</span>}>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label htmlFor="int-note" className="sr-only">
          {t('admin.case.comm.internalNote')}
        </label>
        <textarea
          id="int-note"
          className="input bg-warning-bg/40"
          rows={2}
          maxLength={4000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={t('admin.case.comm.notePlaceholder')}
        />
        <button type="submit" className="btn-secondary btn-sm" disabled={!note.trim() || busy}>
          {busy ? <Spinner className="size-3.5" /> : <StickyNote className="size-3.5" />} {t('admin.case.comm.addNote')}
        </button>
      </form>
      {notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {notes.slice(0, 5).map((n) => (
            <li key={n.id} className="rounded-lg border border-warning-border/70 bg-warning-bg/60 px-3 py-2">
              <p className="text-sm break-words whitespace-pre-wrap text-ink">{n.note}</p>
              <p className="mt-1 text-[11px] text-muted">
                {n.actor ? fullName(n.actor) : t('admin.common.system')} · {fmtDateTime(n.createdAt)}
              </p>
            </li>
          ))}
          {notes.length > 5 && <li className="text-[11px] text-muted">{t('admin.case.comm.moreNotes', { count: notes.length - 5 })}</li>}
        </ul>
      )}
    </Panel>
  );
};

export const Timeline = ({ c }: { c: CaseDetail }) => {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);
  const events = showAll ? c.events : c.events.slice(0, 12);
  return (
    <Panel title={t('admin.case.comm.timeline')} icon={History} actions={<span className="text-[11px] text-muted tabular-nums">{t('admin.case.stats.events', { count: c.events.length })}</span>}>
      <ol className="relative space-y-4 before:absolute before:top-1 before:bottom-1 before:left-[5px] before:w-px before:bg-line">
        {events.map((e) => (
          <li key={e.id} className="relative pl-6">
            <span
              className={clsx(
                'absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-white',
                e.type === 'INTERNAL_NOTE' ? 'bg-warning' : e.toStatus ? 'bg-primary' : 'bg-line-strong',
              )}
              aria-hidden
            />
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              <span className="font-semibold text-ink">{eventLabel(e.type)}</span>
              {!e.visibleToClient && (
                <span className="badge bg-sunken text-[10px] text-muted">
                  <Lock className="size-2.5" aria-hidden /> {t('admin.common.internal')}
                </span>
              )}
            </p>
            {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
              <p className="mt-0.5 text-xs text-muted">
                {statusLabel(e.fromStatus)} → <span className="font-medium text-ink/80">{statusLabel(e.toStatus)}</span>
              </p>
            )}
            {e.note && <p className="mt-1 text-xs break-words whitespace-pre-wrap text-ink/80">{e.note}</p>}
            <p className="mt-1 text-[11px] text-muted">
              {e.actor ? `${fullName(e.actor)} (${roleLabel(e.actor.role)})` : t('admin.common.system')} · {fmtDateTime(e.createdAt)}
            </p>
          </li>
        ))}
      </ol>
      {c.events.length > 12 && (
        <button type="button" className="mt-3 inline-flex min-h-10 items-center text-xs font-semibold text-link hover:underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? t('admin.common.showLess') : t('admin.common.showAll', { count: c.events.length })}
        </button>
      )}
    </Panel>
  );
};
