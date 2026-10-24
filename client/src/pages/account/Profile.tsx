import { useId, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import {
  Bell,
  BriefcaseBusiness,
  CheckCircle2,
  Download,
  KeyRound,
  LogOut,
  Mail,
  MessageCircle,
  Megaphone,
  MessageSquareText,
  Monitor,
  Save,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  type LucideIcon,
} from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useL10n } from '@/lib/l10n';
import { isStrongPassword, PASSWORD_MAX, PASSWORD_MIN, type User, type UserSession } from '@/lib/types';
import { LOCALES, type Locale } from '@/i18n';
import { Flag } from '@/components/ui/Flag';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/portal/ConfirmDialog';
import { EmailOtpCard } from '@/components/auth/EmailOtpCard';
import { CalendarSubscribe } from '@/components/prep/CalendarSubscribe';
import { ProgressRing } from '@/components/portal/ProgressRing';
import { useApiError } from '@/components/portal/useApiError';
import { OVERVIEW_KEY } from '@/components/portal/useOverview';
import {
  EDUCATION_LEVELS,
  FIELD_TAB,
  GERMAN_LEVELS,
  LICENCE_CLASSES,
  LIMITS,
  PROFILE_TABS,
  birthDateBounds,
  birthDateError,
  experienceError,
  profileCompleteness,
  type ProfileTab,
} from '@/components/portal/profileFields';
import { registerCopy } from '@/i18n';
import { campaignConsentCopy } from '@/i18n/pagesCampaigns';
import { pagesAccount } from '@/i18n/pagesAccount';
import { pagesGrowth } from '@/i18n/pagesGrowth';
import { pagesMessaging } from '@/i18n/pagesMessaging';
import { usePageTitle } from '@/lib/usePageTitle';
import { pagesPlacement } from '@/i18n/pagesPlacement';
import { IntroVideoPanel } from '@/components/placement/IntroVideo';
import { RECOGNITION_STATUSES } from '@/components/placement/api';

registerCopy(pagesAccount);
registerCopy(pagesGrowth);
registerCopy(pagesMessaging);
registerCopy(campaignConsentCopy);
registerCopy(pagesPlacement);

const TAB_ICON: Record<ProfileTab, LucideIcon> = {
  personal: UserRound,
  professional: BriefcaseBusiness,
  notifications: Bell,
  security: KeyRound,
  privacy: ShieldCheck,
};

// ─── Small building blocks ──────────────────────────────────────────────

const Field = ({
  label,
  id,
  error,
  hint,
  ...props
}: { label: string; id: string; error?: string | null; hint?: ReactNode } & InputHTMLAttributes<HTMLInputElement>) => (
  <div className="min-w-0">
    <label htmlFor={id} className="label">
      {label}
    </label>
    <input
      id={id}
      className={clsx('input', error && 'border-danger focus:border-danger focus:ring-danger/15')}
      aria-invalid={!!error || undefined}
      aria-describedby={error || hint ? `${id}-desc` : undefined}
      {...props}
    />
    {(error || hint) && (
      <p id={`${id}-desc`} className={clsx('mt-1.5 text-xs', error ? 'text-danger' : 'text-muted')}>
        {error || hint}
      </p>
    )}
  </div>
);

const Panel = ({ title, icon: Icon, intro, children, id }: { title: string; icon: LucideIcon; intro?: string; children: ReactNode; id: string }) => (
  <div className="card card-pad">
    <h2 id={id} className="flex items-center gap-2.5 text-lg font-bold text-navy-900">
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
        <Icon className="size-4.5" aria-hidden />
      </span>
      {title}
    </h2>
    {intro && <p className="mt-2 text-sm leading-relaxed text-muted">{intro}</p>}
    <div className="mt-5">{children}</div>
  </div>
);

const SaveBar = ({ busy, disabled }: { busy: boolean; disabled?: boolean }) => {
  const { t } = useTranslation();
  return (
    <div className="mt-6 flex justify-end border-t border-line pt-5">
      <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto" disabled={busy || disabled}>
        {busy ? <Spinner className="size-4" /> : <Save className="size-4" aria-hidden />}
        {t('common.save')}
      </button>
    </div>
  );
};

const Toggle = ({
  checked,
  onChange,
  label,
  hint,
  icon: Icon,
  busy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint: string;
  icon: LucideIcon;
  busy?: boolean;
}) => {
  const id = useId();
  return (
    <div className="flex items-center gap-4 rounded-xl border border-line p-4">
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-surface text-brand-600">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p id={`${id}-l`} className="text-sm font-semibold text-navy-900">
          {label}
        </p>
        <p id={`${id}-h`} className="text-xs leading-relaxed text-muted">
          {hint}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={`${id}-h`}
        disabled={busy}
        onClick={() => onChange(!checked)}
        className={clsx(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors disabled:opacity-60',
          checked ? 'bg-brand-600' : 'bg-slate-300',
        )}
      >
        <span
          className={clsx(
            'inline-block size-5 rounded-full bg-white shadow transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1',
          )}
          aria-hidden
        />
      </button>
    </div>
  );
};

