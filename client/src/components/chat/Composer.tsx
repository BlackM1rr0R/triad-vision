import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FileText, FolderOpen, Loader2, Paperclip, SendHorizonal, SmilePlus, X } from 'lucide-react';
import { chatApi } from './api';
import { Avatar, EmojiPicker } from './bits';
import { DrivePickerDialog } from './Dialogs';
import type { Attachment, PendingUpload, Person } from './types';
import { autosize, errorText, formatBytes, fullName, isImage } from './utils';

const MAX_BYTES = 25 * 1024 * 1024;
const TYPING_EVERY_MS = 2500;

export interface SendPayload {
  body: string;
  attachmentIds: string[];
  mentions: string[];
}

/** Composer with autosize, @mention autocomplete, uploads (button, drag & drop, paste) and drive links. */
export const Composer = ({
  people,
  placeholder,
  onSend,
  onTyping,
  autoFocus = false,
  compact = false,
  disabled = false,
  channelKey,
}: {
  people: Person[];
  placeholder: string;
  onSend: (p: SendPayload) => Promise<void>;
  onTyping?: () => void;
  autoFocus?: boolean;
  compact?: boolean;
  disabled?: boolean;
  /** resets the draft when it changes (channel / thread switch) */
  channelKey: string;
}) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');
  const [uploads, setUploads] = useState<PendingUpload[]>([]);
  const [mentionIds, setMentionIds] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [mention, setMention] = useState<{ at: number; q: string } | null>(null);
  const [mentionIdx, setMentionIdx] = useState(0);
  const lastTyping = useRef(0);

  useEffect(() => {
    setValue('');
    setUploads([]);
    setMentionIds(new Set());
    setMention(null);
    if (autoFocus) ref.current?.focus();
  }, [channelKey, autoFocus]);

  useEffect(() => autosize(ref.current, compact ? 160 : 240), [value, compact]);

  const candidates = useMemo(() => {
    if (!mention) return [];
    const q = mention.q.toLowerCase();
    const all = [{ id: '*', firstName: t('chat.composer.mentionAll'), lastName: '' } as Person, ...people];
    return all.filter((p) => !q || fullName(p).toLowerCase().includes(q) || (p.id === '*' && 'all'.startsWith(q))).slice(0, 8);
  }, [mention, people, t]);

  const detectMention = (text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = /(^|[^\p{L}\p{N}_])@([\p{L}\p{N}_ ]{0,40})$/u.exec(before);
    if (!m || m[2].includes('  ')) {
      setMention(null);
      return;
    }
    setMention({ at: caret - m[2].length - 1, q: m[2] });
    setMentionIdx(0);
  };

  const pickMention = (p: Person) => {
    if (!mention) return;
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const insert = p.id === '*' ? '@all ' : `@${fullName(p)} `;
    const next = `${value.slice(0, mention.at)}${insert}${value.slice(caret)}`;
    setValue(next);
    if (p.id !== '*') setMentionIds((s) => new Set(s).add(p.id));
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.at + insert.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const signalTyping = () => {
    const now = Date.now();
    if (now - lastTyping.current > TYPING_EVERY_MS) {
      lastTyping.current = now;
      onTyping?.();
    }
  };

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      for (const file of Array.from(files)) {
        if (file.size > MAX_BYTES) {
          toast.error(t('chat.composer.maxSize'));
          continue;
        }
        const localId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setUploads((u) => [...u, { localId, id: null, filename: file.name, mimeType: file.type, size: file.size, progress: 0 }]);
        void chatApi
          .upload(file, (p) => setUploads((u) => u.map((x) => (x.localId === localId ? { ...x, progress: p } : x))))
          .then((a: Attachment) => setUploads((u) => u.map((x) => (x.localId === localId ? { ...x, id: a.id, filename: a.filename, mimeType: a.mimeType, progress: 100 } : x))))
          .catch((err: unknown) => {
            toast.error(errorText(err));
            setUploads((u) => u.filter((x) => x.localId !== localId));
          });
      }
    },
    [t],
  );

  const addDriveFile = async (nodeId: string, name: string) => {
    const localId = `drive-${nodeId}`;
    if (uploads.some((u) => u.localId === localId)) return;
    setUploads((u) => [...u, { localId, id: null, filename: name, mimeType: '', size: 0, progress: 50, driveNodeId: nodeId }]);
    try {
      const a = await chatApi.fromDrive(nodeId);
      setUploads((u) => u.map((x) => (x.localId === localId ? { ...x, id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, progress: 100 } : x)));
    } catch (err) {
      toast.error(errorText(err));
      setUploads((u) => u.filter((x) => x.localId !== localId));
    }
  };

  const canSend = !sending && !disabled && (value.trim().length > 0 || uploads.some((u) => u.id)) && uploads.every((u) => u.id);

  const send = async () => {
    if (!canSend) return;
    const body = value.replace(/\s+$/, '');
    const mentions = [...mentionIds].filter((id) => {
      const p = people.find((x) => x.id === id);
      return p && body.toLowerCase().includes(`@${fullName(p).toLowerCase()}`);
    });
    setSending(true);
    try {
      await onSend({ body, attachmentIds: uploads.map((u) => u.id!).filter(Boolean), mentions });
      setValue('');
      setUploads([]);
      setMentionIds(new Set());
      requestAnimationFrame(() => {
        autosize(ref.current);
        ref.current?.focus();
      });
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && candidates.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setMentionIdx((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setMentionIdx((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        pickMention(candidates[mentionIdx]);
        return;
      }
      if (e.key === 'Escape') {
        setMention(null);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = Array.from(e.clipboardData.files ?? []).filter((f) => isImage(f.type) || f.type);
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  };

  const insertEmoji = (emoji: string) => {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const next = `${value.slice(0, caret)}${emoji}${value.slice(caret)}`;
    setValue(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(caret + emoji.length, caret + emoji.length);
    });
  };

  return (
    <div
      className={clsx('relative', compact ? 'px-3 pb-3' : 'px-4 pb-3')}
      onDragOver={(e) => {
        e.preventDefault();
        if (!dragging) setDragging(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-x-4 inset-y-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-brand-500 bg-brand-50/90 text-sm font-semibold text-brand-700">
          {t('chat.composer.dropHere')}
        </div>
      )}
      {/* Mention autocomplete */}
      {mention && candidates.length > 0 && (
        <ul className="absolute bottom-full left-4 z-20 mb-1 w-72 max-w-[calc(100%-2rem)] overflow-hidden rounded-xl border border-line bg-card p-1 shadow-xl" role="listbox">
          {candidates.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === mentionIdx}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pickMention(p);
                }}
                onMouseEnter={() => setMentionIdx(i)}
                className={clsx('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm', i === mentionIdx ? 'bg-brand-50 text-brand-700' : 'text-ink')}
              >
                {p.id === '*' ? <span className="grid size-6 place-items-center rounded-full bg-amber-100 text-xs font-bold text-amber-800">@</span> : <Avatar person={p} size="sm" />}
                <span className="truncate font-medium">{p.id === '*' ? 'all' : fullName(p)}</span>
                {p.id === '*' && <span className="truncate text-xs text-muted">{t('chat.composer.mentionAllHint')}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={clsx('rounded-xl border bg-field transition-colors focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/15', dragging ? 'border-brand-500' : 'border-line')}>
        {uploads.length > 0 && (
          <div className="flex flex-wrap gap-2 px-3 pt-2.5">
            {uploads.map((u) => (
              <span key={u.localId} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-line bg-card px-2 py-1 text-xs">
                {u.id ? <FileText className="size-3.5 shrink-0 text-brand-600" /> : <Loader2 className="size-3.5 shrink-0 animate-spin text-muted" />}
                <span className="truncate font-medium text-ink">{u.filename}</span>
                {u.id ? <span className="text-muted">{u.size ? formatBytes(u.size) : ''}</span> : <span className="text-muted">{t('chat.composer.uploading', { percent: u.progress })}</span>}
                <button type="button" onClick={() => setUploads((x) => x.filter((y) => y.localId !== u.localId))} className="grid size-5 place-items-center rounded-full text-muted hover:text-danger" aria-label={t('chat.composer.removeFile')}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={ref}
          value={value}
          disabled={disabled}
          onChange={(e) => {
            setValue(e.target.value);
            detectMention(e.target.value, e.target.selectionStart ?? e.target.value.length);
            signalTyping();
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onClick={(e) => detectMention(value, e.currentTarget.selectionStart ?? value.length)}
          rows={1}
          maxLength={4000}
          placeholder={placeholder}
          aria-label={placeholder}
          className="block w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm text-ink outline-none placeholder:text-muted/70"
        />
        <div className="flex items-center gap-0.5 px-2 pb-1.5">
          <button type="button" onClick={() => fileInput.current?.click()} disabled={disabled} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('chat.composer.attach')} title={t('chat.composer.attach')}>
            <Paperclip className="size-4" />
          </button>
          <button type="button" onClick={() => setDriveOpen(true)} disabled={disabled} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('chat.composer.fromDrive')} title={t('chat.composer.fromDrive')}>
            <FolderOpen className="size-4" />
          </button>
          <span className="relative">
            <button type="button" onClick={() => setEmojiOpen((o) => !o)} disabled={disabled} className="grid size-8 place-items-center rounded-lg text-muted hover:bg-surface hover:text-ink" aria-label={t('chat.composer.emoji')} title={t('chat.composer.emoji')}>
              <SmilePlus className="size-4" />
            </button>
            <EmojiPicker open={emojiOpen} onClose={() => setEmojiOpen(false)} onPick={insertEmoji} />
          </span>
          {!compact && <span className="ml-2 hidden text-[0.68rem] text-muted sm:inline">{t('chat.composer.hint')}</span>}
          <button type="button" onClick={() => void send()} disabled={!canSend} className={clsx('ml-auto grid size-8 place-items-center rounded-lg transition-colors', canSend ? 'bg-brand-600 text-white hover:bg-brand-700' : 'bg-surface text-muted')} aria-label={t('chat.composer.send')} title={t('chat.composer.send')}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizonal className="size-4" />}
          </button>
        </div>
      </div>
      <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && (addFiles(e.target.files), (e.target.value = ''))} />
      <DrivePickerDialog open={driveOpen} onClose={() => setDriveOpen(false)} onPick={(id, name) => void addDriveFile(id, name)} />
    </div>
  );
};
