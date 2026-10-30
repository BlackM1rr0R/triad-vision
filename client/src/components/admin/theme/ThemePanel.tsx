import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { CheckCircle2, Palette, RotateCcw, Save, TriangleAlert } from 'lucide-react';
import { api } from '@/lib/api';
import { contrastRatio, deriveTheme, isHex, THEME_DEFAULTS, type SiteTheme, type ThemeIssue, type ThemeVars } from '@/lib/contrast';
import { setSiteTheme } from '@/lib/theme';
import { registerCopy } from '@/i18n';
import { designSystemCopy } from '@/i18n/designSystem';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Field, Input } from '@/components/ui/Field';
import { Checkbox } from '@/components/ui/Field';
import { DensityToggle } from '@/components/ui/DensityToggle';
import { toastError } from '@/components/admin/labels';
import { confirmDialog } from '@/components/ui/ConfirmHost';

registerCopy(designSystemCopy);

type ThemeResponse = { theme: SiteTheme; vars: ThemeVars; adjustments?: ThemeIssue[] };

/** Colour input: native picker + hex text field, kept in sync. */
const ColorField = ({ label, hint, value, onChange, issue }: { label: string; hint: string; value: string; onChange: (v: string) => void; issue?: ThemeIssue }) => {
  const { t } = useTranslation();
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  const valid = isHex(text);
  return (
    <Field label={label} hint={hint} error={!valid ? t('ds.theme.invalid') : undefined}>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isHex(value) ? value : '#000000'}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label}
          className="h-[var(--tv-control-h)] w-12 shrink-0 cursor-pointer rounded-[var(--tv-radius-control)] border border-line-strong bg-field p-1"
        />
        <Input
          value={text}
          maxLength={7}
          spellCheck={false}
          className="code-id max-w-[9rem] uppercase"
          onChange={(e) => {
            const v = e.target.value.trim();
            setText(v);
            if (isHex(v)) onChange(v.toLowerCase());
          }}
        />
        {valid &&
          (issue ? (
            <Badge tone="warning" icon={TriangleAlert}>
              {issue.ratio}:1
            </Badge>
          ) : (
            <Badge tone="success" icon={CheckCircle2}>
              AA
            </Badge>
          ))}
      </div>
      {issue?.adjustedTo && (
        <p className="mt-1.5 flex items-center gap-2 text-xs text-warning-fg">
          <span className="inline-block size-3.5 shrink-0 rounded-sm border border-line" style={{ background: issue.adjustedTo }} aria-hidden />
          {t('ds.theme.contrastFix', { ratio: issue.ratio, min: issue.min, color: issue.adjustedTo.toUpperCase() })}
        </p>
      )}
    </Field>
  );
};

const Segmented = <V extends string>({ label, value, options, onChange }: { label: string; value: V; options: { value: V; label: string }[]; onChange: (v: V) => void }) => (
  <fieldset className="min-w-0">
    <legend className="label">{label}</legend>
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-lg bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-md px-3 py-1.5 text-sm font-medium transition', value === o.value ? 'bg-card text-ink shadow-[var(--tv-shadow-card)]' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  </fieldset>
);

/**
 * System settings → Theme (SUPER_ADMIN): brand primary, accent, radius scale, default table density, with a
 * live preview on both surfaces and the contrast check of lib/contrast.ts (the server re-checks on save).
 */
