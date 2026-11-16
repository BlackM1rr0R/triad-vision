import { useDeferredValue, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Download, Info, Lock, Phone, RotateCcw, Share2, Smartphone } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesEmergencyWallpaper } from '@/i18n/pagesEmergencyWallpaper';
import { Switch } from '@/components/ui/Switch';
import { canvasPng, drawWallpaper } from '@/lib/emergencyWallpaper/canvas';
import {
  BLOOD_TYPES,
  CLOCK_SHARE,
  EMPTY_FIELDS,
  FIELD_MAX,
  PHONE_PRESETS,
  SPOKEN,
  THEMES,
  fileName,
  type ThemeId,
  type WallpaperFields,
} from '@/lib/emergencyWallpaper/layout';

registerCopy(pagesEmergencyWallpaper);

const THEME_IDS = Object.keys(THEMES) as ThemeId[];

/** Best guess of the visitor's phone (iPhone vs. Android); only the default of the select. */
const guessPreset = () => {
  if (typeof navigator === 'undefined') return PHONE_PRESETS[3].id;
  return /iPhone|iPad/i.test(navigator.userAgent) ? PHONE_PRESETS[3].id : /Android/i.test(navigator.userAgent) ? 'android-fhd' : PHONE_PRESETS[3].id;
};

const Field = ({ label, children, hint }: { label: string; children: (id: string) => ReactNode; hint?: string }) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {children(id)}
      {hint && <p className="mt-1 text-[11px] leading-snug text-muted">{hint}</p>}
    </div>
  );
};

/**
 * Lock-screen emergency wallpaper builder: phone size, colour, editable fields → canvas preview → PNG download
 * (or the share sheet on phones, which saves straight to Photos). Rendered on the device only; nothing is sent.
 * `prefill` (portal) seeds the fields once; the person can change everything.
 */
