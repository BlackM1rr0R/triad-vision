import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { ArrowDown, ArrowUp, FileQuestion, ImageOff, LayoutList, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/lib/api';
import type { L10n, L10nList } from '@/lib/types';
import { ICON_NAMES, Icon, hasIcon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { Drawer } from '@/components/admin/Drawer';
import { ImageField } from '@/components/admin/ImageField';
import { L10nInput, L10nListInput, emptyL10n, emptyL10nList, fillFromAz, fillListFromAz, LANGS } from '@/components/admin/L10nInput';
import { fmtDate, toDateInput, toastError } from '@/components/admin/labels';
import { EmptyState, ErrorBlock, LoadingBlock, PageHead, Switch } from '@/components/admin/ui';
import { PostAiTools } from '@/components/aiStaff/PostAiDraft';
import { SEO_RESOURCES, SeoFields, seoFromItem, seoPayload, type SeoValue } from '@/components/admin/SeoFields';

// ─── Config ─────────────────────────────────────────────────────────────

/** Translator bound to the current language (a plain signature keeps the resource table simple). */
type Tr = (key: string, opts?: Record<string, unknown>) => string;

type FieldType = 'text' | 'slug' | 'url' | 'number' | 'boolean' | 'tristate' | 'l10n' | 'l10n-textarea' | 'l10n-list' | 'faq' | 'image' | 'icon' | 'select' | 'date';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  nullable?: boolean;
  hint?: string;
  rows?: number;
  options?: { value: string; label: string }[];
  /** Span both columns in the two-column form grid. */
  wide?: boolean;
  /** Value for new items (overrides the type default). */
  initial?: Value;
  /** Shows a sub-heading above this field to group the fields that follow. */
  group?: string;
  /** Unit shown next to number inputs, e.g. "€" or "həftə". */
  unit?: string;
  /** Maximum length for text / url inputs. */
  maxLength?: number;
}

type FaqItem = { q: L10n; a: L10n };
type Value = string | number | boolean | L10n | L10nList | FaqItem[] | null;
type Values = Record<string, Value>;
type Item = { id: string } & Record<string, unknown>;

interface ResourceDef {
  title: string;
  singular: string;
  description: string;
  fields: FieldDef[];
  sortable: boolean;
  publishable: boolean;
  titleOf: (i: Item) => string;
  subtitleOf?: (i: Item) => string;
  imageKey?: string;
  iconKey?: string;
  /** Cross-field validation run after the per-field checks. */
  check?: (v: Values) => string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isL10n = (v: unknown): v is L10n => isObj(v) && LANGS.every((l) => typeof v[l] === 'string');
const isL10nList = (v: unknown): v is L10nList => isObj(v) && LANGS.every((l) => Array.isArray(v[l]));
const isFaqList = (v: unknown): v is FaqItem[] => Array.isArray(v) && v.every((x) => isObj(x) && isL10n(x.q) && isL10n(x.a));
const str = (v: unknown) => (typeof v === 'string' ? v : '');
/** CMS items are listed by their Azerbaijani (source) text. */
/** List titles in the interface language (falls back to Azerbaijani when that language is empty). */
const l10nAz = (v: unknown) => (isL10n(v) ? (v as unknown as Record<string, string>)[i18n.language.slice(0, 2)] || v.az : '');

const AUDIENCES = ['all', 'company', 'candidate'] as const;
const SECTORS = ['logistics', 'courier', 'industry', 'construction', 'hospitality', 'healthcare', 'agriculture', 'other'] as const;

/** Resource definitions in the current language. Rebuilt when the language changes. */
const buildResources = (t: Tr): Record<string, ResourceDef> => {
  const f = (key: string) => t(`admin.content.f.${key}`);
  const hint = (key: string) => t(`admin.content.hint.${key}`);
  const audience = (key: string) => (AUDIENCES.includes(key as (typeof AUDIENCES)[number]) ? t(`admin.content.audience.${key}`) : '');
  const sector = (key: string) => (SECTORS.includes(key as (typeof SECTORS)[number]) ? t(`admin.content.sector.${key}`) : '');
  const res = (key: string) => ({ title: t(`admin.content.res.${key}.title`), singular: t(`admin.content.res.${key}.singular`), description: t(`admin.content.res.${key}.description`) });
  const PUBLISHED: FieldDef = { key: 'published', label: t('admin.content.published'), type: 'boolean' };
  const audienceOptions = (order: readonly string[]) => order.map((value) => ({ value, label: audience(value) }));

  return {
    services: {
      ...res('services'),
      sortable: true,
      publishable: true,
      imageKey: 'image',
      iconKey: 'icon',
      titleOf: (i) => l10nAz(i.title),
      subtitleOf: (i) => `${audience(str(i.audience))} · /${str(i.slug)}`,
      fields: [
        { key: 'title', label: f('title'), type: 'l10n', required: true, wide: true },
        { key: 'slug', label: f('slug'), type: 'slug', required: true, hint: hint('slugServices') },
        { key: 'audience', label: f('audience'), type: 'select', options: audienceOptions(['all', 'company', 'candidate']) },
        { key: 'icon', label: f('icon'), type: 'icon' },
        { key: 'image', label: f('image'), type: 'image', wide: true },
        { key: 'summary', label: f('summary'), type: 'l10n-textarea', rows: 3, wide: true },
        { key: 'features', label: f('features'), type: 'l10n-list', wide: true },
        { key: 'body', label: f('body'), type: 'l10n-textarea', rows: 8, wide: true, hint: hint('paragraphs') },
        { key: 'steps', label: f('steps'), type: 'l10n-list', nullable: true, wide: true, group: t('admin.content.group.serviceExtra'), hint: hint('steps') },
        { key: 'duration', label: f('duration'), type: 'l10n', nullable: true, wide: true, hint: hint('duration') },
        PUBLISHED,
      ],
    },
    'visa-categories': {
      ...res('visaCategories'),
      sortable: true,
      publishable: true,
      imageKey: 'image',
      iconKey: 'icon',
      titleOf: (i) => l10nAz(i.title),
      subtitleOf: (i) => `${str(i.visaLabel)} · /${str(i.slug)}`,
      fields: [
        { key: 'title', label: f('title'), type: 'l10n', required: true, wide: true },
        { key: 'slug', label: f('slug'), type: 'slug', required: true, hint: hint('slugVisa') },
        { key: 'visaLabel', label: f('visaLabel'), type: 'text', required: true, hint: hint('visaLabel') },
        { key: 'icon', label: f('icon'), type: 'icon' },
        { key: 'image', label: f('image'), type: 'image', wide: true },
        { key: 'summary', label: f('summary'), type: 'l10n-textarea', rows: 3, wide: true },
        { key: 'items', label: f('items'), type: 'l10n-list', wide: true },
        { key: 'body', label: f('body'), type: 'l10n-textarea', rows: 8, wide: true },
        { key: 'germanLevel', label: f('germanLevel'), type: 'text', nullable: true, maxLength: 10, group: t('admin.content.group.visaKey'), hint: hint('germanLevel') },
        {
          key: 'familyReunion',
          label: f('familyReunion'),
          type: 'tristate',
          options: [
            { value: 'true', label: t('admin.content.opt.possible') },
            { value: 'false', label: t('admin.content.opt.notPlanned') },
            { value: '', label: t('admin.content.opt.depends') },
          ],
        },
        { key: 'salaryMin', label: f('salaryMin'), type: 'number', nullable: true, unit: t('admin.content.unit.perMonth'), hint: hint('salaryMin') },
        { key: 'salaryMax', label: f('salaryMax'), type: 'number', nullable: true, unit: t('admin.content.unit.perMonth') },
        { key: 'processingMin', label: f('processingMin'), type: 'number', nullable: true, unit: t('admin.content.unit.weeks') },
        { key: 'processingMax', label: f('processingMax'), type: 'number', nullable: true, unit: t('admin.content.unit.weeks') },
        { key: 'requirements', label: f('requirements'), type: 'l10n-list', nullable: true, wide: true, group: t('admin.content.group.visaSections') },
        { key: 'documents', label: f('documents'), type: 'l10n-list', nullable: true, wide: true },
        { key: 'faq', label: f('faq'), type: 'faq', wide: true },
        PUBLISHED,
      ],
      check: (v) => {
        const pair = (a: string, b: string, name: string) => {
          const lo = v[a];
          const hi = v[b];
          if ((lo === null) !== (hi === null)) return t('admin.content.check.pairBoth', { name });
          if (typeof lo === 'number' && typeof hi === 'number' && lo > hi) return t('admin.content.check.pairOrder', { name });
          return null;
        };
        return pair('salaryMin', 'salaryMax', t('admin.content.check.salary')) ?? pair('processingMin', 'processingMax', t('admin.content.check.processing'));
      },
    },
    partners: {
      ...res('partners'),
      sortable: true,
      publishable: true,
      imageKey: 'logo',
      titleOf: (i) => str(i.name),
      subtitleOf: (i) => [sector(str(i.sector)), str(i.city), str(i.website)].filter(Boolean).join(' · '),
      fields: [
        { key: 'name', label: f('name'), type: 'text', required: true },
        { key: 'website', label: f('website'), type: 'url', nullable: true },
        { key: 'logo', label: f('logo'), type: 'image', nullable: true, wide: true },
        {
          key: 'sector',
          label: f('sector'),
          type: 'select',
          nullable: true,
          options: [{ value: '', label: t('admin.content.opt.notSelected') }, ...SECTORS.map((value) => ({ value, label: sector(value) }))],
        },
        { key: 'city', label: f('city'), type: 'text', nullable: true, hint: hint('city') },
        { key: 'description', label: f('description'), type: 'l10n-textarea', nullable: true, rows: 3, wide: true },
        { key: 'featured', label: f('featured'), type: 'boolean', initial: false },
        PUBLISHED,
      ],
    },
    'visa-samples': {
      ...res('visaSamples'),
      sortable: true,
      publishable: true,
      imageKey: 'image',
      titleOf: (i) => l10nAz(i.profession),
      subtitleOf: (i) => `${str(i.visaLabel)} · ${l10nAz(i.dateLabel)}`,
      fields: [
        { key: 'image', label: f('image'), type: 'image', required: true, wide: true },
        { key: 'profession', label: f('profession'), type: 'l10n', required: true, wide: true },
        { key: 'visaLabel', label: f('visaLabel'), type: 'text' },
        { key: 'dateLabel', label: f('dateLabel'), type: 'l10n', hint: hint('dateLabel') },
        PUBLISHED,
      ],
    },
    testimonials: {
      ...res('testimonials'),
      sortable: true,
      publishable: true,
      titleOf: (i) => l10nAz(i.author),
      subtitleOf: (i) => l10nAz(i.quote),
      fields: [
        { key: 'quote', label: f('quote'), type: 'l10n-textarea', required: true, rows: 4, wide: true },
        { key: 'author', label: f('author'), type: 'l10n', required: true },
        { key: 'role', label: f('role'), type: 'l10n' },
        {
          key: 'kind',
          label: f('kind'),
          type: 'select',
          options: [
            { value: 'candidate', label: t('admin.content.opt.candidate') },
            { value: 'company', label: t('admin.content.opt.company') },
          ],
        },
        PUBLISHED,
      ],
    },
    stats: {
      ...res('stats'),
      sortable: true,
      publishable: false,
      iconKey: 'icon',
      titleOf: (i) => `${str(i.prefix)}${typeof i.value === 'number' ? i.value : ''}${str(i.suffix)}`,
      subtitleOf: (i) => l10nAz(i.label),
      fields: [
        { key: 'label', label: f('label'), type: 'l10n', required: true, wide: true },
        { key: 'value', label: f('value'), type: 'number', required: true },
        { key: 'icon', label: f('icon'), type: 'icon' },
        { key: 'prefix', label: f('prefix'), type: 'text', hint: hint('prefix') },
        { key: 'suffix', label: f('suffix'), type: 'text', hint: hint('suffix') },
      ],
    },
    faqs: {
      ...res('faqs'),
      sortable: true,
      publishable: true,
      titleOf: (i) => l10nAz(i.question),
      subtitleOf: (i) => audience(str(i.audience)),
      fields: [
        { key: 'question', label: f('question'), type: 'l10n', required: true, wide: true },
        { key: 'answer', label: f('answer'), type: 'l10n-textarea', required: true, rows: 5, wide: true },
        { key: 'audience', label: f('audience'), type: 'select', options: audienceOptions(['all', 'candidate', 'company']) },
        PUBLISHED,
      ],
    },
    posts: {
      ...res('posts'),
      sortable: false,
      publishable: true,
      imageKey: 'cover',
      titleOf: (i) => l10nAz(i.title),
      subtitleOf: (i) => `${fmtDate(str(i.publishedAt))} · /${str(i.slug)}`,
      fields: [
        { key: 'title', label: f('title'), type: 'l10n', required: true, wide: true },
        { key: 'slug', label: f('slug'), type: 'slug', required: true, hint: hint('slugPost') },
        { key: 'publishedAt', label: f('publishedAt'), type: 'date', required: true },
        { key: 'cover', label: f('cover'), type: 'image', wide: true },
        { key: 'excerpt', label: f('excerpt'), type: 'l10n-textarea', rows: 3, wide: true },
        { key: 'body', label: f('text'), type: 'l10n-textarea', rows: 12, wide: true, hint: hint('paragraphs') },
        PUBLISHED,
      ],
    },
  };
};

// ─── Value conversion ───────────────────────────────────────────────────

const defaultValue = (f: FieldDef): Value => {
  if (f.initial !== undefined) return f.initial;
  switch (f.type) {
    case 'number':
      return f.nullable ? null : 0;
    case 'boolean':
      return true;
    case 'tristate':
      return null;
    case 'faq':
      return [];
    case 'l10n':
    case 'l10n-textarea':
      return emptyL10n();
    case 'l10n-list':
      return emptyL10nList();
    case 'icon':
      return 'Briefcase';
    case 'select':
      return f.options?.[0]?.value ?? '';
    case 'date':
      return toDateInput(new Date().toISOString());
    default:
      return '';
  }
};

const toValues = (def: ResourceDef, item: Item | null): Values => {
  const out: Values = {};
  for (const f of def.fields) {
    const raw = item?.[f.key];
    switch (f.type) {
      case 'number':
        out[f.key] = typeof raw === 'number' ? raw : item && f.nullable ? null : defaultValue(f);
        break;
      case 'boolean':
        out[f.key] = typeof raw === 'boolean' ? raw : defaultValue(f);
        break;
      case 'tristate':
        out[f.key] = typeof raw === 'boolean' ? raw : null;
        break;
      case 'faq':
        out[f.key] = isFaqList(raw) ? raw.map((x) => ({ q: { ...x.q }, a: { ...x.a } })) : [];
        break;
      case 'l10n':
      case 'l10n-textarea':
        out[f.key] = isL10n(raw) ? { ...raw } : defaultValue(f);
        break;
      case 'l10n-list':
        out[f.key] = isL10nList(raw)
          ? {
              az: [...raw.az],
              de: [...raw.de],
              en: [...raw.en],
              ru: [...raw.ru],
            }
          : defaultValue(f);
        break;
      case 'date':
        out[f.key] = typeof raw === 'string' ? toDateInput(raw) : defaultValue(f);
        break;
      default:
        out[f.key] = typeof raw === 'string' ? raw : item ? '' : defaultValue(f);
    }
  }
  return out;
};

const SLUG_RE = /^[a-z0-9-]+$/;
/** Absolute http(s) URL or a site-relative path; empty is allowed (nullable fields). */
const URL_RE = /^(https?:\/\/\S+|\/\S*)$|^$/;

const validate = (def: ResourceDef, v: Values, t: Tr): string | null => {
  const msg = (key: string, opts: Record<string, unknown>) => t(`admin.content.check.${key}`, opts);
  for (const f of def.fields) {
    const val = v[f.key];
    if (f.type === 'slug' && (typeof val !== 'string' || !SLUG_RE.test(val))) return msg('invalid', { label: f.label });
    if (f.type === 'url' && typeof val === 'string' && !URL_RE.test(val.trim())) return msg('invalidUrl', { label: f.label });
    if (f.type === 'number' && f.nullable && typeof val === 'number' && val < 0) return msg('negative', { label: f.label });
    if (f.type === 'faq' && isFaqList(val)) {
      const bad = val.findIndex((x) => !x.q.az.trim() || !x.a.az.trim());
      if (bad >= 0) return msg('faqAz', { label: f.label, n: bad + 1 });
    }
    if (!f.required) continue;
    if ((f.type === 'l10n' || f.type === 'l10n-textarea') && !(isL10n(val) && val.az.trim())) return msg('requiredAz', { label: f.label });
    if ((f.type === 'text' || f.type === 'image' || f.type === 'date') && !(typeof val === 'string' && val.trim())) return msg('required', { label: f.label });
    if (f.type === 'number' && !(typeof val === 'number' && Number.isInteger(val))) return msg('integer', { label: f.label });
  }
  return def.check?.(v) ?? null;
};

const toPayload = (def: ResourceDef, v: Values) => {
  const out: Record<string, unknown> = {};
  for (const f of def.fields) {
    const val = v[f.key];
    switch (f.type) {
      case 'number':
        out[f.key] = typeof val === 'number' ? Math.round(val) : f.nullable ? null : 0;
        break;
      case 'boolean':
        out[f.key] = val === true;
        break;
      case 'tristate':
        out[f.key] = typeof val === 'boolean' ? val : null;
        break;
      case 'faq':
        out[f.key] = isFaqList(val) && val.length ? val.map((x) => ({ q: fillFromAz(x.q), a: fillFromAz(x.a) })) : null;
        break;
      case 'l10n':
      case 'l10n-textarea': {
        const l = isL10n(val) ? val : emptyL10n();
        out[f.key] = f.nullable && !l.az.trim() ? null : fillFromAz(l);
        break;
      }
      case 'l10n-list': {
        const l = isL10nList(val) ? val : emptyL10nList();
        out[f.key] = f.nullable && !l.az.length ? null : fillListFromAz(l);
        break;
      }
      case 'date':
        out[f.key] = typeof val === 'string' && val ? new Date(`${val}T09:00:00`).toISOString() : new Date().toISOString();
        break;
      default: {
        const s = typeof val === 'string' ? val.trim() : '';
        out[f.key] = f.nullable && !s ? null : s;
      }
    }
  }
  return out;
};

// ─── Form fields ────────────────────────────────────────────────────────

const IconField = ({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) => {
  const { t } = useTranslation();
  const valid = hasIcon(value);
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="flex gap-2">
        <span
          className={clsx(
            'grid size-[42px] shrink-0 place-items-center rounded-lg border',
            valid ? 'border-line bg-brand-50 text-brand-700' : 'border-amber-300 bg-amber-50 text-amber-600',
          )}
          aria-hidden
        >
          <Icon name={value} className="size-5" />
        </span>
        <input id={id} className="input font-mono text-[13px]" value={value} list={`${id}-list`} onChange={(e) => onChange(e.target.value.trim())} />
        <datalist id={`${id}-list`}>
          {ICON_NAMES.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </div>
      <p className={clsx('mt-1 text-[11px]', valid ? 'text-muted' : 'text-amber-700')}>
        {valid ? t('admin.content.icon.pick', { count: ICON_NAMES.length }) : t('admin.content.icon.unknown')}
      </p>
    </div>
  );
};

/** Ordered list of question/answer pairs, each in four languages. */
const FaqListInput = ({ label, value, onChange }: { label: string; value: FaqItem[]; onChange: (v: FaqItem[]) => void }) => {
  const { t } = useTranslation();
  // Stable keys so the language tabs of an item stay with it when items are reordered.
  const ids = useRef<number[]>(value.map((_, i) => i));
  const next = useRef(value.length);
  if (ids.current.length !== value.length) ids.current = value.map((_, i) => ids.current[i] ?? next.current++);

  const update = (i: number, patch: Partial<FaqItem>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const remove = (i: number) => {
    ids.current = ids.current.filter((_, j) => j !== i);
    onChange(value.filter((_, j) => j !== i));
  };
  const move = (i: number, dir: -1 | 1) => {
    const target = i + dir;
    if (target < 0 || target >= value.length) return;
    const v = [...value];
    [v[i], v[target]] = [v[target], v[i]];
    const k = [...ids.current];
    [k[i], k[target]] = [k[target], k[i]];
    ids.current = k;
    onChange(v);
  };
  const add = () => {
    ids.current = [...ids.current, next.current++];
    onChange([...value, { q: emptyL10n(), a: emptyL10n() }]);
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-ink/80">{label}</span>
        <span className="text-[11px] text-muted">{t('admin.content.faq.count', { count: value.length })}</span>
      </div>
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-5 text-center text-xs text-muted">{t('admin.content.faq.empty')}</p>
      ) : (
        <ol className="space-y-3">
          {value.map((item, i) => (
            <li key={ids.current[i]} className="rounded-xl border border-line bg-surface/60 p-3 sm:p-4">
              <div className="mb-2 flex items-center gap-1">
                <span className="mr-auto text-xs font-bold text-navy-900">{t('admin.content.faq.questionN', { n: i + 1 })}</span>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-md text-muted hover:bg-white hover:text-navy-900 disabled:opacity-25"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={t('admin.content.faq.moveUp', { n: i + 1 })}
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-md text-muted hover:bg-white hover:text-navy-900 disabled:opacity-25"
                  onClick={() => move(i, 1)}
                  disabled={i === value.length - 1}
                  aria-label={t('admin.content.faq.moveDown', { n: i + 1 })}
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  className="grid size-8 place-items-center rounded-md text-muted hover:bg-red-50 hover:text-danger"
                  onClick={() => remove(i)}
                  aria-label={t('admin.content.faq.remove', { n: i + 1 })}
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="grid gap-3">
                <L10nInput label={t('admin.content.f.question')} value={item.q} onChange={(q) => update(i, { q })} required />
                <L10nInput label={t('admin.content.f.answer')} value={item.a} onChange={(a) => update(i, { a })} multiline rows={3} required />
              </div>
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn-white btn-sm mt-3 border border-line" onClick={add} disabled={value.length >= 30}>
        <Plus className="size-3.5" /> {t('admin.content.faq.addQuestion')}
      </button>
    </div>
  );
};

const FieldInput = ({ f, value, onChange }: { f: FieldDef; value: Value; onChange: (v: Value) => void }) => {
  const id = `cf-${f.key}`;
  const labelEl: ReactNode = (
    <label htmlFor={id} className="label">
      {f.label}
      {f.required && <span className="text-danger"> *</span>}
    </label>
  );
  const hint = f.hint && <p className="mt-1 text-[11px] text-muted">{f.hint}</p>;

  switch (f.type) {
    case 'l10n':
    case 'l10n-textarea':
      return (
        <L10nInput
          label={f.label}
          value={isL10n(value) ? value : emptyL10n()}
          onChange={onChange}
          multiline={f.type === 'l10n-textarea'}
          rows={f.rows}
          required={f.required}
          hint={f.hint}
        />
      );
    case 'l10n-list':
      return (
        <div>
          <L10nListInput label={f.label} value={isL10nList(value) ? value : emptyL10nList()} onChange={onChange} />
          {hint}
        </div>
      );
    case 'faq':
      return <FaqListInput label={f.label} value={isFaqList(value) ? value : []} onChange={onChange} />;
    case 'tristate': {
      const cur = value === true ? 'true' : value === false ? 'false' : '';
      return (
        <div>
          {labelEl}
          <select id={id} className="input" value={cur} onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')}>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hint}
        </div>
      );
    }
    case 'image':
      return <ImageField label={f.label} value={typeof value === 'string' ? value : ''} onChange={onChange} required={f.required} />;
    case 'icon':
      return <IconField id={id} label={f.label} value={typeof value === 'string' ? value : ''} onChange={onChange} />;
    case 'boolean':
      return (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-line px-3.5 py-2.5 text-sm font-medium">
          <Switch checked={value === true} onChange={onChange} label={f.label} />
          {f.label}
        </label>
      );
    case 'number':
      return (
        <div>
          {labelEl}
          <div className="relative">
            <input
              id={id}
              type="number"
              step={1}
              min={f.nullable ? 0 : undefined}
              className={clsx('input tabular-nums', f.unit && 'pr-16')}
              value={typeof value === 'number' ? value : f.nullable ? '' : 0}
              placeholder={f.nullable ? '—' : undefined}
              onChange={(e) => onChange(e.target.value === '' ? (f.nullable ? null : 0) : Math.trunc(Number(e.target.value)))}
            />
            {f.unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted">{f.unit}</span>}
          </div>
          {hint}
        </div>
      );
    case 'select':
      return (
        <div>
          {labelEl}
          <select id={id} className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)}>
            {f.options?.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {hint}
        </div>
      );
    case 'date':
      return (
        <div>
          {labelEl}
          <input id={id} type="date" className="input" value={typeof value === 'string' ? value : ''} onChange={(e) => onChange(e.target.value)} />
          {hint}
        </div>
      );
    default: {
      const s = typeof value === 'string' ? value : '';
      const bad = (f.type === 'slug' && s !== '' && !SLUG_RE.test(s)) || (f.type === 'url' && !URL_RE.test(s.trim()));
      return (
        <div>
          {labelEl}
          <input
            id={id}
            type={f.type === 'url' ? 'url' : 'text'}
            className={clsx('input', f.type === 'slug' && 'font-mono text-[13px]', bad && 'border-danger')}
            value={s}
            required={f.required}
            placeholder={f.type === 'url' ? 'https://' : undefined}
            maxLength={f.maxLength}
            aria-invalid={bad || undefined}
            onChange={(e) => onChange(f.type === 'slug' ? e.target.value.toLowerCase().replace(/\s+/g, '-') : e.target.value)}
          />
          {hint}
        </div>
      );
    }
  }
};

// ─── Page ───────────────────────────────────────────────────────────────

export default function ContentManager() {
  const { resource = '' } = useParams();
  // Re-mount per resource so editor state never leaks between sections.
  return <ResourcePage key={resource} resource={resource} />;
}

function ResourcePage({ resource }: { resource: string }) {
  const { t } = useTranslation();
  const tr = useMemo<Tr>(() => (key, opts) => String(t(key, opts)), [t]);
  const RESOURCES = useMemo(() => buildResources(tr), [tr]);
  const def = RESOURCES[resource];
  const qc = useQueryClient();
  const key = ['admin-content', resource] as const;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ items: Item[] }>(`/admin/content/${resource}`)).data.items,
    enabled: !!def,
  });

  const [editing, setEditing] = useState<Item | 'new' | null>(null);
  const [values, setValues] = useState<Values>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<Item | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // SEO overrides (posts, services, visa categories): kept apart from the generic field table.
  const [seo, setSeo] = useState<SeoValue>(() => seoFromItem(null));
  const hasSeo = SEO_RESOURCES.has(resource);

  const items = useMemo(() => {
    const list = data ?? [];
    return def?.sortable ? [...list].sort((a, b) => Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0)) : list;
  }, [data, def]);

  if (!def) {
    return (
      <div className="rounded-xl border border-line bg-white">
        <EmptyState icon={FileQuestion} title={t('admin.content.unknown')}>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            {Object.entries(RESOURCES).map(([k, r]) => (
              <Link key={k} to={`/admin/content/${k}`} className="text-brand-600 hover:underline">
                {r.title}
              </Link>
            ))}
          </div>
        </EmptyState>
      </div>
    );
  }

  const invalidate = () => Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: ['content'] })]);

  const openEditor = (item: Item | 'new') => {
    setValues(toValues(def, item === 'new' ? null : item));
    setSeo(seoFromItem(item === 'new' ? null : item));
    setEditing(item);
  };

  const save = async () => {
    const problem = validate(def, values, tr);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(def, values);
      if (hasSeo) Object.assign(payload, seoPayload(seo));
      if (editing === 'new') {
        if (def.sortable) payload.sortOrder = items.reduce((m, i) => Math.max(m, Number(i.sortOrder ?? 0)), -1) + 1;
        await api.post(`/admin/content/${resource}`, payload);
        toast.success(t('admin.content.added'));
      } else if (editing) {
        await api.put(`/admin/content/${resource}/${editing.id}`, payload);
        toast.success(t('admin.content.saved'));
      }
      await invalidate();
      setEditing(null);
    } catch (err) {
      toastError(err, t('admin.content.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await api.delete(`/admin/content/${resource}/${deleting.id}`);
      await invalidate();
      toast.success(t('admin.content.deleted'));
      setDeleting(null);
    } catch (err) {
      toastError(err);
    } finally {
      setDeleteBusy(false);
    }
  };

  const togglePublished = async (item: Item, published: boolean) => {
    setBusyId(item.id);
    qc.setQueryData<Item[]>(key, (old) => old?.map((i) => (i.id === item.id ? { ...i, published } : i)));
    try {
      await api.put(`/admin/content/${resource}/${item.id}`, { published });
      toast.success(published ? t('admin.content.publishedToast') : t('admin.content.hiddenToast'));
    } catch (err) {
      toastError(err);
    } finally {
      setBusyId(null);
      await invalidate();
    }
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    const changed = next.map((it, i) => ({ it, i })).filter(({ it, i }) => Number(it.sortOrder ?? 0) !== i);
    qc.setQueryData<Item[]>(
      key,
      next.map((it, i) => ({ ...it, sortOrder: i })),
    );
    setBusyId(items[index].id);
    try {
      await Promise.all(changed.map(({ it, i }) => api.put(`/admin/content/${resource}/${it.id}`, { sortOrder: i })));
    } catch (err) {
      toastError(err, t('admin.content.orderFailed'));
    } finally {
      setBusyId(null);
      await invalidate();
    }
  };

  const editingTitle = editing === 'new' ? t('admin.content.newItem', { singular: def.singular }) : editing ? def.titleOf(editing) || t('admin.content.editTitle') : '';

  return (
    <div>
      <PageHead
        title={def.title}
        subtitle={def.description}
        actions={
          <>
            {resource === 'posts' && (
              <PostAiTools
                onCreated={(post) => {
                  void invalidate();
                  openEditor(post as unknown as Item);
                }}
              />
            )}
            <button type="button" className="btn-primary btn-sm" onClick={() => openEditor('new')}>
              <Plus className="size-3.5" /> {t('admin.common.add')}
            </button>
          </>
        }
      />

      {isLoading ? (
        <LoadingBlock />
      ) : error ? (
        <ErrorBlock error={error} onRetry={() => refetch()} />
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-line bg-white">
          <EmptyState icon={LayoutList} title={t('admin.content.empty')}>
            <button type="button" className="btn-primary btn-sm mt-3" onClick={() => openEditor('new')}>
              <Plus className="size-3.5" /> {t('admin.content.addFirst')}
            </button>
          </EmptyState>
        </div>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
          <AnimatePresence initial={false}>
            {items.map((item, index) => {
              const img = def.imageKey ? str(item[def.imageKey]) : '';
              const iconName = def.iconKey ? str(item[def.iconKey]) : '';
              const published = item.published === true;
              return (
                <motion.li
                  key={item.id}
                  layout
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className={clsx('flex items-center gap-2 bg-white px-2 py-2.5 sm:gap-3 sm:px-4', def.publishable && !published && 'bg-slate-50/80')}
                >
                  {def.sortable && (
                    <div className="flex shrink-0 flex-col">
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface hover:text-navy-900 disabled:opacity-25 sm:size-7"
                        onClick={() => move(index, -1)}
                        disabled={index === 0 || !!busyId}
                        aria-label={t('admin.common.up')}
                      >
                        <ArrowUp className="size-3.5" />
                      </button>
                      <button
                        type="button"
                        className="grid size-8 place-items-center rounded-md text-muted hover:bg-surface hover:text-navy-900 disabled:opacity-25 sm:size-7"
                        onClick={() => move(index, 1)}
                        disabled={index === items.length - 1 || !!busyId}
                        aria-label={t('admin.common.down')}
                      >
                        <ArrowDown className="size-3.5" />
                      </button>
                    </div>
                  )}
                  {(def.imageKey || def.iconKey) && (
                    <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg border border-line bg-surface">
                      {img ? (
                        <img src={img} alt="" className="size-full object-cover" loading="lazy" />
                      ) : iconName ? (
                        <Icon name={iconName} className="size-5 text-brand-600" />
                      ) : (
                        <ImageOff className="size-4 text-muted/60" aria-hidden />
                      )}
                    </div>
                  )}
                  <button type="button" className="min-w-0 flex-1 py-1 text-left" onClick={() => openEditor(item)}>
                    <p className="flex min-w-0 items-center gap-1.5 text-sm font-semibold text-navy-900">
                      <span className="truncate">{def.titleOf(item) || '—'}</span>
                      {def.publishable && !published && <span className="badge shrink-0 bg-neutral-bg text-[10px] text-neutral-fg sm:hidden">{t('admin.content.hiddenBadge')}</span>}
                    </p>
                    {def.subtitleOf && <p className="truncate text-xs text-muted">{def.subtitleOf(item)}</p>}
                  </button>
                  {def.publishable && (
                    <span className="hidden shrink-0 items-center gap-2 sm:flex">
                      <span className={clsx('text-[11px] whitespace-nowrap', published ? 'text-success' : 'text-muted')}>
                        {published ? t('admin.content.publishedState') : t('admin.content.hiddenBadge')}
                      </span>
                      <Switch
                        checked={published}
                        disabled={busyId === item.id}
                        onChange={(v) => togglePublished(item, v)}
                        label={published ? t('admin.content.hide') : t('admin.content.publish')}
                      />
                    </span>
                  )}
                  {busyId === item.id && <Spinner className="size-3.5 text-brand-600" />}
                  <div className="flex shrink-0 items-center">
                    <button
                      type="button"
                      className="grid size-10 place-items-center rounded-lg text-muted hover:bg-brand-50 hover:text-brand-700 lg:size-9"
                      onClick={() => openEditor(item)}
                      aria-label={t('admin.common.edit')}
                      title={t('admin.common.edit')}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="grid size-10 place-items-center rounded-lg text-muted hover:bg-red-50 hover:text-danger lg:size-9"
                      onClick={() => setDeleting(item)}
                      aria-label={t('admin.common.delete')}
                      title={t('admin.common.delete')}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}

      <Drawer
        open={!!editing}
        onClose={() => !saving && setEditing(null)}
        title={editingTitle}
        footer={
          <>
            <button type="button" className="btn-secondary btn-sm" onClick={() => setEditing(null)} disabled={saving}>
              {t('admin.common.cancel')}
            </button>
            <button type="submit" form="content-form" className="btn-primary btn-sm" disabled={saving}>
              {saving && <Spinner className="size-3.5" />} {t('admin.common.save')}
            </button>
          </>
        }
      >
        <form
          id="content-form"
          key={editing === 'new' ? 'new' : editing?.id}
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
          noValidate
        >
          {def.fields.map((f) => (
            <Fragment key={f.key}>
              {f.group && <h3 className="mt-3 border-t border-line pt-5 text-xs font-bold tracking-wider text-navy-900 uppercase sm:col-span-2">{f.group}</h3>}
              <div className={clsx((f.wide || f.type === 'boolean') && 'sm:col-span-2')}>
                <FieldInput f={f} value={values[f.key] ?? null} onChange={(v) => setValues((prev) => ({ ...prev, [f.key]: v }))} />
              </div>
            </Fragment>
          ))}
          {hasSeo && (
            <SeoFields
              resource={resource}
              value={seo}
              onChange={setSeo}
              fallbackTitle={(values.title as Record<string, string> | null) ?? {}}
              fallbackDescription={((values.summary ?? values.excerpt) as Record<string, string> | null) ?? {}}
              slug={typeof values.slug === 'string' ? values.slug : ''}
            />
          )}
          <p className="text-[11px] text-muted sm:col-span-2">{t('admin.content.fallbackNote')}</p>
        </form>
      </Drawer>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        loading={deleteBusy}
        title={t('admin.content.deleteTitle')}
        message={deleting ? t('admin.content.deleteMsg', { name: def.titleOf(deleting) || def.singular }) : undefined}
        confirmLabel={t('admin.common.delete')}
      />
    </div>
  );
}