export const ThemePanel = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ['site-theme'], queryFn: async () => (await api.get<ThemeResponse>('/site/theme')).data });
  const [form, setForm] = useState<SiteTheme>(THEME_DEFAULTS);
  const [strict, setStrict] = useState(false);
  useEffect(() => {
    if (data?.theme) setForm(data.theme);
  }, [data]);

  const valid = isHex(form.brandPrimary) && isHex(form.accent);
  const derived = useMemo(() => (valid ? deriveTheme(form) : null), [form, valid]);
  const issueOf = (f: ThemeIssue['field']) => derived?.issues.find((i) => i.field === f);
  const dirty = !!data && JSON.stringify(data.theme) !== JSON.stringify(form);

  const done = (res: ThemeResponse, msg: string) => {
    setSiteTheme({ theme: res.theme, vars: res.vars });
    qc.setQueryData(['site-theme'], res);
    setForm(res.theme);
    for (const a of res.adjustments ?? []) if (a.adjustedTo) toast.warning(t('ds.theme.adjusted', { field: t(`ds.theme.fields.${a.field}`), color: a.adjustedTo.toUpperCase() }));
    toast.success(msg);
  };
  const save = useMutation({
    mutationFn: async () => (await api.put<ThemeResponse>('/site/theme', { ...form, mode: strict ? 'strict' : 'adjust' })).data,
    onSuccess: (res) => done(res, t('ds.theme.saved')),
    onError: (err) => toastError(err, t('ds.theme.refused')),
  });
  const reset = useMutation({
    mutationFn: async () => (await api.delete<ThemeResponse>('/site/theme')).data,
    onSuccess: (res) => done(res, t('ds.theme.resetDone')),
    onError: (err) => toastError(err),
  });

  const previewStyle = (derived?.vars ?? {}) as CSSProperties;
  const primaryRatio = derived ? contrastRatio('#ffffff', derived.vars['--tv-primary']) : 0;

  return (
    <Card
      title={t('ds.theme.title')}
      subtitle={t('ds.theme.subtitle')}
      icon={Palette}
      padding="lg"
      footer={
        <>
          <Button variant="ghost" icon={RotateCcw} onClick={async () => (await confirmDialog({ message: t('ui.confirmDlg.resetNamed', { name: t('ds.theme.title') }), confirmLabel: t('ui.confirmDlg.reset') })) && reset.mutate()} loading={reset.isPending}>
            {t('ds.theme.reset')}
          </Button>
          <Button icon={Save} onClick={() => save.mutate()} loading={save.isPending} disabled={!valid || !dirty}>
            {t('ds.theme.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-5">
          <ColorField
            label={t('ds.theme.brandPrimary')}
            hint={t('ds.theme.brandPrimaryHint')}
            value={form.brandPrimary}
            issue={issueOf('brandPrimary')}
            onChange={(brandPrimary) => setForm((f) => ({ ...f, brandPrimary }))}
          />
          <ColorField label={t('ds.theme.accent')} hint={t('ds.theme.accentHint')} value={form.accent} issue={issueOf('accent')} onChange={(accent) => setForm((f) => ({ ...f, accent }))} />
          <Segmented
            label={t('ds.theme.radius')}
            value={form.radiusScale}
            onChange={(radiusScale) => setForm((f) => ({ ...f, radiusScale }))}
            options={(['sm', 'md', 'lg'] as const).map((v) => ({ value: v, label: t(`ds.theme.radiusOptions.${v}`) }))}
          />
          <div>
            <Segmented
              label={t('ds.theme.density')}
              value={form.defaultDensity}
              onChange={(defaultDensity) => setForm((f) => ({ ...f, defaultDensity }))}
              options={(['comfortable', 'compact'] as const).map((v) => ({ value: v, label: t(`ds.theme.densityOptions.${v}`) }))}
            />
            <p className="mt-1 text-xs text-muted">{t('ds.theme.densityHint')}</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <span className="text-sm font-medium text-ink">{t('ds.density.label')}</span>
            <DensityToggle variant="segmented" />
          </div>
          <Checkbox checked={strict} onChange={(e) => setStrict(e.target.checked)} label={t('ds.theme.strict')} />
        </div>

        {/* Live preview: both surfaces, with the derived variables applied locally */}
        <div>
          <p className="label">{t('ds.theme.preview')}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['public', 'admin'] as const).map((surface) => (
              <div
                key={surface}
                data-surface={surface}
                data-theme-preview=""
                style={previewStyle}
                className="min-w-0 rounded-xl border border-line bg-canvas p-4 text-ink"
              >
                <p className="type-overline">{t(`ds.page.surfaces.${surface}`)}</p>
                <div className="mt-3 rounded-xl border border-line bg-card p-4 shadow-[var(--tv-shadow-card)]">
                  <span className="badge rounded-full bg-highlight-bg text-highlight-fg">★ {t('ds.theme.accent')}</span>
                  <p className="mt-2 font-display text-lg leading-snug font-semibold">{t('ds.theme.previewTitle')}</p>
                  <p className="mt-1 text-sm text-muted">{t('ds.theme.previewText')}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="btn-primary btn-sm">{t('ds.theme.primaryButton')}</span>
                    <span className="btn-secondary btn-sm">{t('ds.theme.secondaryButton')}</span>
                  </div>
                  <span className="btn btn-sm mt-2 bg-highlight text-highlight-contrast">{t('ds.theme.highlightButton')}</span>
                </div>
              </div>
            ))}
          </div>
          {derived && (
            <p className="mt-2 text-xs text-muted tabular-nums">
              {t('ds.theme.contrastOk', { ratio: primaryRatio.toFixed(2) })} · {derived.vars['--tv-primary'].toUpperCase()} / {derived.vars['--tv-accent'].toUpperCase()}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
};
