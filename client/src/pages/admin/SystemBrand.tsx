import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { BadgeCheck, ImageUp, Mail, Palette, RotateCcw, Save, Languages, Phone } from 'lucide-react';
import { api } from '@/lib/api';
import { sanitizeBrand, setBrand, type Brand } from '@/lib/brand';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesWhitelabel } from '@/i18n/pagesWhitelabel';
import { ErrorBlock, LoadingBlock, PageHead } from '@/components/admin/ui';
import { toastError } from '@/components/admin/labels';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Checkbox, Field, Input, Select, Textarea } from '@/components/ui/Field';
import { ThemePanel } from '@/components/admin/theme/ThemePanel';
import { LogoMark } from '@/components/ui/Logo';

registerCopy(pagesWhitelabel);

const LANGS = ['az', 'de', 'en', 'ru', 'tr', 'uk'] as const;
const TEXT_FIELDS = ['name', 'shortName', 'tagline', 'legalName', 'description', 'footerText', 'supportEmail', 'phone', 'country', 'emailFromName', 'emailFromAddress'] as const;
type TextField = (typeof TEXT_FIELDS)[number];
type ImageKind = 'logoLight' | 'logoDark' | 'icon';

interface BrandSettingDto extends Partial<Record<TextField, string>> {
  languages?: string[];
  defaultLanguage?: string;
  logoLight?: string;
  logoDark?: string;
  iconSet?: string;
}

interface BrandView {
  brand: Brand;
  emailFrom: string;
  setting: BrandSettingDto;
  env: Partial<Record<string, string | string[]>>;
  languages: string[];
}

type Form = Record<TextField, string> & { languages: string[]; defaultLanguage: string };

const toForm = (s: BrandSettingDto): Form => ({
  ...(Object.fromEntries(TEXT_FIELDS.map((k) => [k, s[k] ?? ''])) as Record<TextField, string>),
  languages: s.languages ?? [],
  defaultLanguage: s.defaultLanguage ?? '',
});

