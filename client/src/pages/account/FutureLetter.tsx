import { useEffect, useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Lock, Mail, PenLine, Save, Trash2 } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesGermanyReady } from '@/i18n/pagesGermanyReady';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { confirmDialog } from '@/components/ui/confirmStore';

registerCopy(pagesGermanyReady);

interface LetterView {
  arrived: boolean;
  maxChars: number;
  letter: {
    body: string | null;
    hidden: boolean;
    deliverOn: string | null;
    delivered: boolean;
    deliveredAt: string | null;
    deliveredVia: 'ARRIVAL' | 'DATE' | null;
    createdAt: string;
    updatedAt: string;
  } | null;
}

const KEY = ['future-letter'] as const;

const tomorrow = () => {
  const d = new Date(Date.now() + 86_400_000);
  return d.toISOString().slice(0, 10);
};

/**
 * /account/future-letter — "Letter to my future self": written before the arrival, sealed on the server (staff
 * cannot read it), delivered by e-mail and shown here on the day the arrival is recorded (or on the fallback date).
 * Editable until delivered, deletable any time.
 */
export default function AccountFutureLetter() {
  const { t } = useTranslation();
  const { date } = useL10n();
  usePageTitle(t('futureLetter.title'));
  const id = useId();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<LetterView>('/account/future-letter')).data });
  const [body, setBody] = useState('');
  const [deliverOn, setDeliverOn] = useState('');
  const f = (k: string, o?: Record<string, unknown>) => String(t(`futureLetter.${k}`, o));
  const onError = (err: unknown) => {
    const code = errorCode(err);
    toast.error(t(`futureLetter.errors.${code}`, { defaultValue: f('errors.generic') }));
  };

  useEffect(() => {
    if (!q.data?.letter) return;
    setBody(q.data.letter.body ?? '');
    setDeliverOn(q.data.letter.deliverOn ?? '');
  }, [q.data?.letter]);

  const save = useMutation({
    mutationFn: async () => (await api.put<LetterView>('/account/future-letter', { body, deliverOn: deliverOn || null })).data,
    onSuccess: (data) => {
      qc.setQueryData(KEY, data);
      toast.success(f('saved'));
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: async () => api.delete('/account/future-letter'),
    onSuccess: () => {
      setBody('');
      setDeliverOn('');
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success(f('deleted'));
    },
    onError,
  });

  if (q.isLoading || !q.data) {
    return (
      <div className="grid place-items-center py-16" role="status">
        <Spinner className="size-6" />
      </div>
    );
  }
  const { letter, arrived, maxChars } = q.data;
  const askDelete = async () => {
    if (await confirmDialog({ title: f('delete'), message: f('deleteConfirm'), tone: 'danger', confirmLabel: f('delete') })) remove.mutate();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <h2 className="type-page-title flex items-center gap-2 text-ink">
          <PenLine className="size-6 text-primary" aria-hidden /> {f('title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{f('intro')}</p>
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-success-bg px-3 py-2 text-xs text-success-fg">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {f('privacy')}
        </p>
      </header>

      {letter?.hidden ? (
        <p className="card p-5 text-sm text-muted">{f('hidden')}</p>
      ) : letter?.delivered ? (
        <article className="card space-y-3 p-5 sm:p-7" aria-labelledby={`${id}-delivered`}>
          <h3 id={`${id}-delivered`} className="flex items-center gap-2 font-display text-xl font-semibold text-ink">
            <Mail className="size-5 text-primary" aria-hidden /> {f('deliveredTitle')}
          </h3>
          <p className="text-xs text-muted">
            {f('written', { date: date(letter.updatedAt) })} · {letter.deliveredAt && f('deliveredAt', { date: date(letter.deliveredAt) })}
          </p>
          <div className="rounded-2xl bg-highlight-bg p-4 text-[15px] leading-relaxed whitespace-pre-wrap text-ink sm:p-6">{letter.body}</div>
          <Button variant="danger" icon={Trash2} loading={remove.isPending} onClick={() => void askDelete()}>
            {f('delete')}
          </Button>
        </article>
      ) : arrived && !letter ? (
        <p className="card p-5 text-sm text-muted">{f('arrivedNoLetter')}</p>
      ) : (
        <form
          className="card space-y-4 p-5 sm:p-6"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          {letter && <p className="rounded-xl bg-sunken px-3 py-2 text-sm text-ink">{f('pending')}</p>}
          <div>
            <label htmlFor={`${id}-body`} className="label">
              {f('label')}
            </label>
            <textarea
              id={`${id}-body`}
              className="input min-h-72 w-full resize-y leading-relaxed"
              value={body}
              maxLength={maxChars}
              placeholder={f('placeholder')}
              onChange={(e) => setBody(e.target.value)}
              aria-describedby={`${id}-count`}
            />
            <p id={`${id}-count`} className="mt-1 text-right text-xs text-muted tabular-nums" aria-live="polite">
              {f('count', { count: body.length, max: maxChars })}
            </p>
          </div>
          <div>
            <label htmlFor={`${id}-date`} className="label">
              {f('fallback')}
            </label>
            <input id={`${id}-date`} type="date" className="input min-h-11" min={tomorrow()} value={deliverOn} onChange={(e) => setDeliverOn(e.target.value)} aria-describedby={`${id}-date-hint`} />
            <p id={`${id}-date-hint`} className="mt-1 text-xs text-muted">
              {f('fallbackHint')}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button type="submit" icon={Save} loading={save.isPending} disabled={!body.trim()}>
              {f('save')}
            </Button>
            {letter && (
              <Button variant="ghost" icon={Trash2} loading={remove.isPending} onClick={() => void askDelete()}>
                {f('delete')}
              </Button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
