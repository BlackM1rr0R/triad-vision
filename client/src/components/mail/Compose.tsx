import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ChevronDown, FileText, Maximize2, Minimize2, Paperclip, PenLine, Send, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';
import { Popover } from '@/components/tasks/bits';
import { useInvalidateMail, useTemplates } from './api';
import { Confirm } from './Dialog';
import { MenuItem } from './menus';
import { RecipientInput } from './RecipientInput';
import { RichEditor, type RichEditorHandle } from './RichEditor';
import { ReplyDraftButton, textToHtml } from '@/components/aiStaff/ReplyDraftButton';
import type { Address, ComposeSeed, MailAccount, MailAttachment, MessageDetail } from './types';
import { EMAIL_RE, errorText, formatBytes, forwardSubject, htmlToText, isEmptyHtml, quoteForForward, quoteForReply, replyRecipients, replySubject, signatureBlock, subjectOf } from './utils';

/**
 * Docked compose window (bottom-right, minimisable, maximisable). Drafts are created lazily on the
 * first change and autosaved every 3 s; attachments upload to the draft with progress; Ctrl+Enter
 * sends. Replies quote the original, forwards include its attachments.
 */
interface Upload {
  id: string;
  name: string;
  size: number;
  percent: number;
  error?: string;
}

const AUTOSAVE_MS = 3000;

