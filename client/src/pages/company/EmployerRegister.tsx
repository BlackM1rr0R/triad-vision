import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { Building2, CheckCircle2, ShieldCheck, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { isStaffRole, isStrongPassword, PASSWORD_MAX, PASSWORD_MIN, type User } from '@/lib/types';
import { registerCopy } from '@/i18n';
import { pagesJobs } from '@/i18n/pagesJobs';
import { cookieConsentCopy } from '@/i18n/cookieConsent'; // AGB link label
import { Spinner } from '@/components/ui/Spinner';
import { RouteFlags } from '@/components/ui/Flag';
import { jobsError, useJobLabels } from '@/components/jobs/labels';
import { SECTORS } from '@/components/jobs/types';
import { Employer } from '@/components/illustrations';
import { PasswordInput } from '@/components/ui/PasswordInput';


registerCopy(pagesJobs);
registerCopy(cookieConsentCopy);

const Field = ({ id, label, children, className }: { id: string; label: string; children: ReactNode; className?: string }) => (
  <div className={className}>
    <label className="label" htmlFor={id}>
      {label}
    </label>
    {children}
  </div>
);

export default function EmployerRegister() {
  const { t } = useTranslation();
  const { locale } = useL10n();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const L = useJobLabels();
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState('');
  const weak = password.length > 0 && !isStrongPassword(password);
  usePageTitle(t('jobsArea.register.title'));

  if (user?.role === 'COMPANY') return <Navigate to="/company" replace />;

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const s = (k: string) => String(fd.get(k) ?? '').trim();
    if (!isStrongPassword(password)) {
      toast.error(t('jobsArea.errors.PASSWORD_TOO_WEAK'));
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{ user: User }>('/company/register', {
        company: {
          name: s('name'),
          legalForm: s('legalForm') || null,
          sector: s('sector'),
          city: s('city'),
          address: s('address') || null,
          vatId: s('vatId') || null,
          website: s('website') || null,
          phone: s('phone'),
        },
        user: { firstName: s('firstName'), lastName: s('lastName'), email: s('email'), password },
        locale,
        acceptTerms: true,
      });
      setUser(data.user);
      toast.success(t('jobsArea.register.success'));
      navigate('/company', { replace: true });
    } catch (err) {
      toast.error(jobsError(err));
    } finally {
      setBusy(false);
    }
  };

  const benefits = t('jobsArea.register.benefits', { returnObjects: true }) as string[];

  return (
    <section className="bg-canvas pt-24 pb-12 sm:pt-28 lg:pt-36 lg:pb-16">
      <div className="container-x grid items-start gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:gap-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="card w-full rounded-3xl p-6 sm:p-10"
        >
          <span className="eyebrow">{t('jobsArea.register.eyebrow')}</span>
          <h1 className="type-display mt-2 sm:text-3xl">{t('jobsArea.register.title')}</h1>
          <p className="mt-2 text-muted">{t('jobsArea.register.subtitle')}</p>

          {user && !isStaffRole(user.role) && (
            <p className="mt-5 rounded-lg bg-warning-bg px-4 py-3 text-sm text-warning-fg">{t('jobsArea.register.loggedInAsCandidate')}</p>
          )}

          <form onSubmit={submit} className="mt-8 space-y-8">
            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-4 flex items-center gap-2.5 type-card-title text-ink">
                <span className="grid size-9 place-items-center rounded-xl chip-sky"><Building2 className="size-4" aria-hidden /></span> {t('jobsArea.register.companySection')}
              </legend>
              <Field id="name" label={t('jobsArea.register.companyName')} className="sm:col-span-2">
                <input id="name" name="name" required minLength={2} maxLength={160} autoComplete="organization" className="input" />
              </Field>
              <Field id="legalForm" label={t('jobsArea.register.legalForm')}>
                <input id="legalForm" name="legalForm" maxLength={40} placeholder="GmbH, UG, AG, e.K. …" className="input" />
              </Field>
              <Field id="sector" label={t('jobsArea.register.sector')}>
                <select id="sector" name="sector" required className="input" defaultValue="">
                  <option value="" disabled>
                    {t('jobsArea.register.choose')}
                  </option>
                  {SECTORS.map((s) => (
                    <option key={s} value={s}>
                      {L.sector(s)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="city" label={t('jobsArea.register.city')}>
                <input id="city" name="city" required minLength={2} maxLength={80} autoComplete="address-level2" className="input" />
              </Field>
              <Field id="phone" label={t('jobsArea.register.phone')}>
                <input id="phone" name="phone" type="tel" required minLength={5} maxLength={40} autoComplete="tel" placeholder="+49 …" className="input" />
              </Field>
              <Field id="address" label={t('jobsArea.register.address')} className="sm:col-span-2">
                <input id="address" name="address" maxLength={300} autoComplete="street-address" className="input" />
              </Field>
              <Field id="vatId" label={t('jobsArea.register.vatId')}>
                <input id="vatId" name="vatId" maxLength={40} placeholder="DE123456789" className="input" />
              </Field>
              <Field id="website" label={t('jobsArea.register.website')}>
                <input id="website" name="website" maxLength={300} inputMode="url" placeholder="www.example.de" className="input" />
              </Field>
            </fieldset>

            <fieldset className="grid gap-4 sm:grid-cols-2">
              <legend className="mb-4 flex items-center gap-2.5 type-card-title text-ink">
                <span className="grid size-9 place-items-center rounded-xl chip-sage"><UserRound className="size-4" aria-hidden /></span> {t('jobsArea.register.contactSection')}
              </legend>
              <Field id="firstName" label={t('jobsArea.register.firstName')}>
                <input id="firstName" name="firstName" required maxLength={80} autoComplete="given-name" className="input" />
              </Field>
              <Field id="lastName" label={t('jobsArea.register.lastName')}>
                <input id="lastName" name="lastName" required maxLength={80} autoComplete="family-name" className="input" />
              </Field>
              <Field id="email" label={t('jobsArea.register.email')} className="sm:col-span-2">
                <input id="email" name="email" type="email" required maxLength={200} autoComplete="email" className="input" />
              </Field>
              <Field id="password" label={t('jobsArea.register.password')} className="sm:col-span-2">
                <PasswordInput
                  id="password"
                  required
                  minLength={PASSWORD_MIN}
                  maxLength={PASSWORD_MAX}
                  autoComplete="new-password"
                  className={`input${weak ? ' border-danger' : ''}`}
                  aria-invalid={weak || undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className={`mt-1 text-xs ${weak ? 'text-danger' : 'text-muted'}`}>{t('jobsArea.register.passwordHint')}</p>
              </Field>
            </fieldset>

            <label className="flex items-start gap-2.5 text-xs text-muted">
              <input type="checkbox" required className="mt-0.5 size-4 accent-primary" />
              <span>
                {t('jobsArea.register.terms')}{' '}
                <Link to="/privacy" className="font-semibold text-link hover:underline">
                  {t('jobsArea.register.privacyLink')}
                </Link>
                {' · '}
                {/* Accepting is logged as TERMS + PRIVACY_POLICY consents with the current versions. */}
                <Link to="/agb" target="_blank" rel="noopener" className="font-semibold text-link hover:underline">
                  {t('legalDocs.register.termsLink')}
                </Link>
              </span>
            </label>
            <button type="submit" disabled={busy || !!user} className="btn-primary btn-lg w-full">
              {busy ? <Spinner className="size-4" /> : <Building2 className="size-4" />} {t('jobsArea.register.submit')}
            </button>
          </form>
          <p className="mt-6 text-center text-sm text-muted">
            {t('jobsArea.register.haveAccount')}{' '}
            <Link to="/login" className="font-semibold text-link hover:underline">
              {t('jobsArea.register.login')}
            </Link>
          </p>
        </motion.div>

        <motion.aside
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="rounded-3xl border border-line bg-sunken p-7 sm:p-10 lg:sticky lg:top-28"
        >
          <Employer className="mx-auto mb-6 w-full max-w-[15rem]" animated />
          <RouteFlags size="lg" />
          <h2 className="type-subsection mt-6 text-ink sm:text-3xl">{t('jobsArea.register.asideTitle')}</h2>
          <p className="mt-3 text-muted">{t('jobsArea.register.asideText')}</p>
          <ul className="mt-7 space-y-3">
            {benefits.map((b) => (
              <li key={b} className="flex items-start gap-3 rounded-2xl border border-line bg-card px-4 py-3 text-sm text-ink">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> {b}
              </li>
            ))}
          </ul>
          <p className="mt-7 flex items-center gap-2 text-xs text-muted">
            <ShieldCheck className="size-4" aria-hidden /> {t('jobsArea.register.asideNote')}
          </p>
        </motion.aside>
      </div>
    </section>
  );
}
