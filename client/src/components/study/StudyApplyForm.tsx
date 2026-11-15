import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, FileText, Send, X } from 'lucide-react';
import i18n, { currentSiteLocale } from '@/i18n';
import { api, errorCode } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { leadVisitorId } from '@/lib/leadVisitor';
import { Button } from '@/components/ui/Button';
import { PhoneInput, phoneInvalid } from '@/components/ui/PhoneInput';
import { intakeLabel, intakeOptions, STUDY_CERTIFICATES, STUDY_CURRENT_DEGREES, type PublicStudyProgramme } from '@/lib/study';

const FILE_ACCEPT = '.pdf,.doc,.docx,.jpg,.jpeg,.png,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg,image/png';
const FILE_MAX_MB = 5;
const FILE_TYPES = /\.(pdf|docx?|jpe?g|png)$/i;

const errorText = (err: unknown) => {
  const code = errorCode(err);
  const key = `study.apply.errors.${code}`;
  return i18n.exists(key) ? String(i18n.t(key)) : String(i18n.t('study.apply.errors.generic'));
};

const EMPTY = {
  name: '',
  email: '',
  phone: '',
  currentDegree: '',
  fieldOfStudy: '',
  gpa: '',
  languageCertificate: '',
  languageLevel: '',
  desiredIntake: '',
  message: '',
  consent: false,
  website: '',
};

