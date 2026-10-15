import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';
import { calendarApi } from './api';
import type { EventDto } from './types';
import { errorText, fmtDateTimeShort } from './utils';

/** One-line natural quick add ("Sabah 15:00 görüş") with a live preview of the parsed start. */
export const QuickAdd = ({ onCreated }: { onCreated: (e: EventDto) => void }) => {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ title: string; startsAt: string } | null>(null);

  useEffect(() => {
    if (!text.trim()) {
      setPreview(null);
      return;
    }
    const id = window.setTimeout(() => {
      calendarApi
        .preview(text.trim())
        .then((p) => setPreview({ title: p.title, startsAt: p.startsAt }))
        .catch(() => setPreview(null));
    }, 350);
    return () => window.clearTimeout(id);
  }, [text]);

  const submit = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const { event } = await calendarApi.quick(text.trim());
      toast.success(t('calendar.toasts.created'));
      setText('');
      onCreated(event);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="relative min-w-0 flex-1"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <Sparkles className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-brand-500" aria-hidden />
      <input value={text} onChange={(e) => setText(e.target.value)} placeholder={t('calendar.quickAdd.placeholder')} aria-label={t('calendar.quickAdd.placeholder')} maxLength={300} className="input py-2 pr-20 pl-9 text-sm" title={t('calendar.quickAdd.hint')} />
      {preview && text.trim() && <span className="pointer-events-none absolute top-full left-3 mt-0.5 truncate text-[0.68rem] text-muted">{`${preview.title} · ${t('calendar.quickAdd.preview', { when: fmtDateTimeShort(new Date(preview.startsAt)) })}`}</span>}
      <button type="submit" disabled={!text.trim() || busy} className="btn-primary btn-sm absolute top-1/2 right-1.5 -translate-y-1/2 px-3 py-1">
        {busy ? <Loader2 className="size-3.5 animate-spin" /> : t('calendar.quickAdd.add')}
      </button>
    </form>
  );
};
