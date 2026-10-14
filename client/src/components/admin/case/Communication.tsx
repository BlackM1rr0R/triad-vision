import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { toast } from 'sonner';
import { History, Lock, MessageCircle, Send, StickyNote } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseDetail } from '@/lib/types';
import { Spinner } from '@/components/ui/Spinner';
import { ROLE_LABEL, STATUS_LABEL, eventLabel, fmtDateTime, fullName, toastError } from '../labels';
import { Panel } from '../ui';
import { useCaseRefresh } from './shared';

export const Messages = ({ c }: { c: CaseDetail }) => {
  const refresh = useCaseRefresh(c.id);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [c.messages.length]);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await api.post(`/admin/cases/${c.id}/messages`, { body: body.trim() });
      setBody('');
      await refresh();
    } catch (err) {
      toastError(err, 'Mesaj göndərilmədi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Müştəri ilə yazışma" icon={MessageCircle} bodyClassName="p-0">
      <div ref={listRef} className="max-h-[420px] space-y-3 overflow-y-auto px-5 py-5 sm:px-6">
        {c.messages.length === 0 && <p className="py-6 text-center text-sm text-muted">Hələ mesaj yoxdur.</p>}
        {c.messages.map((m) => {
          const fromClient = m.author.role === 'CLIENT';
          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className={clsx('flex', fromClient ? 'justify-start' : 'justify-end')}
            >
              <div
                className={clsx(
                  'max-w-[85%] rounded-2xl px-3.5 py-2 text-sm',
                  fromClient ? 'rounded-bl-sm bg-surface text-ink' : 'rounded-br-sm bg-brand-600 text-white',
                )}
              >
                <p className="whitespace-pre-wrap break-words">{m.body}</p>
                <p className={clsx('mt-1 text-[10px]', fromClient ? 'text-muted' : 'text-white/70')}>
                  {fullName(m.author)} · {fmtDateTime(m.createdAt)}
                </p>
              </div>
            </motion.div>
          );
        })}
      </div>
      <form
        className="flex items-end gap-2 border-t border-line p-3 sm:px-4"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="msg-body" className="sr-only">
          Mesaj
        </label>
        <textarea
          id="msg-body"
          className="input min-h-[42px] resize-y"
          rows={1}
          value={body}
          maxLength={4000}
          placeholder="Müştəriyə mesaj yazın… (Ctrl+Enter — göndər)"
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" className="btn-primary size-11 shrink-0 p-0" disabled={!body.trim() || busy} aria-label="Göndər">
          {busy ? <Spinner className="size-4" /> : <Send className="size-4" />}
        </button>
      </form>
    </Panel>
  );
};

export const InternalNotes = ({ c }: { c: CaseDetail }) => {
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
      toast.success('Daxili qeyd əlavə edildi.');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Daxili qeydlər" icon={StickyNote} actions={<span className="text-[11px] text-muted">Müştəri görmür</span>}>
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <label htmlFor="int-note" className="sr-only">
          Daxili qeyd
        </label>
        <textarea
          id="int-note"
          className="input bg-amber-50/40"
          rows={2}
          maxLength={4000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Komanda üçün qeyd: zəng edildi, əlavə məlumat və s."
        />
        <button type="submit" className="btn-white btn-sm border border-line" disabled={!note.trim() || busy}>
          {busy ? <Spinner className="size-3.5" /> : <StickyNote className="size-3.5" />} Qeyd əlavə et
        </button>
      </form>
      {notes.length > 0 && (
        <ul className="mt-4 space-y-2">
          {notes.slice(0, 5).map((n) => (
            <li key={n.id} className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2">
              <p className="text-sm break-words whitespace-pre-wrap text-ink">{n.note}</p>
              <p className="mt-1 text-[11px] text-muted">
                {n.actor ? fullName(n.actor) : 'Sistem'} · {fmtDateTime(n.createdAt)}
              </p>
            </li>
          ))}
          {notes.length > 5 && <li className="text-[11px] text-muted">Qalan {notes.length - 5} qeyd tarixçədədir.</li>}
        </ul>
      )}
    </Panel>
  );
};

export const Timeline = ({ c }: { c: CaseDetail }) => {
  const [showAll, setShowAll] = useState(false);
  const events = showAll ? c.events : c.events.slice(0, 12);
  return (
    <Panel title="Tarixçə" icon={History} actions={<span className="text-[11px] text-muted tabular-nums">{c.events.length} hadisə</span>}>
      <ol className="relative space-y-4 before:absolute before:top-1 before:bottom-1 before:left-[5px] before:w-px before:bg-line">
        {events.map((e) => (
          <li key={e.id} className="relative pl-6">
            <span
              className={clsx(
                'absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-white',
                e.type === 'INTERNAL_NOTE' ? 'bg-amber-400' : e.toStatus ? 'bg-brand-600' : 'bg-slate-300',
              )}
              aria-hidden
            />
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm">
              <span className="font-semibold text-navy-900">{eventLabel(e.type)}</span>
              {!e.visibleToClient && (
                <span className="badge bg-slate-100 text-[10px] text-slate-600">
                  <Lock className="size-2.5" aria-hidden /> Daxili
                </span>
              )}
            </p>
            {e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus && (
              <p className="mt-0.5 text-xs text-muted">
                {STATUS_LABEL[e.fromStatus]} → <span className="font-medium text-ink/80">{STATUS_LABEL[e.toStatus]}</span>
              </p>
            )}
            {e.note && <p className="mt-1 text-xs break-words whitespace-pre-wrap text-ink/80">{e.note}</p>}
            <p className="mt-1 text-[11px] text-muted">
              {e.actor ? `${fullName(e.actor)} (${ROLE_LABEL[e.actor.role]})` : 'Sistem'} · {fmtDateTime(e.createdAt)}
            </p>
          </li>
        ))}
      </ol>
      {c.events.length > 12 && (
        <button type="button" className="mt-3 inline-flex min-h-10 items-center text-xs font-semibold text-brand-600 hover:underline" onClick={() => setShowAll((v) => !v)}>
          {showAll ? 'Daha az göstər' : `Hamısını göstər (${c.events.length})`}
        </button>
      )}
    </Panel>
  );
};
