import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { toContentLocale } from '@/i18n';
import { CheckCircle2, Send } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { leadContext } from '@/lib/leadVisitor';
import { Spinner } from '@/components/ui/Spinner';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Contact form of the public advisor and the quiz: name + e-mail or phone with explicit consent →
 * POST /api/public-ai/lead (an Inquiry marked "AI advisor" that notifies the staff).
 */
export const LeadForm = ({
  source,
  transcript,
  answers,
  onCancel,
  compact,
}: {
  source: 'advisor' | 'quiz';
  transcript?: ChatTurn[];
  answers?: Record<string, string>;
  onCancel?: () => void;
  compact?: boolean;
}) => {
  const { t, i18n } = useTranslation();
  const ids = { name: useId(), email: useId(), phone: useId(), consent: useId(), hp: useId() };
  const [form, setForm] = useState({ name: '', email: '', phone: '', consent: false, website: '' });
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'error'>('idle');
  const [errorText, setErrorText] = useState('');
  const valid = form.name.trim().length >= 2 && (form.email.trim() || form.phone.trim()) && form.consent;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setState('busy');
    try {
      await api.post('/public-ai/lead', {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        consent: true,
        source,
        lang: toContentLocale(i18n.resolvedLanguage),
        transcript: (transcript ?? []).slice(-12).map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
        ...(answers ? { answers } : {}),
        ...(form.website ? { website: form.website } : {}),
        ...leadContext(), // lead scoring: visitor id (consent only) + campaign
      });
      setState('sent');
    } catch (err) {
      setErrorText(errorCode(err) === 'TOO_MANY_REQUESTS' ? t('pai.bubble.limitHour') : t('pai.lead.error'));
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-success-border bg-success-bg p-3 text-sm text-success-fg" role="status">
        <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> {t('pai.lead.sent')}
      </p>
    );
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-2.5 rounded-xl border border-line bg-card p-3" noValidate>
      <p className="text-sm font-semibold text-ink">{t('pai.lead.title')}</p>
      <div className={compact ? 'space-y-2' : 'grid gap-2 sm:grid-cols-3'}>
        <div>
          <label htmlFor={ids.name} className="sr-only">
            {t('pai.lead.name')}
          </label>
          <input id={ids.name} className="input" autoComplete="name" maxLength={120} placeholder={t('pai.lead.name')} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
        <div>
          <label htmlFor={ids.phone} className="sr-only">
            {t('pai.lead.phone')}
          </label>
          <input id={ids.phone} className="input" type="tel" autoComplete="tel" maxLength={30} placeholder={t('pai.lead.phone')} value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
        <div>
          <label htmlFor={ids.email} className="sr-only">
            {t('pai.lead.email')}
          </label>
          <input id={ids.email} className="input" type="email" autoComplete="email" maxLength={200} placeholder={t('pai.lead.email')} value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
      </div>
      <p className="text-[11px] text-muted">{t('pai.lead.contactHint')}</p>
      {/* Honeypot: hidden from people and assistive tech, bots fill it. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={ids.hp}>Website</label>
        <input id={ids.hp} tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
      </div>
      <label htmlFor={ids.consent} className="flex items-start gap-2 text-xs text-ink/80">
        <input id={ids.consent} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={form.consent} onChange={(e) => setForm((f) => ({ ...f, consent: e.target.checked }))} />
        <span>
          {t('pai.lead.consent')}{' '}
          <Link to="/privacy" className="font-semibold text-link underline">
            {t('pai.lead.privacy')}
          </Link>
        </span>
      </label>
      {state === 'error' && (
        <p className="text-xs font-medium text-danger" role="alert">
          {errorText}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn-primary btn-sm" disabled={!valid || state === 'busy'}>
          {state === 'busy' ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {t('pai.lead.submit')}
        </button>
        {onCancel && (
          <button type="button" className="btn-ghost btn-sm" onClick={onCancel}>
            {t('pai.lead.cancel')}
          </button>
        )}
      </div>
    </form>
  );
};

export default LeadForm;