/** System → Brand (SUPER_ADMIN): the white-label brand of this instance (server lib/brand). */
export default function SystemBrand() {
  const { t } = useTranslation();
  usePageTitle(t('wl.brand.title'));
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-brand'], queryFn: async () => (await api.get<BrandView>('/admin/brand')).data });
  const [form, setForm] = useState<Form | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (q.data && !form) setForm(toForm(q.data.setting));
  }, [q.data, form]);

  const apply = (view: BrandView) => {
    qc.setQueryData(['admin-brand'], view);
    setForm(toForm(view.setting));
    const b = sanitizeBrand(view.brand);
    if (b) setBrand(b); // the whole app (copy, logo, titles) follows at once
  };

  const save = useMutation({
    mutationFn: async (body: Form) => (await api.put<BrandView>('/admin/brand', body)).data,
    onSuccess: (view) => {
      apply(view);
      toast.success(t('wl.brand.saved'));
    },
    onError: (e) => toastError(e),
  });
  const reset = useMutation({
    mutationFn: async () => (await api.delete<BrandView>('/admin/brand')).data,
    onSuccess: (view) => {
      apply(view);
      setConfirmReset(false);
      toast.success(t('wl.brand.saved'));
    },
    onError: (e) => toastError(e),
  });
  const upload = useMutation({
    mutationFn: async ({ kind, file }: { kind: ImageKind; file: File }) => {
      const fd = new FormData();
      fd.append('file', file);
      return (await api.post<BrandView>(`/admin/brand/images/${kind}`, fd)).data;
    },
    onSuccess: (view) => apply(view),
    onError: (e) => toastError(e),
  });
  const removeImage = useMutation({
    mutationFn: async (kind: ImageKind) => (await api.delete<BrandView>(`/admin/brand/images/${kind}`)).data,
    onSuccess: (view) => apply(view),
    onError: (e) => toastError(e),
  });

  if (q.isError) return <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />;
  if (!q.data || !form) return <LoadingBlock />;
  const { brand, env } = q.data;

  const set = (k: keyof Form, v: string | string[]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const placeholder = (k: TextField) => {
    const fromEnv = env[k];
    const value = typeof fromEnv === 'string' && fromEnv ? fromEnv : ((brand as unknown as Record<string, unknown>)[k] as string | undefined);
    return value ? t('wl.brand.default', { value }) : undefined;
  };
  const text = (k: TextField, label: string, opts: { hint?: string; type?: string; max?: number } = {}) => (
    <Field label={label} hint={opts.hint}>
      <Input value={form[k]} onChange={(e) => set(k, e.target.value)} placeholder={placeholder(k)} type={opts.type ?? 'text'} maxLength={opts.max ?? 200} />
    </Field>
  );
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(form);
  };

  return (
    <div className="stack-page">
      <PageHead
        title={t('wl.brand.title')}
        subtitle={t('wl.brand.intro')}
        actions={
          <Button variant="secondary" icon={RotateCcw} onClick={() => setConfirmReset(true)}>
            {t('wl.brand.reset')}
          </Button>
        }
      />

      <Card title={t('wl.brand.preview')} icon={BadgeCheck}>
        <div className="flex flex-wrap items-center gap-4">
          {brand.logoLight ? <img src={brand.logoLight} alt="" className="h-12 w-auto max-w-[16rem] object-contain" /> : <LogoMark className="h-10 w-11 text-ink" />}
          <div className="min-w-0">
            <p className="font-display text-lg font-extrabold tracking-[0.1em] text-ink">{brand.name.toLocaleUpperCase('en')}</p>
            {brand.tagline && <p className="text-xs font-semibold tracking-[0.2em] text-muted">{brand.tagline.toLocaleUpperCase('en')}</p>}
          </div>
          <span className="ml-auto text-sm text-muted">
            {brand.domain} · {t('wl.brand.currentSender', { from: q.data.emailFrom })}
          </span>
        </div>
      </Card>

      <form onSubmit={onSubmit} className="grid gap-5 lg:grid-cols-2">
        <Card title={t('wl.brand.identity')} icon={BadgeCheck}>
          <div className="grid gap-4">
            {text('name', t('wl.brand.name'), { max: 60 })}
            {text('shortName', t('wl.brand.shortName'), { max: 30 })}
            {text('tagline', t('wl.brand.tagline'), { max: 80 })}
            {text('legalName', t('wl.brand.legalName'), { hint: t('wl.brand.legalNameHint') })}
            <Field label={t('wl.brand.description')}>
              <Textarea rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} placeholder={placeholder('description')} maxLength={300} />
            </Field>
            {text('footerText', t('wl.brand.footerText'), { max: 300 })}
          </div>
        </Card>

        <div className="grid content-start gap-5">
          <Card title={t('wl.brand.contact')} icon={Phone}>
            <div className="grid gap-4">
              {text('supportEmail', t('wl.brand.supportEmail'), { type: 'email' })}
              {text('phone', t('wl.brand.phone'), { max: 40 })}
              {text('country', t('wl.brand.country'), { max: 2 })}
              <p className="text-sm text-muted">{t('wl.brand.contactHint')}</p>
            </div>
          </Card>
          <Card title={t('wl.brand.email')} icon={Mail}>
            <div className="grid gap-4">
              {text('emailFromName', t('wl.brand.emailFromName'), { max: 80 })}
              {text('emailFromAddress', t('wl.brand.emailFromAddress'), { type: 'email', hint: t('wl.brand.emailHint') })}
            </div>
          </Card>
          <Card title={t('wl.brand.languages')} icon={Languages}>
            <fieldset className="grid gap-3">
              <legend className="mb-1 text-sm font-semibold text-ink">{t('wl.brand.languagesLabel')}</legend>
              <div className="flex flex-wrap gap-4">
                {LANGS.map((l) => (
                  <Checkbox
                    key={l}
                    label={l.toUpperCase()}
                    checked={form.languages.length ? form.languages.includes(l) : brand.languages.includes(l)}
                    onChange={(e) => {
                      const base = form.languages.length ? form.languages : brand.languages;
                      set('languages', e.target.checked ? [...new Set([...base, l])] : base.filter((x) => x !== l));
                    }}
                  />
                ))}
              </div>
              <Field label={t('wl.brand.defaultLanguage')}>
                <Select value={form.defaultLanguage} onChange={(e) => set('defaultLanguage', e.target.value)}>
                  <option value="">{t('wl.brand.default', { value: brand.defaultLanguage.toUpperCase() })}</option>
                  {LANGS.map((l) => (
                    <option key={l} value={l}>
                      {l.toUpperCase()}
                    </option>
                  ))}
                </Select>
              </Field>
            </fieldset>
          </Card>
        </div>

        <div className="lg:col-span-2">
          <Button type="submit" icon={Save} loading={save.isPending}>
            {t('wl.brand.save')}
          </Button>
        </div>
      </form>

      <Card title={t('wl.brand.images')} icon={ImageUp} subtitle={t('wl.brand.imageHint')}>
        <div className="grid gap-5 md:grid-cols-3">
          <ImageSlot label={t('wl.brand.logoLight')} url={brand.logoLight} busy={upload.isPending || removeImage.isPending} onUpload={(file) => upload.mutate({ kind: 'logoLight', file })} onRemove={() => removeImage.mutate('logoLight')} />
          <ImageSlot label={t('wl.brand.logoDark')} url={brand.logoDark} dark busy={upload.isPending || removeImage.isPending} onUpload={(file) => upload.mutate({ kind: 'logoDark', file })} onRemove={() => removeImage.mutate('logoDark')} />
          <ImageSlot
            label={t('wl.brand.icon')}
            hint={t('wl.brand.iconHint')}
            url={brand.icons.icon192.startsWith('/uploads/') ? brand.icons.icon192 : ''}
            busy={upload.isPending || removeImage.isPending}
            onUpload={(file) => upload.mutate({ kind: 'icon', file })}
            onRemove={() => removeImage.mutate('icon')}
          />
        </div>
      </Card>

      <section className="grid gap-3" aria-label={t('wl.brand.colours')}>
        <p className="flex items-center gap-2 text-sm text-muted">
          <Palette className="size-4 shrink-0" aria-hidden /> {t('wl.brand.coloursHint')}
        </p>
        <ThemePanel />
      </section>

      <ConfirmDialog open={confirmReset} onClose={() => setConfirmReset(false)} onConfirm={() => reset.mutate()} title={t('wl.brand.reset')} message={t('wl.brand.resetConfirm')} loading={reset.isPending} />
    </div>
  );
}

const ImageSlot = ({ label, hint, url, dark, busy, onUpload, onRemove }: { label: string; hint?: string; url: string; dark?: boolean; busy: boolean; onUpload: (f: File) => void; onRemove: () => void }) => {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="grid content-start gap-2">
      <p className="text-sm font-semibold text-ink">{label}</p>
      <div className={`grid h-28 place-items-center rounded-lg border border-line p-3 ${dark ? 'bg-navy-900' : 'bg-sunken'}`}>
        {url ? <img src={url} alt="" className="max-h-full max-w-full object-contain" /> : <span className={`text-sm ${dark ? 'text-white/70' : 'text-muted'}`}>{t('wl.brand.none')}</span>}
      </div>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = '';
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={ImageUp} loading={busy} onClick={() => input.current?.click()}>
          {t('wl.brand.upload')}
        </Button>
        {url && (
          <Button size="sm" variant="ghost" icon={RotateCcw} disabled={busy} onClick={onRemove}>
            {t('wl.brand.remove')}
          </Button>
        )}
      </div>
    </div>
  );
};