/** One optional upload (CV or diploma): type and size checked here, bytes on the server. */
const FileField = ({ id, label, file, onChange }: { id: string; label: string; file: File | null; onChange: (f: File | null) => void }) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const pick = (f: File | null) => {
    setError(null);
    if (!f) return onChange(null);
    const bad = !FILE_TYPES.test(f.name) ? 'UNSUPPORTED_FILE_TYPE' : f.size > FILE_MAX_MB * 1024 * 1024 ? 'FILE_TOO_LARGE' : null;
    if (bad) {
      setError(t(`study.apply.errors.${bad}`));
      if (ref.current) ref.current.value = '';
      return;
    }
    onChange(f);
  };
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {file ? (
        <div className="flex items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm">
          <FileText className="size-4 shrink-0 text-muted" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-ink">{file.name}</span>
          <button
            type="button"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-muted hover:bg-sunken hover:text-ink"
            onClick={() => {
              onChange(null);
              if (ref.current) ref.current.value = '';
            }}
            aria-label={`${t('study.apply.remove')}: ${file.name}`}
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      ) : (
        <input
          ref={ref}
          id={id}
          type="file"
          accept={FILE_ACCEPT}
          className="input file:mr-3 file:rounded-md file:border-0 file:bg-sunken file:px-3 file:py-1.5 file:text-sm file:text-ink"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          aria-describedby={`${id}-hint${error ? ` ${id}-err` : ''}`}
          aria-invalid={!!error || undefined}
        />
      )}
      <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
        {t('study.apply.fileHint', { mb: FILE_MAX_MB })}
      </p>
      {error && (
        <p id={`${id}-err`} className="mt-1 text-xs text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
};

/**
 * "Apply via Triad Vision" for a catalogue programme (POST /api/study/programmes/:slug/apply, multipart). Signed-in
 * clients get their profile prefilled after hydration (the server markup always shows the empty form) and the lead
 * is attached to their account on the server.
 */
export const StudyApplyForm = ({ programme, todayYear }: { programme: PublicStudyProgramme; todayYear: number }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const uid = useId();
  const id = (k: string) => `${uid}-${k}`;
  const client = user?.role === 'CLIENT' ? user : null;
  const [f, setF] = useState(EMPTY);
  const [cv, setCv] = useState<File | null>(null);
  const [diploma, setDiploma] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const doneRef = useRef<HTMLDivElement>(null);

  // Prefill from the client account once it is known (never during the server render).
  useEffect(() => {
    if (!client) return;
    setF((x) => ({
      ...x,
      name: x.name || `${client.firstName} ${client.lastName}`.trim(),
      email: x.email || client.email,
      phone: x.phone || client.phone || '',
      currentDegree: x.currentDegree || (client.education === 'university' ? 'BACHELOR' : client.education === 'school' ? 'SCHOOL' : ''),
      fieldOfStudy: x.fieldOfStudy || client.profession || '',
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id]);

  useEffect(() => {
    if (done) doneRef.current?.focus({ preventScroll: true });
  }, [done]);

  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  const phoneBad = phoneInvalid(f.phone, { current: client?.phone });
  const intakes = intakeOptions(programme.deadlines, todayYear);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending || phoneBad) return;
    const fd = new FormData();
    for (const k of ['name', 'email', 'phone', 'currentDegree', 'fieldOfStudy', 'gpa', 'languageCertificate', 'languageLevel', 'desiredIntake', 'message'] as const) {
      const v = f[k].trim();
      if (v) fd.set(k, v);
    }
    fd.set('consent', f.consent ? 'true' : '');
    fd.set('lng', currentSiteLocale());
    if (f.website) fd.set('website', f.website);
    const visitorId = leadVisitorId();
    if (visitorId) fd.set('visitorId', visitorId);
    if (cv) fd.set('cv', cv);
    if (diploma) fd.set('diploma', diploma);
    setSending(true);
    setError(null);
    try {
      await api.post(`/study/programmes/${encodeURIComponent(programme.slug)}/apply`, fd);
      setDone(true);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div ref={doneRef} tabIndex={-1} role="status" className="flex flex-col items-center py-8 text-center outline-none">
        <span className="grid size-16 place-items-center rounded-full bg-success-bg text-success">
          <CheckCircle2 className="size-8" aria-hidden />
        </span>
        <p className="mt-4 font-display text-xl font-semibold text-ink">{t('study.apply.doneTitle')}</p>
        <p className="mt-2 max-w-sm text-muted">{t('study.apply.doneText')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* honeypot for bots */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden value={f.website} onChange={(e) => set('website', e.target.value)} />
      <p className="text-sm text-muted">{t('study.apply.intro')}</p>
      {client && <p className="rounded-lg border border-line bg-card px-3 py-2 text-xs text-muted">{t('study.apply.prefilled')}</p>}

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-ink">{t('study.apply.you')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={id('name')}>
              {t('study.apply.name')} <span aria-hidden>*</span>
            </label>
            <input id={id('name')} required minLength={2} maxLength={120} autoComplete="name" className="input" value={f.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={id('email')}>
              {t('study.apply.email')} <span aria-hidden>*</span>
            </label>
            <input id={id('email')} type="email" required maxLength={190} autoComplete="email" className="input" value={f.email} onChange={(e) => set('email', e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <label className="label" htmlFor={id('phone')}>
              {t('study.apply.phone')} <span aria-hidden>*</span>
            </label>
            <PhoneInput id={id('phone')} required value={f.phone} current={client?.phone} onChange={(v) => set('phone', v)} />
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="mb-1 text-sm font-semibold text-ink">{t('study.apply.studies')}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor={id('degree')}>
              {t('study.apply.currentDegree')} <span aria-hidden>*</span>
            </label>
            <select id={id('degree')} required className="input" value={f.currentDegree} onChange={(e) => set('currentDegree', e.target.value)}>
              <option value="" disabled>
                —
              </option>
              {STUDY_CURRENT_DEGREES.map((d) => (
                <option key={d} value={d}>
                  {t(`study.apply.degreeOpts.${d}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={id('field')}>{t('study.apply.fieldOfStudy')}</label>
            <input id={id('field')} maxLength={160} className="input" value={f.fieldOfStudy} onChange={(e) => set('fieldOfStudy', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor={id('gpa')}>{t('study.apply.gpa')}</label>
            <input id={id('gpa')} maxLength={40} className="input" value={f.gpa} onChange={(e) => set('gpa', e.target.value)} aria-describedby={id('gpa-hint')} />
            <p id={id('gpa-hint')} className="mt-1 text-xs text-muted">
              {t('study.apply.gpaHint')}
            </p>
          </div>
          <div>
            <label className="label" htmlFor={id('intake')}>{t('study.apply.intake')}</label>
            <select id={id('intake')} className="input" value={f.desiredIntake} onChange={(e) => set('desiredIntake', e.target.value)}>
              <option value="">{t('study.apply.anyIntake')}</option>
              {intakes.map((o) => (
                <option key={o.value} value={o.value}>
                  {intakeLabel(t, o.intake, o.year)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={id('cert')}>
              {t('study.apply.certificate')} <span aria-hidden>*</span>
            </label>
            <select id={id('cert')} required className="input" value={f.languageCertificate} onChange={(e) => set('languageCertificate', e.target.value)}>
              <option value="" disabled>
                —
              </option>
              {STUDY_CERTIFICATES.map((c) => (
                <option key={c} value={c}>
                  {t(`study.apply.certOpts.${c}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={id('level')}>{t('study.apply.level')}</label>
            <input
              id={id('level')}
              maxLength={40}
              className="input"
              value={f.languageLevel}
              onChange={(e) => set('languageLevel', e.target.value)}
              disabled={f.languageCertificate === 'NONE'}
              aria-describedby={id('level-hint')}
            />
            <p id={id('level-hint')} className="mt-1 text-xs text-muted">
              {t('study.apply.levelHint')}
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <FileField id={id('cv')} label={t('study.apply.cv')} file={cv} onChange={setCv} />
          <FileField id={id('diploma')} label={t('study.apply.diploma')} file={diploma} onChange={setDiploma} />
        </div>
        <div>
          <label className="label" htmlFor={id('message')}>{t('study.apply.message')}</label>
          <textarea id={id('message')} rows={3} maxLength={3000} className="input resize-y" value={f.message} onChange={(e) => set('message', e.target.value)} />
        </div>
        <label className="flex items-start gap-2.5 text-sm text-muted">
          <input type="checkbox" required className="mt-0.5 size-5 shrink-0 accent-brand-600" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} />
          <span>
            {t('study.apply.consent')}{' '}
            <Link to="/privacy" target="_blank" className="text-link underline">
              {t('study.apply.privacyLink')}
            </Link>
          </span>
        </label>
      </fieldset>

      {error && (
        <p role="alert" className="rounded-lg border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">
          {error}
        </p>
      )}
      <Button type="submit" loading={sending} icon={Send} disabled={phoneBad || !f.consent}>
        {sending ? t('study.apply.sending') : t('study.apply.submit')}
      </Button>
    </form>
  );
};