/** PATCH /api/auth/me, update the cached user and the dashboard. */
const useSaveProfile = () => {
  const { setUser } = useAuth();
  const qc = useQueryClient();
  return async (body: Record<string, unknown>) => {
    const res = await api.patch<{ user: User }>('/auth/me', body);
    setUser(res.data.user);
    void qc.invalidateQueries({ queryKey: OVERVIEW_KEY });
    return res.data.user;
  };
};

const tooLong = (v: string, max: number) => v.trim().length > max;

const PASSPORT_KEY = ['account-passport'];
const PASSPORT_RE = /^\d{4}-\d{2}-\d{2}$/;

// ─── Personal data ─────────────────────────────────────────────────────

const PersonalPanel = ({ user }: { user: User }) => {
  const { t } = useTranslation();
  const save = useSaveProfile();
  const onError = useApiError();
  const uid = useId();
  const [f, setF] = useState({
    firstName: user.firstName,
    lastName: user.lastName,
    phone: user.phone ?? '',
    birthDate: user.birthDate ?? '',
    passportNumber: user.passportNumber ?? '',
    nationality: user.nationality ?? '',
    city: user.city ?? '',
    address: user.address ?? '',
  });
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  // Passport validity is stored separately (PATCH /account/passport) and drives the expiry reminders.
  const passportQuery = useQuery({
    queryKey: PASSPORT_KEY,
    queryFn: async () => (await api.get<{ passportExpiry: string | null }>('/account/passport')).data,
    staleTime: 5 * 60_000,
  });
  const qc = useQueryClient();
  const [passport, setPassport] = useState<string | null>(null);
  const savedPassport = passportQuery.data?.passportExpiry ?? '';
  const passportValue = passport ?? savedPassport;
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const bounds = birthDateBounds();
  const maxMsg = (max: number) => t('accountPage.profile.errors.tooLong', { max });

  const errors = {
    firstName: !f.firstName.trim() ? t('accountPage.profile.errors.required') : tooLong(f.firstName, LIMITS.name) ? maxMsg(LIMITS.name) : null,
    lastName: !f.lastName.trim() ? t('accountPage.profile.errors.required') : tooLong(f.lastName, LIMITS.name) ? maxMsg(LIMITS.name) : null,
    phone: tooLong(f.phone, LIMITS.phone) ? maxMsg(LIMITS.phone) : null,
    birthDate: (() => {
      const e = birthDateError(f.birthDate);
      return e ? t(`accountPage.profile.errors.${e}`) : null;
    })(),
    passportNumber: f.passportNumber.trim() && !/^[A-Z0-9]{5,20}$/.test(f.passportNumber.replace(/[\s-]/g, '').toUpperCase()) ? t('accountPage.profile.errors.passport') : null,
    nationality: tooLong(f.nationality, LIMITS.nationality) ? maxMsg(LIMITS.nationality) : null,
    city: tooLong(f.city, LIMITS.city) ? maxMsg(LIMITS.city) : null,
    address: tooLong(f.address, LIMITS.address) ? maxMsg(LIMITS.address) : null,
  };
  const passportError = passportValue && !PASSPORT_RE.test(passportValue) ? t('growth.passport.invalid') : null;
  const invalid = Object.values(errors).some(Boolean) || !!passportError;
  // Required/limit errors show while typing; the rest after the first submit attempt.
  const show = (k: keyof typeof errors) => (submitted || k === 'birthDate' ? errors[k] : f[k] ? errors[k] : null);

  const submit = async () => {
    setSubmitted(true);
    if (invalid) {
      toast.error(t('accountPage.profile.errors.fix'));
      return;
    }
    setBusy(true);
    try {
      await save({
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        phone: f.phone.trim() || null,
        birthDate: f.birthDate || null,
        passportNumber: f.passportNumber.replace(/[\s-]/g, '').toUpperCase() || null,
        nationality: f.nationality.trim() || null,
        city: f.city.trim() || null,
        address: f.address.trim() || null,
      });
      if (passport !== null && passport !== savedPassport) {
        const res = await api.patch<{ passportExpiry: string | null }>('/account/passport', { passportExpiry: passport || null });
        qc.setQueryData(PASSPORT_KEY, res.data);
        setPassport(null);
      }
      toast.success(t('portal.profileSaved'));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-labelledby={`${uid}-title`}
    >
      <Panel id={`${uid}-title`} title={t('accountPage.profile.tabs.personal')} icon={UserRound} intro={t('accountPage.profile.hints.personal')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${uid}-first`} label={`${t('auth.firstName')} *`} value={f.firstName} onChange={set('firstName')} autoComplete="given-name" maxLength={LIMITS.name} error={show('firstName')} />
          <Field id={`${uid}-last`} label={`${t('auth.lastName')} *`} value={f.lastName} onChange={set('lastName')} autoComplete="family-name" maxLength={LIMITS.name} error={show('lastName')} />
          <Field
            id={`${uid}-phone`}
            label={t('accountPage.profile.fields.phone')}
            type="tel"
            inputMode="tel"
            value={f.phone}
            onChange={set('phone')}
            autoComplete="tel"
            maxLength={LIMITS.phone}
            placeholder="+994 ..."
            error={show('phone')}
          />
          <div className="min-w-0">
            <label htmlFor={`${uid}-email`} className="label">
              {t('auth.email')}
            </label>
            <div className="relative">
              <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <input id={`${uid}-email`} className="input bg-surface pl-9 text-muted" value={user.email} readOnly />
            </div>
          </div>
          <Field
            id={`${uid}-birth`}
            label={t('accountPage.profile.fields.birthDate')}
            type="date"
            value={f.birthDate}
            onChange={set('birthDate')}
            min={bounds.min}
            max={bounds.max}
            autoComplete="bday"
            error={show('birthDate')}
            hint={t('accountPage.profile.hints.birthDate')}
          />
          <Field
            id={`${uid}-passport`}
            label={t('accountPage.profile.fields.passportNumber')}
            value={f.passportNumber}
            onChange={(e: { target: { value: string } }) => setF((p) => ({ ...p, passportNumber: e.target.value.toUpperCase() }))}
            maxLength={40}
            autoComplete="off"
            placeholder="C01234567"
            error={show('passportNumber')}
            hint={t('accountPage.profile.hints.passportNumber')}
          />
          <Field
            id={`${uid}-nat`}
            label={t('accountPage.profile.fields.nationality')}
            value={f.nationality}
            onChange={set('nationality')}
            maxLength={LIMITS.nationality}
            placeholder={t('accountPage.profile.placeholders.nationality')}
            error={show('nationality')}
          />
          <Field
            id={`${uid}-city`}
            label={t('accountPage.profile.fields.city')}
            value={f.city}
            onChange={set('city')}
            autoComplete="address-level2"
            maxLength={LIMITS.city}
            placeholder={t('accountPage.profile.placeholders.city')}
            error={show('city')}
          />
          <Field
            id={`${uid}-addr`}
            label={t('accountPage.profile.fields.address')}
            value={f.address}
            onChange={set('address')}
            autoComplete="street-address"
            maxLength={LIMITS.address}
            placeholder={t('accountPage.profile.placeholders.address')}
            error={show('address')}
          />
          <Field
            id={`${uid}-passport`}
            label={t('growth.passport.label')}
            type="date"
            value={passportValue}
            onChange={(e) => setPassport(e.target.value)}
            min="2000-01-01"
            disabled={passportQuery.isLoading}
            error={passportError}
            hint={t('growth.passport.hint')}
          />
        </div>
        <SaveBar busy={busy} />
      </Panel>
    </form>
  );
};

// ─── Professional profile ──────────────────────────────────────────────

const ProfessionalPanel = ({ user }: { user: User }) => {
  const { t } = useTranslation();
  const save = useSaveProfile();
  const onError = useApiError();
  const uid = useId();
  const [f, setF] = useState({
    profession: user.profession ?? '',
    experienceYears: user.experienceYears == null ? '' : String(user.experienceYears),
    germanLevel: user.germanLevel ?? '',
    education: user.education ?? '',
    recognitionStatus: user.recognitionStatus ?? '',
    recognitionNote: user.recognitionNote ?? '',
    drivingLicence: user.drivingLicence ?? '',
    about: user.about ?? '',
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));
  const maxMsg = (max: number) => t('accountPage.profile.errors.tooLong', { max });

  const licences = f.drivingLicence
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const toggleLicence = (cls: string) => {
    const next = licences.includes(cls) ? licences.filter((c) => c !== cls) : [...licences, cls];
    setF((p) => ({ ...p, drivingLicence: next.join(', ') }));
  };

  const errors = {
    profession: tooLong(f.profession, LIMITS.profession) ? maxMsg(LIMITS.profession) : null,
    experienceYears: experienceError(f.experienceYears) ? t('accountPage.profile.errors.experience') : null,
    drivingLicence: tooLong(f.drivingLicence, LIMITS.drivingLicence) ? maxMsg(LIMITS.drivingLicence) : null,
    about: tooLong(f.about, LIMITS.about) ? maxMsg(LIMITS.about) : null,
  };
  const invalid = Object.values(errors).some(Boolean);

  const submit = async () => {
    if (invalid) {
      toast.error(t('accountPage.profile.errors.fix'));
      return;
    }
    setBusy(true);
    try {
      await save({
        profession: f.profession.trim() || null,
        experienceYears: f.experienceYears.trim() === '' ? null : Number(f.experienceYears),
        germanLevel: f.germanLevel || null,
        education: f.education || null,
        recognitionStatus: f.recognitionStatus || null,
        recognitionNote: f.recognitionNote.trim() || null,
        drivingLicence: f.drivingLicence.trim() || null,
        about: f.about.trim() || null,
      });
      toast.success(t('portal.profileSaved'));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-labelledby={`${uid}-title`}
    >
      <Panel id={`${uid}-title`} title={t('accountPage.profile.tabs.professional')} icon={BriefcaseBusiness} intro={t('accountPage.profile.hints.professional')}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id={`${uid}-prof`}
            label={t('accountPage.profile.fields.profession')}
            value={f.profession}
            onChange={set('profession')}
            maxLength={LIMITS.profession}
            placeholder={t('accountPage.profile.placeholders.profession')}
            autoComplete="organization-title"
            error={errors.profession}
          />
          <Field
            id={`${uid}-exp`}
            label={t('accountPage.profile.fields.experienceYears')}
            type="number"
            inputMode="numeric"
            min={0}
            max={LIMITS.experienceMax}
            step={1}
            value={f.experienceYears}
            onChange={set('experienceYears')}
            error={errors.experienceYears}
          />
          <div className="min-w-0">
            <label htmlFor={`${uid}-de`} className="label">
              {t('accountPage.profile.fields.germanLevel')}
            </label>
            <select id={`${uid}-de`} className="input" value={f.germanLevel} onChange={set('germanLevel')}>
              <option value="">{t('accountPage.profile.select')}</option>
              {GERMAN_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {t(`accountPage.profile.germanLevels.${l}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${uid}-edu`} className="label">
              {t('accountPage.profile.fields.education')}
            </label>
            <select id={`${uid}-edu`} className="input" value={f.education} onChange={set('education')}>
              <option value="">{t('accountPage.profile.select')}</option>
              {EDUCATION_LEVELS.map((e) => (
                <option key={e} value={e}>
                  {t(`accountPage.profile.educationLevels.${e}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-0">
            <label htmlFor={`${uid}-rec`} className="label">
              {t('placement.recognition.label')}
            </label>
            <select id={`${uid}-rec`} className="input" value={f.recognitionStatus} onChange={set('recognitionStatus')} aria-describedby={`${uid}-rec-hint`}>
              <option value="">{t('accountPage.profile.select')}</option>
              {RECOGNITION_STATUSES.map((r) => (
                <option key={r} value={r}>
                  {t(`placement.recognition.status.${r}`)}
                </option>
              ))}
            </select>
          </div>
          <Field
            id={`${uid}-recnote`}
            label={t('placement.recognition.note')}
            value={f.recognitionNote}
            onChange={set('recognitionNote')}
            maxLength={300}
            placeholder={t('placement.recognition.notePh')}
          />
          <p id={`${uid}-rec-hint`} className="-mt-2 text-xs text-muted sm:col-span-2">
            {t('placement.recognition.hint')}
          </p>
          <div className="min-w-0 sm:col-span-2">
            <Field
              id={`${uid}-lic`}
              label={t('accountPage.profile.fields.drivingLicence')}
              value={f.drivingLicence}
              onChange={set('drivingLicence')}
              maxLength={LIMITS.drivingLicence}
              placeholder={t('accountPage.profile.placeholders.drivingLicence')}
              error={errors.drivingLicence}
              hint={t('accountPage.profile.hints.drivingLicence')}
            />
            <div className="mt-2 flex flex-wrap gap-1.5" aria-hidden>
              {LICENCE_CLASSES.map((cls) => {
                const on = licences.includes(cls);
                return (
                  <button
                    key={cls}
                    type="button"
                    tabIndex={-1}
                    onClick={() => toggleLicence(cls)}
                    className={clsx(
                      'min-h-9 min-w-11 rounded-lg border px-2.5 text-xs font-bold transition-colors',
                      on ? 'border-brand-600 bg-brand-600 text-white' : 'border-line text-navy-900 hover:border-brand-400',
                    )}
                  >
                    {cls}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-w-0 sm:col-span-2">
            <label htmlFor={`${uid}-about`} className="label">
              {t('accountPage.profile.fields.about')}
            </label>
            <textarea
              id={`${uid}-about`}
              className={clsx('input min-h-32 resize-y', errors.about && 'border-danger')}
              value={f.about}
              onChange={set('about')}
              maxLength={LIMITS.about}
              placeholder={t('accountPage.profile.placeholders.about')}
              aria-describedby={`${uid}-about-count`}
              aria-invalid={!!errors.about || undefined}
            />
            <p id={`${uid}-about-count`} className={clsx('mt-1.5 text-right text-xs tabular-nums', errors.about ? 'text-danger' : 'text-muted')}>
              {f.about.length} / {LIMITS.about}
            </p>
          </div>
        </div>
        <SaveBar busy={busy} />
      </Panel>
    </form>
  );
};

// ─── Notifications ─────────────────────────────────────────────────────

/** WhatsApp / SMS toggles (messaging module). Current values come from GET /api/messaging/preferences; PATCH /auth/me saves them. */
interface PhonePrefs {
  phone: string | null;
  whatsappOptIn: boolean;
  smsNotifications: boolean;
}
const PHONE_PREFS_KEY = ['messaging-preferences'] as const;

const PhoneChannels = ({ user, busy, update }: { user: User; busy: string | null; update: (key: string, body: Record<string, unknown>) => Promise<void> }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data } = useQuery({
    queryKey: PHONE_PREFS_KEY,
    queryFn: async () => (await api.get<{ preferences: PhonePrefs }>('/messaging/preferences')).data.preferences,
    staleTime: 60_000,
  });
  const prefs: PhonePrefs = data ?? { phone: user.phone, whatsappOptIn: true, smsNotifications: true };
  const phone = user.phone ?? prefs.phone;
  const toggle = async (key: 'whatsappOptIn' | 'smsNotifications', v: boolean) => {
    qc.setQueryData<PhonePrefs>(PHONE_PREFS_KEY, (old) => ({ ...(old ?? prefs), [key]: v }));
    try {
      await update(key, { [key]: v });
    } finally {
      void qc.invalidateQueries({ queryKey: PHONE_PREFS_KEY });
    }
  };
  return (
    <>
      <Toggle icon={MessageCircle} label={t('messaging.prefs.whatsapp')} hint={t('messaging.prefs.whatsappHint')} checked={prefs.whatsappOptIn !== false} busy={busy === 'whatsappOptIn'} onChange={(v) => void toggle('whatsappOptIn', v)} />
      <Toggle icon={MessageSquareText} label={t('messaging.prefs.sms')} hint={t('messaging.prefs.smsHint')} checked={prefs.smsNotifications !== false} busy={busy === 'smsNotifications'} onChange={(v) => void toggle('smsNotifications', v)} />
      {phone ? (
        <p className="px-1 text-xs text-muted">{t('messaging.prefs.phoneLabel', { phone })}</p>
      ) : (
        <p className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
          <span>{t('messaging.prefs.noPhone')}</span>
          <button type="button" className="min-h-10 text-sm font-semibold text-brand-700 underline-offset-2 hover:underline" onClick={() => navigate('?tab=personal')}>
            {t('messaging.prefs.addPhone')}
          </button>
        </p>
      )}
    </>
  );
};

const NotificationsPanel = ({ user }: { user: User }) => {
  const { t, i18n } = useTranslation();
  const { setUser } = useAuth();
  const save = useSaveProfile();
  const onError = useApiError();
  const uid = useId();
  const [busy, setBusy] = useState<string | null>(null);

  const update = async (key: string, body: Record<string, unknown>) => {
    const prev = user;
    setUser({ ...user, ...(body as Partial<User>) }); // optimistic
    setBusy(key);
    try {
      await save(body);
      toast.success(t('accountPage.profile.notif.saved'));
    } catch (err) {
      setUser(prev);
      onError(err);
    } finally {
      setBusy(null);
    }
  };

  const setLocale = async (l: Locale) => {
    if (l === user.locale) return;
    await update('locale', { locale: l });
    if ((i18n.resolvedLanguage ?? '').slice(0, 2) !== l) await i18n.changeLanguage(l);
  };

  const emailOn = user.emailNotifications !== false;
  const pushOn = user.pushNotifications !== false;

  return (
    <Panel id={`${uid}-title`} title={t('accountPage.profile.notif.title')} icon={Bell} intro={t('accountPage.profile.notif.text')}>
      <div className="space-y-3">
        <Toggle
          icon={Mail}
          label={t('accountPage.profile.notif.email')}
          hint={t('accountPage.profile.notif.emailHint')}
          checked={emailOn}
          busy={busy === 'email'}
          onChange={(v) => void update('email', { emailNotifications: v })}
        />
        <Toggle
          icon={Smartphone}
          label={t('accountPage.profile.notif.push')}
          hint={t('accountPage.profile.notif.pushHint')}
          checked={pushOn}
          busy={busy === 'push'}
          onChange={(v) => void update('push', { pushNotifications: v })}
        />
        <Toggle
          icon={Megaphone}
          label={t('campaignConsent.profileLabel')}
          hint={t('campaignConsent.profileHint')}
          checked={user.marketingOptIn === true}
          busy={busy === 'marketing'}
          onChange={(v) => void update('marketing', { marketingOptIn: v })}
        />
        {!emailOn && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
            {t('accountPage.profile.notif.warning')}
          </p>
        )}
        <PhoneChannels user={user} busy={busy} update={update} />
      </div>

      <fieldset className="mt-6 border-t border-line pt-5">
        <legend className="sr-only">{t('portal.language')}</legend>
        <p className="text-sm font-semibold text-navy-900" aria-hidden>
          {t('portal.language')}
        </p>
        <p className="mt-0.5 text-xs text-muted">{t('accountPage.profile.notif.languageHint')}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {LOCALES.map((l) => {
            const active = user.locale === l;
            return (
              <label
                key={l}
                className={clsx(
                  'relative flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-semibold transition-colors [&:has(input:focus-visible)]:ring-4 [&:has(input:focus-visible)]:ring-brand-500/20',
                  active ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line text-navy-900 hover:border-brand-400',
                )}
              >
                <input type="radio" name={`${uid}-locale`} value={l} checked={active} onChange={() => void setLocale(l)} className="sr-only" disabled={busy === 'locale'} />
                <span aria-hidden>
                  <Flag code={l} />
                </span>
                <span className="truncate">{i18n.getFixedT(l)('meta.lang')}</span>
                {busy === 'locale' && active && <Spinner className="ml-auto size-3.5" />}
              </label>
            );
          })}
        </div>
      </fieldset>
    </Panel>
  );
};

// ─── Security ──────────────────────────────────────────────────────────

/** Short device description from a user-agent string (no library: only the coarse browser + OS). */
const describeAgent = (ua: string | null, fallback: string) => {
  if (!ua) return fallback;
  const os = /windows/i.test(ua) ? 'Windows' : /android/i.test(ua) ? 'Android' : /iphone|ipad/i.test(ua) ? 'iOS' : /mac os/i.test(ua) ? 'macOS' : /linux/i.test(ua) ? 'Linux' : '';
  const browser = /edg\//i.test(ua) ? 'Edge' : /opr\//i.test(ua) ? 'Opera' : /chrome\//i.test(ua) ? 'Chrome' : /firefox\//i.test(ua) ? 'Firefox' : /safari\//i.test(ua) ? 'Safari' : '';
  const parts = [browser, os].filter(Boolean);
  return parts.length ? parts.join(' · ') : fallback;
};

const SESSIONS_KEY = ['sessions'];

const SessionsPanel = () => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const qc = useQueryClient();
  const onError = useApiError();
  const uid = useId();
  const { data, isLoading } = useQuery({
    queryKey: SESSIONS_KEY,
    queryFn: async () => (await api.get<{ sessions: UserSession[] }>('/auth/sessions')).data.sessions,
  });
  const revokeOne = useMutation({
    mutationFn: (id: string) => api.delete(`/auth/sessions/${id}`),
    onSuccess: () => {
      toast.success(t('accountPage.profile.security.sessions.revoked'));
      void qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError,
  });
  const revokeOthers = useMutation({
    mutationFn: async () => (await api.delete<{ revoked: number }>('/auth/sessions')).data.revoked,
    onSuccess: (count) => {
      toast.success(t('accountPage.profile.security.sessions.revokedOthers', { count }));
      void qc.invalidateQueries({ queryKey: SESSIONS_KEY });
    },
    onError,
  });

  const sessions = data ?? [];
  const others = sessions.filter((x) => !x.current);
  const k = (key: string) => t(`accountPage.profile.security.sessions.${key}`);

  return (
    <Panel id={`${uid}-title`} title={k('title')} icon={Monitor} intro={k('text')}>
      {isLoading ? (
        <div className="grid place-items-center py-6">
          <Spinner className="size-5 text-brand-600" />
        </div>
      ) : (
        <ul className="divide-y divide-line rounded-xl border border-line">
          {sessions.map((x) => (
            <li key={x.id} className="flex items-center gap-3 px-4 py-3">
              <span className={clsx('grid size-9 shrink-0 place-items-center rounded-lg', x.current ? 'bg-brand-50 text-brand-600' : 'bg-surface text-muted')}>
                {x.client === 'mobile' ? <Smartphone className="size-4" aria-hidden /> : <Monitor className="size-4" aria-hidden />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-semibold text-navy-900">
                  <span className="truncate">{x.client === 'mobile' ? k('mobile') : describeAgent(x.userAgent, k('unknownDevice'))}</span>
                  {x.current && <span className="badge bg-brand-100 text-[10px] text-brand-700">{k('current')}</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {k('lastSeen')}: {dateTime(x.lastSeenAt)}
                  {x.ip ? ` · ${x.ip}` : ''}
                </p>
              </div>
              {!x.current && (
                <button
                  type="button"
                  className="btn btn-sm min-h-9 shrink-0 border border-line text-navy-900 hover:border-red-200 hover:bg-red-50 hover:text-danger"
                  disabled={revokeOne.isPending || revokeOthers.isPending}
                  onClick={() => revokeOne.mutate(x.id)}
                >
                  {k('revoke')}
                </button>
              )}
            </li>
          ))}
          {sessions.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">{k('none')}</li>}
        </ul>
      )}
      {others.length > 0 && (
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            className="btn min-h-11 w-full border border-line text-navy-900 hover:bg-surface sm:w-auto"
            disabled={revokeOthers.isPending}
            onClick={() => revokeOthers.mutate()}
          >
            {revokeOthers.isPending ? <Spinner className="size-4" /> : <LogOut className="size-4" aria-hidden />}
            {k('revokeOthers')}
          </button>
        </div>
      )}
    </Panel>
  );
};

const SecurityPanel = ({ user }: { user: User }) => {
  const { t } = useTranslation();
  const { date } = useL10n();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const save = useSaveProfile();
  const onError = useApiError();
  const uid = useId();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const valid = currentPassword.length > 0 && isStrongPassword(newPassword);

  const submit = async () => {
    if (!valid) return;
    setBusy(true);
    try {
      await save({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      toast.success(t('portal.passwordChanged'));
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
    }
  };

  const doLogout = async () => {
    setLeaving(true);
    try {
      await logout();
      navigate('/', { replace: true });
    } catch (err) {
      onError(err);
      setLeaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-labelledby={`${uid}-title`}
      >
        <Panel id={`${uid}-title`} title={t('portal.changePassword')} icon={KeyRound}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              id={`${uid}-current`}
              label={t('portal.currentPassword')}
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <Field
              id={`${uid}-new`}
              label={t('auth.newPassword')}
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN}
              maxLength={PASSWORD_MAX}
              error={newPassword && !isStrongPassword(newPassword) ? t('auth.passwordHint') : null}
              hint={t('auth.passwordHint')}
            />
          </div>
          <div className="mt-6 flex justify-end border-t border-line pt-5">
            <button type="submit" className="btn-primary min-h-11 w-full sm:w-auto" disabled={busy || !valid}>
              {busy ? <Spinner className="size-4" /> : <KeyRound className="size-4" aria-hidden />}
              {t('portal.changePassword')}
            </button>
          </div>
        </Panel>
      </form>

      <EmailOtpCard />

      <SessionsPanel />

      <Panel id={`${uid}-logout`} title={t('accountPage.profile.security.logoutTitle')} icon={LogOut} intro={t('accountPage.profile.security.logoutText')}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {user.createdAt ? (
            <p className="text-xs text-muted">
              {t('accountPage.profile.security.memberSince')}: <span className="font-semibold text-navy-900">{date(user.createdAt)}</span>
            </p>
          ) : (
            <span />
          )}
          <button type="button" className="btn min-h-11 border border-line text-navy-900 hover:bg-surface" onClick={() => void doLogout()} disabled={leaving}>
            {leaving ? <Spinner className="size-4" /> : <LogOut className="size-4" aria-hidden />}
            {t('accountPage.profile.security.logout')}
          </button>
        </div>
      </Panel>
    </div>
  );
};

// ─── Privacy ───────────────────────────────────────────────────────────

const PrivacyPanel = () => {
  const { t } = useTranslation();
  const onError = useApiError();
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const send = async () => {
    setBusy(true);
    try {
      await api.post('/account/delete-request', reason.trim() ? { reason: reason.trim() } : {});
      setOpen(false);
      setSent(true);
      setReason('');
      toast.success(t('accountPage.profile.privacy.sent'));
    } catch (err) {
      if (errorCode(err) === 'TOO_MANY_REQUESTS') toast.error(t('accountPage.profile.privacy.tooMany'));
      else onError(err);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <Panel id={`${uid}-export`} title={t('accountPage.profile.privacy.exportTitle')} icon={Download} intro={t('accountPage.profile.privacy.exportText')}>
        <a href="/api/account/export" download className="btn-primary min-h-11 w-full sm:w-auto">
          <Download className="size-4" aria-hidden />
          {t('accountPage.profile.privacy.export')}
        </a>
      </Panel>

      <div className="card card-pad border-red-200">
        <h2 id={`${uid}-delete`} className="flex items-center gap-2.5 text-lg font-bold text-navy-900">
          <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-danger">
            <Trash2 className="size-4.5" aria-hidden />
          </span>
          {t('accountPage.profile.privacy.deleteTitle')}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('accountPage.profile.privacy.deleteText')}</p>
        {sent ? (
          <p className="mt-5 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800" role="status">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            {t('accountPage.profile.privacy.sent')}
          </p>
        ) : (
          <button type="button" className="btn mt-5 min-h-11 w-full border border-red-200 text-danger hover:bg-red-50 sm:w-auto" onClick={() => setOpen(true)}>
            <Trash2 className="size-4" aria-hidden />
            {t('accountPage.profile.privacy.deleteBtn')}
          </button>
        )}
      </div>

      <ConfirmDialog
        open={open}
        danger
        busy={busy}
        title={t('accountPage.profile.privacy.confirmTitle')}
        confirmLabel={t('accountPage.profile.privacy.confirm')}
        onConfirm={() => void send()}
        onClose={() => setOpen(false)}
      >
        <p>{t('accountPage.profile.privacy.confirmText')}</p>
        <label htmlFor={`${uid}-reason`} className="label mt-4">
          {t('accountPage.profile.privacy.reason')}
        </label>
        <textarea
          id={`${uid}-reason`}
          className="input min-h-24 resize-y"
          value={reason}
          maxLength={1000}
          onChange={(e) => setReason(e.target.value)}
        />
      </ConfirmDialog>
    </div>
  );
};

// ─── Page ──────────────────────────────────────────────────────────────

const Completeness = ({ user, onJump }: { user: User; onJump: (tab: ProfileTab) => void }) => {
  const { t } = useTranslation();
  const { percent, missing } = profileCompleteness(user);
  return (
    <section className="card card-pad" aria-labelledby="completeness-title">
      <div className="flex items-center gap-4">
        <ProgressRing percent={percent} size={64} stroke={6} className="text-navy-900" />
        <div className="min-w-0">
          <h2 id="completeness-title" className="text-sm font-bold text-navy-900">
            {t('accountPage.profile.completeness.title')}
          </h2>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            {missing.length ? t('accountPage.profile.completeness.hint') : t('accountPage.profile.completeness.done')}
          </p>
        </div>
      </div>
      {missing.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-muted">{t('accountPage.profile.completeness.missing')}</p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {missing.map((f) => (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => onJump(FIELD_TAB[f])}
                  className="badge min-h-7 border border-dashed border-line bg-surface text-navy-900 hover:border-brand-400 hover:text-brand-700"
                >
                  {t(`accountPage.profile.fields.${f}`)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
};

export default function Profile() {
  const { t } = useTranslation();
  usePageTitle(t('portal.profile'));
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const uid = useId();
  if (!user) return null;

  const requested = params.get('tab') as ProfileTab | null;
  const tab: ProfileTab = requested && PROFILE_TABS.includes(requested) ? requested : 'personal';
  const go = (next: ProfileTab) => setParams(next === 'personal' ? {} : { tab: next }, { replace: true });

  return (
    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:items-start lg:gap-8">
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-32">
        <div
          role="tablist"
          aria-label={t('accountPage.profile.sectionsLabel')}
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 lg:flex-col lg:rounded-2xl lg:border lg:border-line lg:bg-white lg:shadow-[0_8px_30px_-12px_rgba(11,31,68,0.18)] lg:gap-0.5 lg:overflow-visible lg:p-2 [&::-webkit-scrollbar]:hidden"
        >
          {PROFILE_TABS.map((key) => {
            const Icon = TAB_ICON[key];
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`${uid}-tab-${key}`}
                aria-selected={active}
                aria-controls={`${uid}-panel`}
                onClick={() => go(key)}
                className={clsx(
                  'flex min-h-11 shrink-0 items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors lg:w-full',
                  active
                    ? 'bg-navy-900 text-white shadow-md lg:bg-brand-50 lg:text-brand-700 lg:shadow-none'
                    : 'border border-line bg-white text-navy-900 hover:border-brand-400 lg:border-transparent lg:bg-transparent lg:hover:bg-surface',
                )}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                {t(`accountPage.profile.tabs.${key}`)}
              </button>
            );
          })}
        </div>
        <Completeness user={user} onJump={go} />
      </aside>

      <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-tab-${tab}`} className="min-w-0">
        {tab === 'personal' && <PersonalPanel key={user.id} user={user} />}
        {tab === 'professional' && <ProfessionalPanel key={user.id} user={user} />}
        {tab === 'professional' && <IntroVideoPanel className="mt-6" />}
        {tab === 'notifications' && <NotificationsPanel user={user} />}
        {tab === 'notifications' && <CalendarSubscribe className="mt-6" />}
        {tab === 'security' && <SecurityPanel user={user} />}
        {tab === 'privacy' && <PrivacyPanel />}
      </div>
    </div>
  );
}
