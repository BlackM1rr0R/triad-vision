import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Bug, ImagePlus, Trash2 } from 'lucide-react';
import { api, errorCode, formatBytes, getImpersonation } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { collectDiagnostics } from '@/lib/diagnostics';
import { optimizeImage } from '@/lib/imageCompress';
import { Sheet } from './Sheet';
import { useHelpAction, useHelpFabPresent } from '@/lib/helpMenu';

const MAX_IMAGE = 4 * 1024 * 1024;
/** Other code can open the dialog: window.dispatchEvent(new Event('tv:report-problem')). */
export const OPEN_EVENT = 'tv:report-problem';

const ProblemDialog = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const { user } = useAuth();
  const ids = { message: useId(), email: useId(), image: useId(), hp: useId() };
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const diagnostics = open ? collectDiagnostics() : null;
  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  useEffect(() => {
    if (open) return;
    setMessage('');
    setImage(null);
    setShowDetails(false);
  }, [open]);

  const pick = async (f: File | undefined) => {
    if (fileRef.current) fileRef.current.value = '';
    if (!f) return;
    if (!f.type.startsWith('image/')) return void toast.error(t('site.problem.badImage'));
    const small = await optimizeImage(f, { minBytes: 300 * 1024 });
    if (small.size > MAX_IMAGE) return void toast.error(t('site.problem.badImage'));
    setImage(small);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (message.trim().length < 5 || busy) return;
    setBusy(true);
    try {
      const d = collectDiagnostics();
      const form = new FormData();
      form.append('message', message.trim());
      form.append('pageUrl', d.pageUrl);
      form.append('appVersion', d.appVersion);
      form.append('userAgent', d.userAgent);
      form.append('platform', d.platform);
      form.append('screen', d.screen);
      form.append('language', d.language);
      form.append('consoleErrors', JSON.stringify(d.consoleErrors));
      if (d.lastApiError) form.append('lastApiError', JSON.stringify(d.lastApiError));
      if (!user && email.trim()) form.append('email', email.trim());
      if (website) form.append('website', website);
      if (image) form.append('image', image, image.name);
      await api.post('/site/problems', form, { timeout: 60_000 });
      toast.success(t('site.problem.sent'));
      onClose();
    } catch (err) {
      const code = errorCode(err);
      toast.error(
        code === 'TOO_MANY_REQUESTS' ? t('site.problem.tooMany') : code === 'INVALID_IMAGE' || code === 'UNSUPPORTED_FILE_TYPE' || code === 'FILE_TOO_LARGE' ? t('site.problem.badImage') : t('site.problem.error'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('site.problem.title')}
      closeLabel={t('site.problem.close')}
      footer={
        <>
          <button type="button" onClick={onClose} className="btn-sm min-h-11 rounded-full px-4 text-sm font-semibold text-muted hover:bg-card">
            {t('site.problem.close')}
          </button>
          <button type="submit" form="tv-problem-form" disabled={busy || message.trim().length < 5} className="btn-primary min-h-11 disabled:opacity-60">
            {busy ? t('site.problem.sending') : t('site.problem.send')}
          </button>
        </>
      }
    >
      <form id="tv-problem-form" onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">{t('site.problem.intro')}</p>
        <div>
          <label htmlFor={ids.message} className="label">
            {t('site.problem.message')}
          </label>
          <textarea
            id={ids.message}
            data-autofocus
            required
            minLength={5}
            maxLength={3000}
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={t('site.problem.placeholder')}
            className="input resize-y"
          />
        </div>
        {!user && (
          <div>
            <label htmlFor={ids.email} className="label">
              {t('site.problem.email')}
            </label>
            <input id={ids.email} type="email" autoComplete="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
          </div>
        )}
        {/* Honeypot: invisible to people, bots fill it in. */}
        <div className="absolute -left-[9999px] h-px w-px overflow-hidden" aria-hidden>
          <label htmlFor={ids.hp}>Website</label>
          <input id={ids.hp} tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </div>
        <div>
          <span className="label">{t('site.problem.image')}</span>
          {image ? (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-sunken p-2">
              <img src={preview ?? undefined} alt="" className="size-14 rounded-md object-cover" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {image.name} · {formatBytes(image.size)}
              </span>
              <button type="button" onClick={() => setImage(null)} aria-label={t('site.problem.removeImage')} className="grid size-10 place-items-center rounded-lg text-muted hover:bg-card">
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          ) : (
            <label htmlFor={ids.image} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line-strong px-3 py-2 text-sm font-semibold text-ink hover:bg-sunken">
              <ImagePlus className="size-4" aria-hidden />
              {t('site.problem.imageHint')}
            </label>
          )}
          <input ref={fileRef} id={ids.image} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
        </div>
        <div className="rounded-lg bg-sunken p-3 text-xs text-muted">
          <p>{t('site.problem.auto')}</p>
          <button type="button" className="mt-1.5 min-h-8 font-semibold text-link hover:underline" onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}>
            {t('site.problem.showDetails')}
          </button>
          {showDetails && diagnostics && (
            <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-line bg-card p-2 text-[11px] leading-snug break-all whitespace-pre-wrap text-ink">
              {JSON.stringify({ ...diagnostics, user: user ? { id: user.id, role: user.role } : null }, null, 2)}
            </pre>
          )}
        </div>
      </form>
    </Sheet>
  );
};

/** The small "Problem bildir" tab on the right edge of every page. */
export const ProblemButton = () => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);
  // Phones on the site: listed in the "Kömək" menu instead of the edge tab (lib/helpMenu.ts).
  const impersonating = !!getImpersonation();
  const helpFab = useHelpFabPresent();
  useHelpAction('problem', !impersonating, () => setOpen(true));
  if (impersonating) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={t('site.problem.button')}
        aria-label={t('site.problem.button')}
        className={`${helpFab ? 'max-sm:hidden ' : ''}fixed top-[62%] right-0 z-30 flex min-h-11 min-w-9 items-center justify-center gap-1.5 rounded-l-lg border border-r-0 border-line bg-card px-2 py-2 text-xs sm:min-h-0 sm:min-w-0 sm:px-1.5 font-semibold text-muted shadow-md transition hover:text-link print:hidden sm:[writing-mode:vertical-rl] sm:px-1 sm:py-3`}
      >
        <Bug className="size-4 shrink-0 sm:rotate-90" aria-hidden />
        <span className="hidden sm:inline">{t('site.problem.button')}</span>
      </button>
      <ProblemDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
};
