import { useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { AxiosError } from 'axios';
import clsx from 'clsx';
import {
  ArrowRight,
  BookUser,
  Calendar,
  ChevronRight,
  Eye,
  EyeOff,
  FileCheck2,
  Handshake,
  Lock,
  Mail,
  MessagesSquare,
  Phone,
  ScanLine,
  SearchCheck,
  Ticket,
  User as UserIcon,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, errorCode } from '@/lib/api';
import { landingAfterLogin, useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { Documents, Success } from '@/components/illustrations';
import { isStrongPassword, PASSWORD_MAX, PASSWORD_MIN, type SessionInfo, type User } from '@/lib/types';
import { usePageTitle } from '@/lib/usePageTitle';
import { Spinner } from '@/components/ui/Spinner';
import { AuthShell } from './AuthShell';
import { authError } from './Login';
import { ResendVerificationButton } from '@/components/auth/VerifyBanner';
import { PassportScan, type PassportScanFields } from '@/components/auth/PassportScan';
import { registerCopy } from '@/i18n';
import { pagesLegal } from '@/i18n/pagesLegal';
import { campaignConsentCopy } from '@/i18n/pagesCampaigns';
import { cookieConsentCopy } from '@/i18n/cookieConsent'; // AGB checkbox copy
import { clearRefCookie, readRefCookie, rememberVisa } from '@/lib/referralCookie';

registerCopy(pagesLegal);
registerCopy(campaignConsentCopy);
registerCopy(cookieConsentCopy);

/** Same photo as the home hero (already cached for most visitors). */

/** Age limits enforced by the API (POST /api/auth/register). */
const MIN_AGE = 16;
const MAX_AGE = 80;
const EARLIEST_BIRTH = '1940-01-01';

const pad = (n: number) => String(n).padStart(2, '0');
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** min/max for the native date picker: at least 16 years old, at most 80 (and never before 1940). */
const birthBounds = () => {
  const now = new Date();
  const max = new Date(Date.UTC(now.getUTCFullYear() - MIN_AGE, now.getUTCMonth(), now.getUTCDate()));
  const oldest = new Date(Date.UTC(now.getUTCFullYear() - MAX_AGE - 1, now.getUTCMonth(), now.getUTCDate() + 1));
  const min = ymd(oldest) > EARLIEST_BIRTH ? ymd(oldest) : EARLIEST_BIRTH;
  return { min, max: ymd(max) };
};

/** "+994 50 123-45-67" → "+994501234567"; valid when "+" and 8–15 digits remain. */
const compactPhone = (v: string) => v.trim().replace(/[\s\-.()]/g, '');
const phoneValid = (v: string) => /^\+\d{8,15}$/.test(compactPhone(v));

type FieldKey = 'firstName' | 'lastName' | 'birthDate' | 'passportNumber' | 'email' | 'phone' | 'password';
type Form = Record<FieldKey, string>;
const EMPTY: Form = { firstName: '', lastName: '', birthDate: '', passportNumber: '', email: '', phone: '', password: '' };

/** Foreign passport number as the API stores it: letters and digits, upper case ("c 0123-4567" → "C01234567"). */
const compactPassport = (v: string) => v.replace(/[\s-]/g, '').toUpperCase();
const passportValid = (v: string) => /^[A-Z0-9]{5,20}$/.test(compactPassport(v));

/** Agent referral code from the sign-up link (?ref=CODE), kept for the tab so it survives a visit to /privacy. */
const REF_KEY = 'tv_ref';
const normaliseRef = (v: string | null) => (v ?? '').trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 32);
const readRef = (search: string) => {
  const fromUrl = normaliseRef(new URLSearchParams(search).get('ref'));
  // ?visa=<slug> (calculator "Apply" button): preselected later in the "start your application" card.
  rememberVisa(new URLSearchParams(search).get('visa'));
  try {
    if (fromUrl) sessionStorage.setItem(REF_KEY, fromUrl);
    return fromUrl || normaliseRef(sessionStorage.getItem(REF_KEY)) || readRefCookie();
  } catch {
    return fromUrl || readRefCookie();
  }
};
const forgetRef = () => {
  try {
    sessionStorage.removeItem(REF_KEY);
  } catch {
    // storage unavailable: nothing to forget
  }
};

/** Field-level error keys (registerPage.errors.*) from a 400 VALIDATION answer of the API. */
const serverFieldErrors = (err: unknown): Partial<Record<FieldKey, string>> => {
  if (!(err instanceof AxiosError)) return {};
  const issues = (err.response?.data as { issues?: { path?: (string | number)[]; message?: string }[] } | undefined)?.issues ?? [];
  const out: Partial<Record<FieldKey, string>> = {};
  for (const i of issues) {
    const field = i.path?.[0];
    if (field === 'phone') out.phone = 'phone';
    if (field === 'passportNumber') out.passportNumber = 'passport';
    if (field === 'birthDate') out.birthDate = i.message === 'AGE_OUT_OF_RANGE' || i.message === 'DATE_NOT_IN_PAST' ? 'birthAge' : 'birthInvalid';
  }
  return out;
};

/** After registration: the account exists and is logged in, but the email still has to be confirmed. */
const CheckInbox = ({ email, next }: { email: string; next: string }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <AuthShell title={t('registerInbox.title')}>
      <div className="flex flex-col items-center text-center" role="status">
        <Success className="w-36" />
        <p className="mt-5 break-words text-ink">{t('registerInbox.text', { email })}</p>
        <p className="mt-2 text-sm text-muted">{t('registerInbox.hint')}</p>
        <div className="mt-7 flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
          <button type="button" className="btn-primary btn-lg" onClick={() => navigate(next, { replace: true })}>
            {t('registerInbox.continue')} <ArrowRight className="size-4" aria-hidden />
          </button>
          <ResendVerificationButton className="btn-secondary btn-lg" label={t('registerInbox.resend')} />
        </div>
      </div>
    </AuthShell>
  );
};