export const ComposeWindow = ({ seed, accounts, onClose, onSent }: { seed: ComposeSeed; accounts: MailAccount[]; onClose: () => void; onSent: (m: MessageDetail) => void }) => {
  const { t } = useTranslation();
  const invalidate = useInvalidateMail();
  const editor = useRef<RichEditorHandle>(null);
  const original = seed.original;
  const [accountId, setAccountId] = useState(seed.accountId ?? seed.draft?.accountId ?? original?.accountId ?? accounts.find((a) => a.isDefault)?.id ?? accounts[0]?.id ?? '');
  const account = accounts.find((a) => a.id === accountId);

  const initial = useMemo(() => {
    const acc = accounts.find((a) => a.id === accountId);
    if (seed.draft) return { to: seed.draft.to, cc: seed.draft.cc, bcc: seed.draft.bcc, subject: seed.draft.subject ?? '', html: seed.draft.html ?? '', attachments: seed.draft.attachments };
    if (seed.mode === 'reply' || seed.mode === 'replyAll') {
      const r = replyRecipients(original!, acc?.email ?? '', seed.mode === 'replyAll');
      // seed.html / seed.subject: a prepared reply (e.g. the AI triage reply draft), still quoted and editable.
      return { to: r.to, cc: r.cc, bcc: [], subject: seed.subject || replySubject(original!.subject), html: `${seed.html ?? '<p><br></p>'}${signatureBlock(acc?.signatureHtml)}${quoteForReply(original!)}`, attachments: [] };
    }
    if (seed.mode === 'forward') return { to: [], cc: [], bcc: [], subject: forwardSubject(original!.subject), html: `<p><br></p>${signatureBlock(acc?.signatureHtml)}${quoteForForward(original!)}`, attachments: [] };
    return { to: seed.to ?? [], cc: [], bcc: [], subject: seed.subject ?? '', html: `${seed.html ?? '<p><br></p>'}${signatureBlock(acc?.signatureHtml)}`, attachments: [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed.key]);

  const [to, setTo] = useState<Address[]>(initial.to);
  const [cc, setCc] = useState<Address[]>(initial.cc);
  const [bcc, setBcc] = useState<Address[]>(initial.bcc);
  const [showCc, setShowCc] = useState(initial.cc.length > 0);
  const [showBcc, setShowBcc] = useState(initial.bcc.length > 0);
  const [subject, setSubject] = useState(initial.subject);
  const [draftId, setDraftId] = useState<string | null>(seed.draft?.id ?? null);
  const [attachments, setAttachments] = useState<MailAttachment[]>(initial.attachments.filter((a) => !a.inline));
  const [forwardIds] = useState<string[]>(seed.mode === 'forward' ? (original?.attachments.filter((a) => !a.inline).map((a) => a.id) ?? []) : []);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [sending, setSending] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const dirty = useRef(false);
  const lastSaved = useRef('');
  const draftRef = useRef<string | null>(draftId);
  draftRef.current = draftId;
  const inflight = useRef<Promise<void> | null>(null);
  const templates = useTemplates(templatesOpen);

  const payload = useCallback(
    () => ({
      accountId,
      to,
      cc,
      bcc,
      subject,
      html: editor.current?.getHtml() ?? '',
      replyToMessageId: seed.mode === 'reply' || seed.mode === 'replyAll' ? (original?.id ?? null) : (seed.draft?.inReplyTo ? undefined : null),
      forwardOfMessageId: seed.mode === 'forward' ? (original?.id ?? null) : null,
    }),
    [accountId, to, cc, bcc, subject, seed.mode, seed.draft, original],
  );

  /** Creates or updates the draft; returns its id. */
  const save = useCallback(async (): Promise<string | null> => {
    if (!accountId) return null;
    const body = payload();
    const key = JSON.stringify(body);
    if (key === lastSaved.current && draftRef.current) return draftRef.current;
    if (inflight.current) await inflight.current;
    setSaving('saving');
    const run = (async () => {
      try {
        if (draftRef.current) {
          await api.patch(`/mail/drafts/${draftRef.current}`, { to: body.to, cc: body.cc, bcc: body.bcc, subject: body.subject, html: body.html });
        } else {
          const res = await api.post<{ draft: MessageDetail }>('/mail/drafts', body);
          draftRef.current = res.data.draft.id;
          setDraftId(res.data.draft.id);
        }
        lastSaved.current = key;
        dirty.current = false;
        setSaving('saved');
      } catch (err) {
        setSaving('error');
        console.error('[mail] draft save failed', err);
      }
    })();
    inflight.current = run;
    await run;
    inflight.current = null;
    return draftRef.current;
  }, [accountId, payload]);

  const markDirty = () => {
    dirty.current = true;
    if (saving === 'saved') setSaving('idle');
  };

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (dirty.current && !sending) void save();
    }, AUTOSAVE_MS);
    return () => window.clearInterval(timer);
  }, [save, sending]);

  useEffect(() => {
    dirty.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to, cc, bcc, subject, accountId]);

  const ensureDraft = async () => draftRef.current ?? (await save());

  const upload = async (files: FileList | File[]) => {
    const id = await ensureDraft();
    if (!id) return;
    for (const file of Array.from(files)) {
      const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploads((u) => [...u, { id: uid, name: file.name, size: file.size, percent: 0 }]);
      const form = new FormData();
      form.append('file', file, file.name);
      try {
        const res = await api.post<{ attachment: MailAttachment }>(`/mail/drafts/${id}/attachments`, form, {
          headers: { 'Content-Type': 'multipart/form-data' },
          onUploadProgress: (e) => setUploads((u) => u.map((x) => (x.id === uid ? { ...x, percent: e.total ? Math.round((e.loaded / e.total) * 100) : 50 } : x))),
        });
        setAttachments((a) => [...a, res.data.attachment]);
        setUploads((u) => u.filter((x) => x.id !== uid));
      } catch (err) {
        const text = errorText(err);
        setUploads((u) => u.map((x) => (x.id === uid ? { ...x, error: text } : x)));
        toast.error(text);
      }
    }
  };

  const removeAttachment = async (a: MailAttachment) => {
    if (!draftRef.current) return;
    try {
      await api.delete(`/mail/drafts/${draftRef.current}/attachments/${a.id}`);
      setAttachments((list) => list.filter((x) => x.id !== a.id));
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const send = async () => {
    if (sending) return;
    const all = [...to, ...cc, ...bcc];
    if (!all.length) {
      toast.error(t('mail.compose.noRecipients'));
      return;
    }
    const bad = all.find((a) => !EMAIL_RE.test(a.address));
    if (bad) {
      toast.error(t('mail.compose.invalidAddress', { value: bad.address }));
      return;
    }
    if (uploads.some((u) => !u.error)) return;
    setSending(true);
    try {
      if (inflight.current) await inflight.current;
      const html = editor.current?.getHtml() ?? '';
      const res = await api.post<{ message: MessageDetail }>('/mail/send', {
        accountId,
        to,
        cc,
        bcc,
        subject,
        html: isEmptyHtml(html) ? '<p></p>' : html,
        text: htmlToText(html),
        draftId: draftRef.current,
        replyToMessageId: seed.mode === 'reply' || seed.mode === 'replyAll' ? original?.id : undefined,
        forwardOfMessageId: seed.mode === 'forward' ? original?.id : undefined,
        attachmentIds: [...attachments.map((a) => a.id), ...forwardIds],
      });
      toast.success(t('mail.compose.sent'));
      dirty.current = false;
      invalidate();
      onSent(res.data.message);
    } catch (err) {
      toast.error(errorText(err));
      setSending(false);
    }
  };

  const discard = async () => {
    if (inflight.current) await inflight.current;
    if (draftRef.current) {
      try {
        await api.delete(`/mail/drafts/${draftRef.current}`);
      } catch {
        /* already gone */
      }
      invalidate();
    }
    dirty.current = false;
    onClose();
  };

  const close = () => {
    if (dirty.current) void save().then(() => invalidate());
    else if (draftRef.current) invalidate();
    onClose();
  };

  const title = seed.mode === 'reply' || seed.mode === 'replyAll' ? t('mail.compose.reply') : seed.mode === 'forward' ? t('mail.compose.forward') : subject || t('mail.compose.title');

  if (minimized) {
    return (
      <div className="fixed right-4 bottom-0 z-[70] flex w-72 items-center gap-2 rounded-t-xl border border-b-0 border-line bg-navy-900 px-3 py-2 text-white shadow-xl">
        <PenLine className="size-4 shrink-0" />
        <button type="button" onClick={() => setMinimized(false)} className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
          {title}
        </button>
        <button type="button" onClick={() => setMinimized(false)} className="grid size-7 place-items-center rounded-md hover:bg-white/10" aria-label={t('mail.compose.restore')}>
          <Maximize2 className="size-3.5" />
        </button>
        <button type="button" onClick={close} className="grid size-7 place-items-center rounded-md hover:bg-white/10" aria-label={t('mail.actions.close')}>
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={clsx(
        'fixed z-[70] flex flex-col overflow-hidden border border-line bg-card text-ink shadow-[0_24px_60px_-12px_rgba(11,31,68,0.45)]',
        maximized ? 'inset-2 rounded-2xl sm:inset-6' : 'inset-x-0 bottom-0 h-[85dvh] rounded-t-2xl sm:inset-x-auto sm:right-4 sm:h-[36rem] sm:max-h-[calc(100dvh-2rem)] sm:w-[40rem] sm:max-w-[calc(100vw-2rem)]',
        dragging && 'ring-4 ring-brand-500/30',
      )}
      role="dialog"
      aria-label={title}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
    >
      <div className="flex shrink-0 items-center gap-1 bg-navy-900 px-3 py-2 text-white">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</span>
        <span className="mr-1 text-[0.65rem] text-white/60">{saving === 'saving' ? t('mail.compose.draftSaving') : saving === 'saved' ? t('mail.compose.draftSaved') : saving === 'error' ? t('mail.compose.draftError') : ''}</span>
        <button type="button" onClick={() => setMinimized(true)} className="grid size-7 place-items-center rounded-md hover:bg-white/10" aria-label={t('mail.compose.minimize')}>
          <Minimize2 className="size-3.5" />
        </button>
        <button type="button" onClick={() => setMaximized((m) => !m)} className="hidden size-7 place-items-center rounded-md hover:bg-white/10 sm:grid" aria-label={t('mail.compose.restore')}>
          <Maximize2 className="size-3.5" />
        </button>
        <button type="button" onClick={close} className="grid size-7 place-items-center rounded-md hover:bg-white/10" aria-label={t('mail.actions.close')}>
          <X className="size-3.5" />
        </button>
      </div>

      <div className="shrink-0 divide-y divide-line border-b border-line px-3 text-sm">
        {accounts.length > 1 && (
          <label className="flex items-center gap-2 py-1">
            <span className="w-12 shrink-0 text-xs text-muted">{t('mail.compose.from')}</span>
            <select
              value={accountId}
              onChange={(e) => {
                setAccountId(e.target.value);
                markDirty();
              }}
              className="min-w-0 flex-1 bg-transparent py-1 text-sm text-ink outline-none"
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName ? `${a.displayName} <${a.email}>` : a.email}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="flex items-start gap-2">
          <span className="w-12 shrink-0 pt-2.5 text-xs text-muted">{t('mail.compose.to')}</span>
          <RecipientInput value={to} onChange={setTo} autoFocus={seed.mode === 'new' || seed.mode === 'forward'} onInvalid={(v) => toast.error(t('mail.compose.invalidAddress', { value: v }))} />
          <span className="flex shrink-0 gap-1 pt-1.5 text-xs">
            {!showCc && (
              <button type="button" onClick={() => setShowCc(true)} className="rounded px-1 text-muted hover:text-ink">
                {t('mail.compose.cc')}
              </button>
            )}
            {!showBcc && (
              <button type="button" onClick={() => setShowBcc(true)} className="rounded px-1 text-muted hover:text-ink">
                {t('mail.compose.bcc')}
              </button>
            )}
          </span>
        </div>
        {showCc && (
          <div className="flex items-start gap-2">
            <span className="w-12 shrink-0 pt-2.5 text-xs text-muted">{t('mail.compose.cc')}</span>
            <RecipientInput value={cc} onChange={setCc} onInvalid={(v) => toast.error(t('mail.compose.invalidAddress', { value: v }))} />
          </div>
        )}
        {showBcc && (
          <div className="flex items-start gap-2">
            <span className="w-12 shrink-0 pt-2.5 text-xs text-muted">{t('mail.compose.bcc')}</span>
            <RecipientInput value={bcc} onChange={setBcc} onInvalid={(v) => toast.error(t('mail.compose.invalidAddress', { value: v }))} />
          </div>
        )}
        <label className="flex items-center gap-2">
          <span className="w-12 shrink-0 text-xs text-muted">{t('mail.compose.subject')}</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} className="min-w-0 flex-1 bg-transparent py-2 text-sm text-ink outline-none placeholder:text-muted/70" placeholder={t('mail.compose.subject')} autoFocus={seed.mode === 'new' && to.length > 0} />
        </label>
      </div>

      <RichEditor ref={editor} initialHtml={initial.html} placeholder={t('mail.compose.body')} onChange={markDirty} onSend={() => void send()} className="min-h-0 flex-1" autoFocus={seed.mode === 'reply' || seed.mode === 'replyAll' || seed.mode === 'draft'} />

      {(seed.mode === 'reply' || seed.mode === 'replyAll') && original && (
        <div className="shrink-0 border-t border-line px-3 pt-2 pb-1">
          {/* AI reply suggestion (staff AI): only for mail linked to a case or coming from a client; inserted, never sent. */}
          <ReplyDraftButton
            endpoint={`/admin/ai-staff/mail/${original.id}/reply-draft`}
            onInsert={(text) => editor.current?.insertHtml(textToHtml(text))}
          />
        </div>
      )}

      {(attachments.length > 0 || uploads.length > 0 || forwardIds.length > 0) && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-t border-line px-3 py-2">
          {seed.mode === 'forward' &&
            original?.attachments
              .filter((a) => !a.inline)
              .map((a) => (
                <span key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs">
                  <Paperclip className="size-3 text-muted" /> <span className="max-w-[12rem] truncate">{a.filename}</span> <span className="text-muted">{formatBytes(a.size)}</span>
                </span>
              ))}
          {attachments.map((a) => (
            <span key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2 py-1 text-xs">
              <Paperclip className="size-3 text-muted" /> <span className="max-w-[12rem] truncate">{a.filename}</span> <span className="text-muted">{formatBytes(a.size)}</span>
              <button type="button" onClick={() => void removeAttachment(a)} className="grid size-4 place-items-center rounded-full text-muted hover:text-danger" aria-label={t('mail.actions.delete')}>
                <X className="size-3" />
              </button>
            </span>
          ))}
          {uploads.map((u) => (
            <span key={u.id} className={clsx('relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg border px-2 py-1 text-xs', u.error ? 'border-danger/40 text-danger' : 'border-line text-muted')}>
              {!u.error && <span className="absolute inset-y-0 left-0 bg-brand-100/70" style={{ width: `${u.percent}%` }} aria-hidden />}
              <span className="relative max-w-[12rem] truncate">{u.name}</span>
              <span className="relative">{u.error ?? t('mail.compose.uploading', { percent: u.percent })}</span>
              {u.error && (
                <button type="button" onClick={() => setUploads((x) => x.filter((y) => y.id !== u.id))} className="relative grid size-4 place-items-center" aria-label={t('mail.actions.close')}>
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      <div className="flex shrink-0 items-center gap-1 border-t border-line px-3 py-2">
        <button type="button" onClick={() => void send()} disabled={sending || !account} className="btn-primary btn-sm" title={t('mail.compose.sendShortcut')}>
          {sending ? <Spinner className="size-3.5" /> : <Send className="size-3.5" />} {t('mail.actions.send')}
        </button>
        <label className="grid size-9 cursor-pointer place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" title={t('mail.compose.attach')}>
          <Paperclip className="size-4" />
          <input type="file" multiple className="sr-only" onChange={(e) => e.target.files && void upload(e.target.files)} />
        </label>
        <button type="button" onClick={() => editor.current?.insertHtml(signatureBlock(account?.signatureHtml))} disabled={!account?.signatureHtml} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink disabled:opacity-40" title={t('mail.compose.insertSignature')} aria-label={t('mail.compose.insertSignature')}>
          <PenLine className="size-4" />
        </button>
        <div className="relative">
          <button type="button" onClick={() => setTemplatesOpen((o) => !o)} className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-muted hover:bg-surface hover:text-ink" title={t('mail.compose.templates')}>
            <FileText className="size-4" /> <ChevronDown className="size-3" />
          </button>
          <Popover open={templatesOpen} onClose={() => setTemplatesOpen(false)} className="w-64">
            {(templates.data ?? []).map((tpl) => (
              <MenuItem
                key={tpl.id}
                icon={<FileText className="size-3.5 text-muted" />}
                onClick={() => {
                  setTemplatesOpen(false);
                  if (tpl.subject && !subject) setSubject(tpl.subject);
                  editor.current?.insertHtml(tpl.html);
                }}
              >
                {tpl.name}
              </MenuItem>
            ))}
            {templates.isFetched && !templates.data?.length && <p className="px-2 py-3 text-center text-sm text-muted">{t('mail.compose.noTemplates')}</p>}
          </Popover>
        </div>
        <span className="flex-1" />
        <span className="hidden text-[0.65rem] text-muted sm:inline">{t('mail.compose.sendShortcut')}</span>
        <button type="button" onClick={() => setConfirmDiscard(true)} className="grid size-9 place-items-center rounded-lg text-muted hover:bg-surface hover:text-danger" title={t('mail.actions.discard')} aria-label={t('mail.actions.discard')}>
          <Trash2 className="size-4" />
        </button>
      </div>
      {dragging && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-brand-600/10 text-sm font-semibold text-brand-700">
          {t('mail.compose.dropHint')}
        </div>
      )}
      <Confirm open={confirmDiscard} onClose={() => setConfirmDiscard(false)} onConfirm={() => void discard()} title={t('mail.actions.discard')} message={t('mail.compose.discardConfirm')} confirmLabel={t('mail.actions.discard')} />
    </div>
  );
};

export const composeTitle = (m: MessageDetail) => subjectOf(m);
