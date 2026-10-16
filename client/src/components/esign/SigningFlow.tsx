import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  BadgeCheck,
  Ban,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Download,
  ExternalLink,
  FileSignature,
  FileText,
  Hourglass,
  KeyRound,
  Mail,
  PenLine,
  Scale,
  ShieldCheck,
  Type,
  XCircle,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { Spinner } from '@/components/ui/Spinner';
import { SignaturePad, type SignaturePadHandle } from '@/components/portal/SignaturePad';
import { SIGNER_TONE, STATUS_TONE, useEsignError, type SigningView } from './api';

/**
 * The signing experience shared by the public link page (/sign/:token, identity confirmed with an
 * emailed code) and the portals (logged-in candidate, employer or staff member).
 * `base` is the API prefix: `/sign/<token>` or `/signatures/my/<signerId>`.
 */
export const SigningFlow = ({ view, base, onChange }: { view: SigningView; base: string; onChange: (v: SigningView) => void }) => {
  const { t } = useTranslation();
  const { date, dateTime } = useL10n();
  const r = view.request;
  const me = view.me;
  const needsCode = view.auth.otpRequired && !view.auth.verified;
  const closed = r.status === 'CANCELLED' || r.status === 'EXPIRED' || (r.status === 'DECLINED' && me.status !== 'DECLINED');
  const docUrl = `/api${base}/document`;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <header className="card card-pad">
        <span className="eyebrow">
          <FileSignature className="size-4" aria-hidden />
          {t('esign.sign.eyebrow')}
        </span>
        <h1 className="mt-3 text-2xl font-extrabold break-words text-navy-900 sm:text-3xl">{r.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted">
          <span className={clsx('badge', STATUS_TONE[r.status])}>{t(`esign.status.${r.status}`)}</span>
          <span>{t('esign.sign.from', { name: r.sender })}</span>
          {r.case && <span>{t('esign.sign.caseNo', { number: r.case.number })}</span>}
          {r.company && <span>{r.company.name}</span>}
          {r.status === 'SENT' && r.expiresAt && (
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="size-4" aria-hidden />
              {t('esign.sign.until', { date: date(r.expiresAt, { dateStyle: 'long' }) })}
            </span>
          )}
        </div>
        {r.message && <p className="mt-4 rounded-xl border border-line bg-surface p-4 text-sm whitespace-pre-line text-ink">{r.message}</p>}
      </header>

      {needsCode && !closed ? (
        <VerifyStep view={view} base={base} onVerified={onChange} />
      ) : closed ? (
        <StateCard icon={Ban} tone="neutral" title={t(`esign.sign.closed.${r.status as 'CANCELLED' | 'EXPIRED' | 'DECLINED'}`)}>
          {t('esign.sign.closedText')}
        </StateCard>
      ) : (
        <>
          {me.status === 'DECLINED' && (
            <StateCard icon={XCircle} tone="danger" title={t('esign.sign.declinedTitle')}>
              {t('esign.sign.declinedText')}
            </StateCard>
          )}
          {me.status === 'SIGNED' && r.status !== 'COMPLETED' && (
            <StateCard icon={BadgeCheck} tone="success" title={t('esign.sign.doneTitle')}>
              {me.signedAt && <span className="block font-semibold">{dateTime(me.signedAt)}</span>}
              {t('esign.sign.doneText')}
            </StateCard>
          )}
          {r.status === 'COMPLETED' && (
            <StateCard icon={CheckCircle2} tone="success" title={t('esign.sign.completedTitle')}>
              {t('esign.sign.completedText')}
              {r.hasFinal && (
                <a href={`${docUrl}?download=1`} className="btn-primary btn-sm mt-3 w-full sm:w-auto">
                  <Download className="size-4" aria-hidden />
                  {t('esign.sign.downloadFinal')}
                </a>
              )}
            </StateCard>
          )}
          {r.status === 'SENT' && !me.myTurn && (me.status === 'PENDING' || me.status === 'VIEWED') && (
            <StateCard icon={Hourglass} tone="neutral" title={t('esign.sign.waitTitle')}>
              {t('esign.sign.waitText')}
            </StateCard>
          )}

          {r.status === 'SENT' && (
            <section className="card card-pad" aria-labelledby="esign-doc">
              <h2 id="esign-doc" className="flex items-center gap-2 font-sans text-base font-semibold text-navy-900">
                <FileText className="size-4 text-brand-600" aria-hidden />
                {t('esign.sign.document')}
              </h2>
              <div className="mt-3 flex flex-col gap-3 rounded-xl border border-line bg-surface/70 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy-900">{r.originalName ?? r.title}</p>
                  <p className="text-xs text-muted">{t('esign.sign.pages', { count: r.pages })}</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <a href={docUrl} target="_blank" rel="noreferrer" className="btn-primary btn-sm">
                    <ExternalLink className="size-4" aria-hidden />
                    {t('esign.sign.open')}
                  </a>
                  <a href={`${docUrl}?download=1`} className="btn-white btn-sm border border-line">
                    <Download className="size-4" aria-hidden />
                    {t('esign.sign.download')}
                  </a>
                </div>
              </div>
              {me.myTurn && <p className="mt-3 text-sm text-muted">{t('esign.sign.readFirst')}</p>}
              {r.originalSha256 && (
                <p className="mt-3 text-[11px] break-all text-muted">
                  {t('esign.sign.sha')}: <span className="font-mono">{r.originalSha256}</span>
                </p>
              )}
            </section>
          )}

          {view.signers.length > 0 && <Parties view={view} />}

          {r.status === 'SENT' && me.myTurn && <SignForm view={view} base={base} onDone={onChange} />}
        </>
      )}

      <p className="flex items-start gap-2 px-1 text-xs leading-relaxed text-muted">
        <Scale className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('esign.legal')}
      </p>
    </div>
  );
};

