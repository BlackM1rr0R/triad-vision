import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Mail, X } from 'lucide-react';
import clsx from 'clsx';
import { buttonClass } from '@/components/ui/Button';
import { api, errorCode } from '@/lib/api';
import { leadContext } from '@/lib/leadVisitor';
import { trackToolUse } from '@/lib/toolAnalytics';
import { currentSiteLocale, registerCopy } from '@/i18n';
import { pagesToolConversion } from '@/i18n/pagesToolConversion';

registerCopy(pagesToolConversion);

/** One line of the result as the e-mail shows it (plain text, no links — the server refuses URLs). */
export interface ResultLine {
  label: string;
  value: string;
}

export interface EmailResultProps {
  /** Tool slug = the tool's path without the leading slash ("salary-calculator", "work-scenes/truck-cab"). */
  tool: string;
  /** The result as label / value lines (max 12; label ≤ 80, value ≤ 160 characters). Empty = block hidden. */
  summary: ResultLine[];
  /**
   * When the block counts an interaction for tool analytics: 'change' (default, calculators) = the first time the
   * result changes after the page opened; 'mount' (quizzes, games) = as soon as the block appears with a result.
   */
  countUse?: 'change' | 'mount' | 'never';
  /** Page path (+ query with the inputs) the e-mail links back to; default: the current URL. */
  path?: string;
  className?: string;
  /** Compact style for embedded widgets. */
  compact?: boolean;
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
/** Same rule as the server: no URLs / e-mail addresses / HTML in the lines. */
const safe = (s: string) => s.replace(/https?:\/\/\S+|www\.\S+|[<>@]/gi, '').replace(/\s+/g, ' ').trim();

export const cleanSummary = (summary: ResultLine[]) =>
  summary
    .map((l) => ({ label: clip(safe(l.label), 80), value: clip(safe(l.value), 160) }))
    .filter((l) => l.label && l.value)
    .slice(0, 12);

/**
 * "E-mail me my result": a button under a tool's result that opens a small form (e-mail, optional name / phone,
 * a separate unticked follow-up consent). POST /api/tools/result-email stores a lead for the team (inquiries,
 * source "tool:<slug>") and sends the result e-mail in the page language; the follow-up needs a double opt-in
 * (server lib/toolLeads). Drop it under any result:
 *
 *   <EmailResult tool="salary-calculator" summary={[{ label: t('…net'), value: euro(net) }, …]} />
 */
export const EmailResult = ({ tool, summary, countUse = 'change', path, className, compact = false }: EmailResultProps) => {
  const { t } = useTranslation();
  const id = useId();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: '', name: '', phone: '', followUp: false, website: '' });
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error' | 'rate'>('idle');
  const [sentFollowUp, setSentFollowUp] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const lines = cleanSummary(summary);
  const key = JSON.stringify(lines);

  // Interaction counter (tool analytics): first result change, or the result itself for quizzes.
  const firstKey = useRef<string | null>(null);
  useEffect(() => {
    if (countUse === 'never' || !lines.length) return;
    if (countUse === 'mount') {
      trackToolUse(tool);
      return;
    }
    if (firstKey.current === null) firstKey.current = key;
    else if (firstKey.current !== key) trackToolUse(tool);
  }, [key, countUse, tool, lines.length]);

  useEffect(() => {
    if (open) emailRef.current?.focus();
  }, [open]);

  if (!lines.length) return null;
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setState('sending');
    try {
      const { data } = await api.post<{ ok: boolean; followUp: boolean }>('/tools/result-email', {
        tool,
        email: form.email.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        followUp: form.followUp,
        website: form.website,
        lng: currentSiteLocale(),
        summary: lines,
        path: (path ?? `${location.pathname}${location.search}`).slice(0, 600),
        ...leadContext(),
      });
      setSentFollowUp(data.followUp);
      setState('done');
      trackToolUse(tool);
    } catch (err) {
      setState(errorCode(err) === 'TOO_MANY_REQUESTS' ? 'rate' : 'error');
    }
  };

  const box = clsx('rounded-2xl border border-line bg-card', compact ? 'p-3' : 'p-4 sm:p-5', className);

  if (state === 'done') {
    return (
      <div className={box} role="status">
        <p className="flex items-center gap-2 font-display font-semibold text-ink">
          <CheckCircle2 className="size-5 text-success" aria-hidden /> {t('toolConv.email.doneTitle')}
        </p>
        <p className="mt-1 text-sm text-muted">{t('toolConv.email.doneText', { email: form.email })}</p>
        {sentFollowUp && <p className="mt-1 text-sm text-muted">{t('toolConv.email.doneFollowUp')}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <div className={className}>
        <button type="button" onClick={() => setOpen(true)} className={buttonClass({ variant: 'outline', size: compact ? 'sm' : 'md', block: compact })} aria-expanded={false} aria-controls={`${id}-form`}>
          <Mail className="size-4" aria-hidden /> {t('toolConv.email.cta')}
        </button>
      </div>
    );
  }

  return (
    <form id={`${id}-form`} onSubmit={submit} className={clsx(box, 'space-y-3')} aria-labelledby={`${id}-title`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p id={`${id}-title`} className="flex items-center gap-2 font-display font-semibold text-ink">
            <Mail className="size-4 text-primary" aria-hidden /> {t('toolConv.email.title')}
          </p>
          {!compact && <p className="mt-0.5 text-sm text-muted">{t('toolConv.email.text')}</p>}
        </div>
        <button type="button" onClick={() => setOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink" aria-label={t('toolConv.email.close')}>
          <X className="size-4" aria-hidden />
        </button>
      </div>
      <div className={clsx('grid gap-3', !compact && 'sm:grid-cols-3')}>
        <div className={clsx(!compact && 'sm:col-span-3')}>
          <label htmlFor={`${id}-email`} className="label">
            {t('toolConv.email.email')}
          </label>
          <input ref={emailRef} id={`${id}-email`} type="email" className="input" required maxLength={190} autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        {!compact && (
          <>
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-name`} className="label">
                {t('toolConv.email.name')} <span className="font-normal text-muted">({t('toolConv.email.optional')})</span>
              </label>
              <input id={`${id}-name`} className="input" maxLength={120} autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div>
              <label htmlFor={`${id}-phone`} className="label">
                {t('toolConv.email.phone')} <span className="font-normal text-muted">({t('toolConv.email.optional')})</span>
              </label>
              <input id={`${id}-phone`} type="tel" className="input" maxLength={40} autoComplete="tel" pattern="[+0-9][0-9 ()-]{5,}" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </>
        )}
      </div>
      {/* honeypot for bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={form.website} onChange={(e) => set('website', e.target.value)} />
      <label className="flex cursor-pointer items-start gap-3 text-sm leading-snug text-ink">
        <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-primary" checked={form.followUp} onChange={(e) => set('followUp', e.target.checked)} aria-describedby={`${id}-fu`} />
        <span>
          {t('toolConv.email.followUp')}
          <span id={`${id}-fu`} className="mt-0.5 block text-xs text-muted">
            {t('toolConv.email.followUpHint')}
          </span>
        </span>
      </label>
      <p className="text-xs leading-relaxed text-muted">
        {t('toolConv.email.privacy')}{' '}
        <Link to="/privacy" target="_blank" className="font-semibold text-link underline-offset-2 hover:underline">
          {t('toolConv.email.privacyLink')}
        </Link>
      </p>
      {(state === 'error' || state === 'rate') && (
        <p className="rounded-lg bg-danger-bg p-3 text-sm text-danger-fg" role="alert">
          {t(state === 'rate' ? 'toolConv.email.errorRate' : 'toolConv.email.error')}
        </p>
      )}
      <button type="submit" className={buttonClass({ block: true })} disabled={state === 'sending'}>
        <Mail className="size-4" aria-hidden /> {state === 'sending' ? t('toolConv.email.sending') : t('toolConv.email.submit')}
      </button>
    </form>
  );
};