export const WallpaperBuilder = ({ prefill, prefilledNote }: { prefill?: Partial<WallpaperFields>; prefilledNote?: boolean }) => {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [presetId, setPresetId] = useState(PHONE_PRESETS[3].id);
  const [theme, setTheme] = useState<ThemeId>('night');
  const [fields, setFields] = useState<WallpaperFields>({ ...EMPTY_FIELDS, ...prefill });
  const [failed, setFailed] = useState(false);
  const [canShare, setCanShare] = useState(false);
  const deferred = useDeferredValue(fields);
  const preset = PHONE_PRESETS.find((p) => p.id === presetId) ?? PHONE_PRESETS[3];
  const set = (patch: Partial<WallpaperFields>) => setFields((f) => ({ ...f, ...patch }));

  // Client-only defaults (no SSR mismatch): the phone family and whether files can be shared.
  useEffect(() => {
    setPresetId(guessPreset());
    try {
      const probe = new File([new Blob()], 'x.png', { type: 'image/png' });
      setCanShare(typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] }));
    } catch {
      setCanShare(false);
    }
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    c.width = preset.width;
    c.height = preset.height;
    try {
      setFailed(!drawWallpaper(c, deferred, theme));
    } catch {
      setFailed(true);
    }
  }, [deferred, theme, preset.width, preset.height]);

  const blob = async () => (canvasRef.current ? canvasPng(canvasRef.current) : null);

  const download = async () => {
    const b = await blob();
    if (!b) return toast.error(t('ewp.renderError'));
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName(preset);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast.success(t('ewp.downloaded'));
  };

  const share = async () => {
    const b = await blob();
    if (!b) return toast.error(t('ewp.renderError'));
    try {
      await navigator.share({ files: [new File([b], fileName(preset), { type: 'image/png' })] });
    } catch {
      /* cancelled */
    }
  };

  const text = (key: keyof typeof FIELD_MAX, label: string, opts: { ph?: string; tel?: boolean } = {}) => (
    <Field label={label}>
      {(id) => (
        <input
          id={id}
          className="input"
          value={fields[key]}
          maxLength={FIELD_MAX[key]}
          placeholder={opts.ph}
          inputMode={opts.tel ? 'tel' : undefined}
          autoComplete="off"
          onChange={(e) => set({ [key]: e.target.value } as Partial<WallpaperFields>)}
        />
      )}
    </Field>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem] lg:items-start">
      <form className="min-w-0 space-y-4 rounded-3xl border border-line bg-card p-4 sm:p-5" onSubmit={(e) => e.preventDefault()} aria-labelledby="ewp-form-h">
        <div className="flex items-center justify-between gap-2">
          <h2 id="ewp-form-h" className="font-display text-lg font-semibold text-ink">
            {t('ewp.form.title')}
          </h2>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setFields({ ...EMPTY_FIELDS, ...prefill })}>
            <RotateCcw className="size-3.5" aria-hidden /> {t('ewp.form.reset')}
          </button>
        </div>
        {prefilledNote && <p className="rounded-2xl border border-primary/30 bg-primary/5 p-3 text-sm text-ink">{t('ewp.prefilled')}</p>}
        <p className="flex items-start gap-2 text-xs text-muted">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t('ewp.privacy')}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('ewp.form.device')}>
            {(id) => (
              <select id={id} className="input" value={presetId} onChange={(e) => setPresetId(e.target.value)}>
                {(['ios', 'android'] as const).map((pf) => (
                  <optgroup key={pf} label={t(`ewp.form.${pf}`)}>
                    {PHONE_PRESETS.filter((p) => p.platform === pf).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} · {p.width}×{p.height}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            )}
          </Field>
          <fieldset>
            <legend className="label">{t('ewp.form.theme')}</legend>
            <div className="flex flex-wrap gap-2">
              {THEME_IDS.map((id) => (
                <label
                  key={id}
                  className={clsx(
                    'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-3 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                    theme === id ? 'border-primary ring-1 ring-primary' : 'border-line hover:bg-sunken',
                  )}
                >
                  <input type="radio" className="sr-only" name="ewp-theme" checked={theme === id} onChange={() => setTheme(id)} />
                  <span className="size-5 rounded-full border border-line" style={{ background: `linear-gradient(${THEMES[id].bg[0]}, ${THEMES[id].bg[1]})` }} aria-hidden />
                  {t(`ewp.form.themes.${id}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        {text('name', t('ewp.form.name'))}
        <div className="grid gap-3 sm:grid-cols-2">
          {text('employerName', t('ewp.form.employer'))}
          {text('employerPhone', t('ewp.form.employerPhone'), { tel: true, ph: '+49 …' })}
        </div>
        {text('address', t('ewp.form.address'), { ph: t('ewp.form.addressPh') })}
        <div className="grid gap-3 sm:grid-cols-2">
          {text('contactName', t('ewp.form.contact'), { ph: t('ewp.form.contactPh') })}
          {text('contactPhone', t('ewp.form.contactPhone'), { tel: true, ph: '+994 …' })}
        </div>
        <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label={t('ewp.form.blood')}>
            {(id) => (
              <select id={id} className="input" value={fields.bloodType} onChange={(e) => set({ bloodType: e.target.value })}>
                <option value="">{t('ewp.form.bloodNone')}</option>
                {BLOOD_TYPES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            )}
          </Field>
          {text('allergies', t('ewp.form.allergies'), { ph: t('ewp.form.allergiesPh') })}
        </div>
        <fieldset>
          <legend className="label">{t('ewp.form.spoken')}</legend>
          <div className="flex flex-wrap gap-2">
            {SPOKEN.map((s) => {
              const on = fields.spoken.includes(s);
              return (
                <label
                  key={s}
                  className={clsx(
                    'flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-focus/40',
                    on ? 'border-primary bg-primary text-primary-contrast' : 'border-line bg-card text-ink hover:bg-sunken',
                  )}
                >
                  <input type="checkbox" className="sr-only" checked={on} onChange={() => set({ spoken: on ? fields.spoken.filter((x) => x !== s) : [...fields.spoken, s] })} />
                  {t(`ewp.form.langs.${s}`)}
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className="space-y-2">
          <Switch size="sm" showLabel checked={fields.littleGerman} onChange={(v) => set({ littleGerman: v })} label={t('ewp.form.littleGerman')} />
          <Switch size="sm" showLabel checked={fields.embassy} onChange={(v) => set({ embassy: v })} label={t('ewp.form.embassy')} />
        </div>
      </form>

      <div className="space-y-3 lg:sticky lg:top-24">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <Smartphone className="size-5 text-primary" aria-hidden /> {t('ewp.preview.title')}
        </h2>
        <div className="relative mx-auto w-full max-w-[16rem] overflow-hidden rounded-[2rem] border-4 border-ink/80 bg-ink shadow-[var(--tv-shadow-raised)]">
          <canvas ref={canvasRef} className="block h-auto w-full" role="img" aria-label={t('ewp.preview.alt')} />
          {/* Lock-screen clock mock-up (preview only, not part of the PNG). */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center justify-center text-white/90 mix-blend-difference" style={{ height: `${CLOCK_SHARE * 100}%` }} aria-hidden>
            <span className="text-[11px] font-semibold">Mo., 16. Nov.</span>
            <span className="font-display text-5xl leading-none font-semibold">9:41</span>
          </div>
        </div>
        <p className="text-center text-[11px] text-muted">
          {t('ewp.preview.clockHint')} · {preset.width}×{preset.height}
        </p>
        {failed && <p className="rounded-2xl border border-danger-border bg-danger-bg p-3 text-sm text-danger-fg">{t('ewp.renderError')}</p>}
        <div className="grid gap-2">
          <button type="button" className="btn-primary min-h-11" onClick={() => void download()} disabled={failed}>
            <Download className="size-4" aria-hidden /> {t('ewp.download')}
          </button>
          {canShare && (
            <button type="button" className="btn-secondary min-h-11" onClick={() => void share()} disabled={failed}>
              <Share2 className="size-4" aria-hidden /> {t('ewp.share')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/** Set-as-wallpaper steps (iPhone / Android) and the emergency numbers explained. */
export const WallpaperHowTo = () => {
  const { t } = useTranslation();
  const list = (key: string) => {
    const v = t(key, { returnObjects: true }) as unknown;
    return Array.isArray(v) ? (v as string[]) : [];
  };
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="rounded-3xl border border-line bg-card p-4 sm:p-5 md:col-span-2">
        <h2 className="font-display text-lg font-semibold text-ink">{t('ewp.howto.title')}</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          {(['ios', 'android'] as const).map((k) => (
            <div key={k}>
              <h3 className="text-sm font-bold text-ink">{t(`ewp.howto.${k}Title`)}</h3>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-muted">
                {list(`ewp.howto.${k}`).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </div>
          ))}
        </div>
        <p className="mt-3 flex items-start gap-2 rounded-2xl bg-sunken p-3 text-sm text-ink">
          <Info className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            <strong>{t('ewp.howto.tipTitle')}:</strong> {t('ewp.howto.tip')}
          </span>
        </p>
      </div>
      <div className="rounded-3xl border border-line bg-card p-4 sm:p-5 md:col-span-2">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
          <Phone className="size-5 text-primary" aria-hidden /> {t('ewp.numbers.title')}
        </h2>
        <ul className="mt-2 space-y-1.5 text-sm text-ink">
          {(['n112', 'n110', 'n116'] as const).map((k) => (
            <li key={k}>{t(`ewp.numbers.${k}`)}</li>
          ))}
        </ul>
      </div>
    </div>
  );
};