/** Label, input with a leading icon, and a hint line below that turns into the error message. */
const Field = ({
  id,
  label,
  icon: Icon,
  hint,
  error,
  trailing,
  tag,
  children,
}: {
  id: string;
  label: string;
  icon: LucideIcon;
  hint: string;
  error?: string | null;
  trailing?: ReactNode;
  /** Small badge next to the label (e.g. "filled from passport"). */
  tag?: ReactNode;
  children: ReactNode;
}) => (
  <div>
    <div className="flex flex-wrap items-center justify-between gap-x-2">
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {tag}
    </div>
    <div className="relative">
      <Icon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted" aria-hidden />
      {children}
      {trailing}
    </div>
    <p id={`${id}-hint`} className={clsx('mt-1.5 text-xs leading-snug', error ? 'text-danger' : 'text-muted')} aria-live={error ? 'polite' : undefined}>
      {error ?? hint}
    </p>
  </div>
);

/** Desktop-only side panel: photo with a navy overlay and four shortcuts. */
const Aside = () => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const rows: { key: string; icon: LucideIcon; to: string }[] = [
    { key: 'consult', icon: MessagesSquare, to: '/booking' },
    { key: 'docs', icon: FileCheck2, to: '/services' },
    { key: 'tracking', icon: SearchCheck, to: user ? '/account' : '/login' },
    { key: 'partners', icon: Handshake, to: '/partners' },
  ];
  return (
    <motion.aside
      initial={{ opacity: 0, x: 30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
      aria-label={t('registerPage.aside.label')}
      className="hidden min-h-[640px] rounded-3xl border border-line bg-sunken p-10 lg:flex lg:flex-col lg:justify-center xl:p-12"
    >
      <Documents className="mx-auto mb-8 w-full max-w-[16rem]" animated />
      <h2 className="max-w-md font-display text-3xl leading-tight font-semibold text-ink xl:text-4xl">{t('registerPage.aside.title')}</h2>
      <p className="mt-4 max-w-md text-muted">{t('registerPage.aside.text')}</p>
      <ul className="mt-8 space-y-3">
        {rows.map(({ key, icon: Icon, to }, i) => (
          <li key={key}>
            <Link
              to={to}
              className="card card-interactive group flex min-h-14 items-center gap-4 px-4 py-3.5 focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:outline-none"
            >
              <span className={clsx('grid size-11 shrink-0 place-items-center rounded-xl', ['chip-soft', 'chip-sage', 'chip-sky', 'chip-peach'][i % 4])}>
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-ink">{t(`registerPage.aside.${key}`)}</span>
                <span className="block text-xs text-muted">{t(`registerPage.aside.${key}Text`)}</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted transition-colors group-hover:text-ink" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </motion.aside>
  );
};

export default function Register() {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: unknown } | null)?.from;
  const uid = useId();
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Form>(EMPTY);
  const [showPassword, setShowPassword] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  // Required: "I accept the AGB" (logged on the server as a TERMS consent with the current version).
  const [terms, setTerms] = useState(false);
  // Optional marketing consent: unchecked by default (UWG / DSGVO), logged on the server.
  const [marketing, setMarketing] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [registered, setRegistered] = useState<{ email: string; next: string } | null>(null);
  const bounds = useMemo(birthBounds, []);
  /** Values the passport scan put into the form (a field keeps its badge while it still holds that value). */
  const [scanned, setScanned] = useState<Partial<Form> | null>(null);
  const [refCode] = useState(() => readRef(location.search));
  usePageTitle(t('auth.registerTitle'));

  const fillFromPassport = (p: PassportScanFields) => {
    const values: Partial<Form> = {};
    if (p.firstName) values.firstName = p.firstName;
    if (p.lastName) values.lastName = p.lastName;
    if (p.birthDate) values.birthDate = p.birthDate;
    if (p.passportNumber) values.passportNumber = p.passportNumber;
    setF((prev) => ({ ...prev, ...values }));
    setServerErrors((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(values) as FieldKey[]) delete next[k];
      return next;
    });
    setScanned(values);
  };
  const fromPassport = (k: FieldKey) =>
    scanned?.[k] && scanned[k] === f[k] ? (
      <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-sunken px-2 py-0.5 text-[0.7rem] font-semibold text-ink ring-1 ring-line-strong">
        <ScanLine className="size-3" aria-hidden /> {t('registerPage.scan.filledTag')}
      </span>
    ) : null;

  const set = (k: FieldKey) => (e: { target: { value: string } }) => {
    setF((p) => ({ ...p, [k]: e.target.value }));
    setServerErrors((s) => (s[k] ? { ...s, [k]: undefined } : s));
  };

  const birthError = !f.birthDate
    ? 'required'
    : !/^\d{4}-\d{2}-\d{2}$/.test(f.birthDate)
      ? 'birthInvalid'
      : f.birthDate < bounds.min || f.birthDate > bounds.max
        ? 'birthAge'
        : null;
  const clientErrors: Record<FieldKey, string | null> = {
    firstName: f.firstName.trim() ? null : 'required',
    lastName: f.lastName.trim() ? null : 'required',
    birthDate: birthError,
    passportNumber: !f.passportNumber.trim() ? 'required' : passportValid(f.passportNumber) ? null : 'passport',
    email: !f.email.trim() ? 'required' : /^\S+@\S+\.\S+$/.test(f.email.trim()) ? null : 'email',
    phone: !f.phone.trim() ? 'required' : phoneValid(f.phone) ? null : 'phone',
    password: isStrongPassword(f.password) ? null : 'password',
  };
  /** Errors appear after the first submit; format errors (phone, date, password) as soon as something was typed. */
  const errorFor = (k: FieldKey): string | null => {
    const key = serverErrors[k] ?? clientErrors[k];
    if (!key) return null;
    const typed = f[k].trim() !== '';
    if (!submitted && !(typed && k !== 'email' && key !== 'required')) return null;
    if (key === 'password') return t('registerPage.passwordHint');
    return t(`registerPage.errors.${key}`);
  };

  const focusField = (k: string) => window.requestAnimationFrame(() => document.getElementById(`${uid}-${k}`)?.focus());

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    if (Object.values(clientErrors).some(Boolean) || !privacy || !terms) {
      const failing = (Object.keys(clientErrors) as FieldKey[]).filter((k) => clientErrors[k]);
      if (failing.length === 1 && failing[0] === 'password') toast.error(t('auth.errors.PASSWORD_TOO_WEAK'));
      else if (!failing.length) toast.error(!terms ? t('legalDocs.register.termsError') : t('registerPage.errors.privacy'));
      else toast.error(t('auth.errors.VALIDATION'));
      // Keyboard and screen-reader users land on the first field to fix (its message is linked via aria-describedby).
      focusField(failing[0] ?? (!terms ? 'terms' : 'privacy'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{ user: User; session: SessionInfo }>('/auth/register', {
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        birthDate: f.birthDate,
        passportNumber: compactPassport(f.passportNumber),
        email: f.email.trim(),
        phone: compactPhone(f.phone),
        password: f.password,
        locale,
        ...(refCode ? { ref: refCode } : {}),
        ...(scanned && Object.keys(scanned).length ? { passportScanned: true } : {}),
        ...(marketing ? { marketingOptIn: true } : {}),
        acceptTerms: true,
      });
      forgetRef();
      clearRefCookie();
      setUser(data.user);
      const next = landingAfterLogin(data.user.role, from);
      // New accounts confirm their email first ("check your inbox"); pre-verified ones go straight on.
      if ((data.user as User & { emailVerified?: boolean }).emailVerified === false) setRegistered({ email: data.user.email, next });
      else navigate(next, { replace: true });
    } catch (err) {
      const fields = serverFieldErrors(err);
      setServerErrors(fields);
      const first = (Object.keys(fields) as FieldKey[])[0];
      if (first) focusField(first);
      toast.error(Object.keys(fields).length ? t('auth.errors.VALIDATION') : authError(t, errorCode(err)));
    } finally {
      setBusy(false);
    }
  };

  if (registered) return <CheckInbox email={registered.email} next={registered.next} />;

  const id = (k: string) => `${uid}-${k}`;
  const inputCls = (k: FieldKey, extra?: string) => clsx('input h-11 pl-10', extra, errorFor(k) && 'border-danger focus:border-danger focus:ring-danger/15');
  const aria = (k: FieldKey) => ({ 'aria-invalid': errorFor(k) ? true : undefined, 'aria-describedby': `${id(k)}-hint` });

  return (
    <section className="flex min-h-[100svh] items-center bg-canvas pt-24 pb-12 sm:pt-28 lg:pt-36 lg:pb-16">
      <div className="container-x grid items-stretch gap-6 lg:grid-cols-2 lg:gap-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="card mx-auto w-full max-w-lg rounded-3xl p-5 sm:p-10 lg:max-w-none"
        >
          <h1 className="font-display text-[1.75rem] leading-tight font-semibold text-ink sm:text-3xl">{t('registerPage.title')}</h1>
          <p className="mt-2 text-muted">{t('registerPage.subtitle')}</p>
          <p className="mt-4 flex items-start gap-2.5 rounded-xl border border-line bg-sunken px-3.5 py-3 text-sm text-ink">
            <BookUser className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{t('registerPage.passportNotice')}</span>
          </p>
          {refCode && (
            <p className="mt-3">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-sunken px-2.5 py-1 text-xs font-medium text-muted">
                <Ticket className="size-3.5" aria-hidden /> {t('registerPage.scan.agentCode', { code: refCode })}
              </span>
            </p>
          )}

          <div className="mt-6">
            <PassportScan onFilled={fillFromPassport} onCleared={() => setScanned(null)} />
          </div>

          <form onSubmit={submit} noValidate className="mt-7 space-y-4 sm:mt-8">
            <Field id={id('firstName')} label={t('registerPage.firstName')} icon={UserIcon} hint={t('registerPage.passportHint')} error={errorFor('firstName')} tag={fromPassport('firstName')}>
              <input
                id={id('firstName')}
                name="firstName"
                required
                maxLength={80}
                autoComplete="given-name"
                placeholder={t('registerPage.firstNamePh')}
                className={inputCls('firstName')}
                value={f.firstName}
                onChange={set('firstName')}
                {...aria('firstName')}
              />
            </Field>
            <Field id={id('lastName')} label={t('registerPage.lastName')} icon={UserIcon} hint={t('registerPage.passportHint')} error={errorFor('lastName')} tag={fromPassport('lastName')}>
              <input
                id={id('lastName')}
                name="lastName"
                required
                maxLength={80}
                autoComplete="family-name"
                placeholder={t('registerPage.lastNamePh')}
                className={inputCls('lastName')}
                value={f.lastName}
                onChange={set('lastName')}
                {...aria('lastName')}
              />
            </Field>
            <Field id={id('birthDate')} label={t('registerPage.birthDate')} icon={Calendar} hint={t('registerPage.birthHint')} error={errorFor('birthDate')} tag={fromPassport('birthDate')}>
              <input
                id={id('birthDate')}
                name="birthDate"
                type="date"
                required
                min={bounds.min}
                max={bounds.max}
                autoComplete="bday"
                className={inputCls('birthDate', 'appearance-none')}
                value={f.birthDate}
                onChange={set('birthDate')}
                {...aria('birthDate')}
              />
            </Field>
            <Field id={id('passportNumber')} label={t('registerPage.passportNumber')} icon={BookUser} hint={t('registerPage.passportNoHint')} error={errorFor('passportNumber')} tag={fromPassport('passportNumber')}>
              <input
                id={id('passportNumber')}
                name="passportNumber"
                type="text"
                required
                maxLength={40}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                placeholder={t('registerPage.passportPh')}
                className={inputCls('passportNumber', 'uppercase tracking-wider placeholder:normal-case placeholder:tracking-normal')}
                value={f.passportNumber}
                onChange={set('passportNumber')}
                {...aria('passportNumber')}
              />
            </Field>
            <Field id={id('email')} label={t('registerPage.email')} icon={Mail} hint={t('registerPage.emailHint')} error={errorFor('email')}>
              <input
                id={id('email')}
                name="email"
                type="email"
                required
                maxLength={200}
                autoComplete="email"
                inputMode="email"
                placeholder={t('registerPage.emailPh')}
                className={inputCls('email')}
                value={f.email}
                onChange={set('email')}
                {...aria('email')}
              />
            </Field>
            <Field id={id('phone')} label={t('registerPage.phone')} icon={Phone} hint={t('registerPage.phoneHint')} error={errorFor('phone')}>
              <input
                id={id('phone')}
                name="phone"
                type="tel"
                required
                maxLength={40}
                autoComplete="tel"
                inputMode="tel"
                placeholder={t('registerPage.phonePh')}
                className={inputCls('phone')}
                value={f.phone}
                onChange={set('phone')}
                {...aria('phone')}
              />
            </Field>
            <Field
              id={id('password')}
              label={t('registerPage.password')}
              icon={Lock}
              hint={t('registerPage.passwordHint')}
              error={errorFor('password')}
              trailing={
                <button
                  type="button"
                  className="absolute top-1/2 right-1.5 grid size-9 -translate-y-1/2 place-items-center rounded-md text-muted transition hover:bg-sunken hover:text-ink focus-visible:ring-2 focus-visible:ring-focus/40 focus-visible:outline-none"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('registerPage.hidePassword') : t('registerPage.showPassword')}
                  aria-pressed={showPassword}
                  aria-controls={id('password')}
                >
                  {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
                </button>
              }
            >
              <input
                id={id('password')}
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={PASSWORD_MIN}
                maxLength={PASSWORD_MAX}
                autoComplete="new-password"
                placeholder={t('registerPage.passwordPh')}
                className={inputCls('password', 'pr-12')}
                value={f.password}
                onChange={set('password')}
                {...aria('password')}
              />
            </Field>

            <div>
              <label className="flex items-start gap-2.5 pt-1 text-sm text-ink/80">
                <input
                  type="checkbox"
                  id={id('privacy')}
                  name="privacy"
                  required
                  checked={privacy}
                  onChange={(e) => setPrivacy(e.target.checked)}
                  aria-invalid={submitted && !privacy ? true : undefined}
                  aria-describedby={submitted && !privacy ? id('privacy-error') : undefined}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  {t('registerPage.privacyBefore')}
                  <Link to="/privacy" target="_blank" rel="noopener" className="font-semibold text-link hover:underline">
                    {t('registerPage.privacyLink')}
                  </Link>
                  {t('registerPage.privacyAfter')}
                </span>
              </label>
              {submitted && !privacy && (
                <p id={id('privacy-error')} className="mt-1.5 pl-6.5 text-xs text-danger" aria-live="polite">
                  {t('registerPage.errors.privacy')}
                </p>
              )}
            </div>

            <div>
              <label className="flex items-start gap-2.5 text-sm text-ink/80">
                <input
                  type="checkbox"
                  id={id('terms')}
                  name="terms"
                  required
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                  aria-invalid={submitted && !terms ? true : undefined}
                  aria-describedby={submitted && !terms ? id('terms-error') : undefined}
                  className="mt-0.5 size-4 shrink-0 accent-primary"
                />
                <span>
                  {t('legalDocs.register.termsBefore')}
                  <Link to="/agb" target="_blank" rel="noopener" className="font-semibold text-link hover:underline">
                    {t('legalDocs.register.termsLink')}
                  </Link>
                  {t('legalDocs.register.termsAfter')}
                </span>
              </label>
              {submitted && !terms && (
                <p id={id('terms-error')} className="mt-1.5 pl-6.5 text-xs text-danger" aria-live="polite">
                  {t('legalDocs.register.termsError')}
                </p>
              )}
            </div>

            <label className="flex items-start gap-2.5 text-sm text-ink/80">
              <input type="checkbox" name="marketing" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" />
              <span>{t('campaignConsent.register')}</span>
            </label>

            <button type="submit" disabled={busy} className="btn-primary btn-lg w-full">
              {busy ? <Spinner className="size-4" /> : <UserPlus className="size-4" aria-hidden />} {t('registerPage.submit')}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted">
            {t('registerPage.haveAccount')}{' '}
            <Link to="/login" state={location.state} className="font-semibold text-link hover:underline">
              {t('registerPage.login')}
            </Link>
          </p>
        </motion.div>

        <Aside />
      </div>
    </section>
  );
}