const StateCard = ({ icon: Icon, tone, title, children }: { icon: typeof Ban; tone: 'success' | 'danger' | 'neutral'; title: string; children?: ReactNode }) => (
  <div
    className={clsx(
      'flex items-start gap-4 rounded-2xl border p-5',
      tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-950',
      tone === 'danger' && 'border-red-200 bg-red-50 text-red-950',
      tone === 'neutral' && 'border-line bg-card text-ink',
    )}
    role="status"
  >
    <Icon className={clsx('size-7 shrink-0', tone === 'success' ? 'text-success' : tone === 'danger' ? 'text-danger' : 'text-muted')} aria-hidden />
    <div className="min-w-0 text-sm leading-relaxed">
      <p className="font-display text-base font-bold">{title}</p>
      <div className="mt-1 opacity-90">{children}</div>
    </div>
  </div>
);

const Parties = ({ view }: { view: SigningView }) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  return (
    <section className="card card-pad" aria-labelledby="esign-parties">
      <h2 id="esign-parties" className="flex items-center gap-2 font-sans text-base font-semibold text-navy-900">
        <ShieldCheck className="size-4 text-brand-600" aria-hidden />
        {t('esign.sign.parties')}
        <span className="text-xs font-normal text-muted">· {t(`esign.order.${view.request.order}`)}</span>
      </h2>
      <ol className="mt-3 divide-y divide-line">
        {view.signers.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface text-xs font-bold text-navy-900">{s.order}</span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-navy-900">
                {s.name} {s.isMe && <span className="font-normal text-muted">({t('esign.sign.you')})</span>}
              </p>
              <p className="text-xs text-muted">{t(`esign.role.${s.role}`)}</p>
            </div>
            <span className={clsx('badge', SIGNER_TONE[s.status])}>
              {t(`esign.signerStatus.${s.status}`)}
              {s.signedAt && <span className="font-normal opacity-80">· {dateTime(s.signedAt)}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
};

const VerifyStep = ({ view, base, onVerified }: { view: SigningView; base: string; onVerified: (v: SigningView) => void }) => {
  const { t } = useTranslation();
  const err = useEsignError();
  const codeId = useId();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [wait, setWait] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  const send = async () => {
    setBusy(true);
    try {
      const res = await api.post<{ email: string; retryAfter: number }>(`${base}/otp`, {});
      setSent(true);
      setWait(res.data.retryAfter);
      setHint(t('esign.sign.codeSent', { email: res.data.email }));
      window.setTimeout(() => inputRef.current?.focus(), 50);
    } catch (e) {
      const retry = (e as { response?: { data?: { retryAfter?: number } } }).response?.data?.retryAfter;
      if (retry) {
        setSent(true);
        setWait(retry);
      }
      err.toast(e);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code.trim())) return;
    setBusy(true);
    try {
      const res = await api.post<SigningView>(`${base}/otp/verify`, { code: code.trim() });
      onVerified(res.data);
    } catch (e) {
      const left = (e as { response?: { data?: { attemptsLeft?: number } } }).response?.data?.attemptsLeft;
      setHint(left !== undefined && left > 0 ? `${err.message(e)} ${t('esign.sign.attemptsLeft', { count: left })}` : err.message(e));
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card card-pad" aria-labelledby="esign-verify">
      <div className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-700">
          <KeyRound className="size-6" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="esign-verify" className="text-lg font-bold text-navy-900">
            {t('esign.sign.verifyTitle')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('esign.sign.verifyText', { email: view.me.email })}</p>
        </div>
      </div>

      {!sent ? (
        <button type="button" className="btn-primary mt-5 w-full sm:w-auto" onClick={() => void send()} disabled={busy}>
          {busy ? <Spinner className="size-4" /> : <Mail className="size-4" aria-hidden />}
          {t('esign.sign.sendCode')}
        </button>
      ) : (
        <form
          className="mt-5 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
        >
          <label htmlFor={codeId} className="label">
            {t('esign.sign.codeLabel')}
          </label>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              ref={inputRef}
              id={codeId}
              className="input text-center font-mono text-xl tracking-[0.5em] sm:max-w-56"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              required
            />
            <button type="submit" className="btn-primary" disabled={busy || code.length !== 6}>
              {busy ? <Spinner className="size-4" /> : <ShieldCheck className="size-4" aria-hidden />}
              {t('esign.sign.verify')}
            </button>
          </div>
          <p className="min-h-5 text-sm text-muted" aria-live="polite">
            {hint}
          </p>
          <button type="button" className="text-sm font-semibold text-brand-600 hover:underline disabled:cursor-not-allowed disabled:text-muted disabled:no-underline" onClick={() => void send()} disabled={busy || wait > 0}>
            {wait > 0 ? t('esign.sign.resendIn', { s: wait }) : t('esign.sign.resend')}
          </button>
        </form>
      )}
      <p className="mt-4 flex items-start gap-2 text-xs text-muted">
        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        {t('esign.sign.securityNote')}
      </p>
    </section>
  );
};

const SignForm = ({ view, base, onDone }: { view: SigningView; base: string; onDone: (v: SigningView) => void }) => {
  const { t } = useTranslation();
  const err = useEsignError();
  const padRef = useRef<SignaturePadHandle>(null);
  const agreeId = useId();
  const typedId = useId();
  const reasonId = useId();
  const [mode, setMode] = useState<'DRAW' | 'TYPE'>('DRAW');
  const [typed, setTyped] = useState(view.me.name);
  const [padEmpty, setPadEmpty] = useState(true);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');

  const ready = agree && (mode === 'DRAW' ? !padEmpty : typed.trim().length >= 2);

  const sign = async () => {
    if (mode === 'DRAW' && (padRef.current?.isEmpty() ?? true)) {
      toast.error(t('esign.sign.emptySignature'));
      return;
    }
    if (!ready) return;
    setBusy(true);
    try {
      const body = mode === 'DRAW' ? { mode, signature: padRef.current!.toDataURL(), agree: true } : { mode, typedName: typed.trim(), agree: true };
      const res = await api.post<SigningView>(`${base}/sign`, body);
      toast.success(t('esign.sign.signedToast'));
      onDone(res.data);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      err.toast(e);
    } finally {
      setBusy(false);
    }
  };

  const decline = async () => {
    if (reason.trim().length < 3) return;
    setBusy(true);
    try {
      const res = await api.post<SigningView>(`${base}/decline`, { reason: reason.trim() });
      onDone(res.data);
    } catch (e) {
      err.toast(e);
    } finally {
      setBusy(false);
    }
  };

  if (declining) {
    return (
      <section className="card card-pad space-y-4" aria-labelledby="esign-decline">
        <h2 id="esign-decline" className="text-lg font-bold text-navy-900">
          {t('esign.sign.declineTitle')}
        </h2>
        <p className="text-sm text-muted">{t('esign.sign.declineText')}</p>
        <div>
          <label htmlFor={reasonId} className="label">
            {t('esign.sign.declineReason')}
          </label>
          <textarea id={reasonId} className="input min-h-28" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} required minLength={3} />
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-white btn-sm border border-line" onClick={() => setDeclining(false)} disabled={busy}>
            {t('esign.sign.cancel')}
          </button>
          <button type="button" className="btn-danger btn-sm" onClick={() => void decline()} disabled={busy || reason.trim().length < 3}>
            {busy ? <Spinner className="size-4" /> : <XCircle className="size-4" aria-hidden />}
            {t('esign.sign.declineConfirm')}
          </button>
        </div>
      </section>
    );
  }

  return (
    <form
      className="card card-pad space-y-4"
      aria-labelledby="esign-sign"
      onSubmit={(e) => {
        e.preventDefault();
        void sign();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="esign-sign" className="flex items-center gap-2 font-sans text-base font-semibold text-navy-900">
            <PenLine className="size-4 text-brand-600" aria-hidden />
            {t('esign.sign.signTitle')}
          </h2>
          <p className="mt-0.5 text-xs text-muted">{t('esign.sign.signingAs', { name: view.me.name })}</p>
        </div>
        <div className="inline-flex rounded-xl border border-line bg-surface p-1" role="tablist" aria-label={t('esign.sign.signTitle')}>
          {(['DRAW', 'TYPE'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={clsx(
                'inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold transition',
                mode === m ? 'bg-card text-navy-900 shadow' : 'text-muted hover:text-navy-900',
              )}
            >
              {m === 'DRAW' ? <PenLine className="size-4" aria-hidden /> : <Type className="size-4" aria-hidden />}
              {t(m === 'DRAW' ? 'esign.sign.draw' : 'esign.sign.type')}
            </button>
          ))}
        </div>
      </div>

      {mode === 'DRAW' ? (
        <div>
          <p className="mb-2 text-sm text-muted">{t('esign.sign.drawHint')}</p>
          <SignaturePad ref={padRef} onChange={setPadEmpty} label={t('esign.sign.signTitle')} />
        </div>
      ) : (
        <div>
          <label htmlFor={typedId} className="label">
            {t('esign.sign.typedLabel')}
          </label>
          <input id={typedId} className="input" value={typed} onChange={(e) => setTyped(e.target.value)} maxLength={160} autoComplete="name" />
          <div className="mt-3 grid min-h-24 place-items-center overflow-hidden rounded-xl border-2 border-dashed border-brand-400/60 bg-white px-4">
            <span className="max-w-full truncate font-['Times_New_Roman',Times,serif] text-4xl text-ink italic sm:text-5xl">{typed.trim() || ' '}</span>
          </div>
        </div>
      )}

      <label
        htmlFor={agreeId}
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface/70 p-4 text-sm leading-relaxed text-ink [&:has(input:focus-visible)]:ring-4 [&:has(input:focus-visible)]:ring-brand-500/20"
      >
        <input id={agreeId} type="checkbox" className="mt-0.5 size-4 shrink-0 accent-brand-600" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
        {t('esign.sign.agree')}
      </label>

      <div className="flex flex-col-reverse gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
        <button type="button" className="btn btn-sm min-h-10 text-danger hover:bg-red-50" onClick={() => setDeclining(true)} disabled={busy}>
          <XCircle className="size-4" aria-hidden />
          {t('esign.sign.decline')}
        </button>
        <button type="submit" className="btn-primary w-full sm:w-auto" disabled={!ready || busy}>
          {busy ? <Spinner className="size-4" /> : <FileSignature className="size-4" aria-hidden />}
          {busy ? t('esign.sign.signing') : t('esign.sign.submit')}
        </button>
      </div>
    </form>
  );
};

export const SigningSkeleton = () => (
  <div className="mx-auto grid min-h-[40vh] max-w-3xl place-items-center text-brand-600" role="status">
    <Spinner className="size-8 border-[3px]" />
  </div>
);

export const InvalidLink = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-xl">
      <StateCard icon={Clock3} tone="neutral" title={t('esign.sign.invalidTitle')}>
        {t('esign.sign.invalidText')}
      </StateCard>
    </div>
  );
};
