import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Bell, Download, FileText, FolderOpen, Inbox, MoreHorizontal, Pencil, Plus, Search, Settings, Trash2, Users, Wallet } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { designSystemCopy } from '@/i18n/designSystem';
import { setPrefs, useResolvedTheme } from '@/lib/prefs';
import { contrastRatio, rgbToHex } from '@/lib/contrast';
import {
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  IconButton,
  Input,
  Menu,
  Modal,
  PageHeader,
  Pagination,
  RadioGroup,
  Select,
  Skeleton,
  SkeletonText,
  Spinner,
  StatTile,
  StatusPill,
  Switch,
  Table,
  Tabs,
  Textarea,
  Tooltip,
  type BadgeTone,
  type SortState,
} from '@/components/ui';
import { DensityToggle } from '@/components/ui/DensityToggle';

registerCopy(designSystemCopy);

type Surface = 'admin' | 'public';

// ─── colour probing ──────────────────────────────────────────────────────

type Rgba = [number, number, number, number];
const parseRgba = (v: string): Rgba | null => {
  const m = v.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  return [Number(m[1]), Number(m[2]), Number(m[3]), a];
};
const over = (top: Rgba, base: Rgba): Rgba => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1) as Rgba;
const hexOf = (c: Rgba) => rgbToHex([c[0], c[1], c[2]]);

/** Reads the computed colour of a token inside `root` (as a solid hex, translucent values composited on card). */
const useTokenColors = (root: RefObject<HTMLElement | null>, tokens: string[], deps: unknown[]) => {
  const [colors, setColors] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const probe = document.createElement('span');
    el.appendChild(probe);
    const read = (token: string) => {
      probe.style.backgroundColor = `var(--color-${token})`;
      return parseRgba(getComputedStyle(probe).backgroundColor);
    };
    const card = read('card') ?? [255, 255, 255, 1];
    const out: Record<string, string> = {};
    for (const t of tokens) {
      const c = read(t);
      if (c) out[t] = hexOf(c[3] < 1 ? over(c, card) : c);
    }
    probe.remove();
    setColors(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return colors;
};

// ─── page bits ───────────────────────────────────────────────────────────

const Section = ({ id, title, children, className }: { id: string; title: string; children: ReactNode; className?: string }) => (
  <section id={id} aria-labelledby={`${id}-h`} className={clsx('scroll-mt-24 border-t border-line pt-8 first:border-t-0 first:pt-0', className)}>
    <h2 id={`${id}-h`} className="type-section-title mb-4">
      {title}
    </h2>
    {children}
  </section>
);

const Ratio = ({ fg, bg, min = 4.5 }: { fg?: string; bg?: string; min?: number }) => {
  if (!fg || !bg) return null;
  const r = contrastRatio(fg, bg);
  return (
    <span className={clsx('num text-[11px] font-medium', r >= min ? 'text-success-fg' : 'text-danger-fg')} title={`≥ ${min}:1`}>
      {r.toFixed(2)}:1
    </span>
  );
};

const Swatch = ({ token, hex, note, children }: { token: string; hex?: string; note?: ReactNode; children?: ReactNode }) => (
  <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-card">
    <div className="h-14 border-b border-line" style={{ background: `var(--color-${token})` }} />
    <div className="space-y-0.5 p-2.5">
      <p className="code-id truncate text-xs font-medium text-ink">{token}</p>
      <p className="code-id text-[11px] text-muted uppercase">{hex ?? '—'}</p>
      {note && <p className="text-[11px] leading-snug text-muted">{note}</p>}
      {children}
    </div>
  </div>
);

const SURFACE_TOKENS = ['canvas', 'sunken', 'card', 'raised', 'field', 'line', 'line-strong'];
const TEXT_TOKENS = ['ink', 'muted', 'subtle', 'link', 'highlight-fg'];
const ACTION_TOKENS = ['primary', 'primary-hover', 'primary-contrast', 'highlight', 'highlight-contrast', 'focus'];
const TONES = ['success', 'warning', 'danger', 'info', 'neutral', 'accent'] as const;
const CHARTS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `chart-${n}`);

type Row = { id: string; number: string; client: string; status: string; amount: number; due: string };
const ROWS: Row[] = [
  { id: '1', number: 'INV-2026-0142', client: 'Leyla Məmmədova', status: 'PAID', amount: 1250, due: '2026-10-02' },
  { id: '2', number: 'INV-2026-0143', client: 'Orxan Əliyev', status: 'SENT', amount: 980.5, due: '2026-10-18' },
  { id: '3', number: 'INV-2026-0144', client: 'Günay Həsənova', status: 'OVERDUE', amount: 2400, due: '2026-09-30' },
  { id: '4', number: 'INV-2026-0145', client: 'Kamran Quliyev', status: 'DRAFT', amount: 310, due: '2026-11-05' },
];

const Illustration = () => (
  <svg viewBox="0 0 120 80" className="h-auto w-full" fill="none" aria-hidden>
    <rect x="18" y="14" width="84" height="56" rx="10" className="fill-sunken stroke-line-strong" strokeWidth="1.5" />
    <rect x="30" y="28" width="40" height="6" rx="3" className="fill-line-strong" />
    <rect x="30" y="40" width="60" height="5" rx="2.5" className="fill-line" />
    <rect x="30" y="50" width="48" height="5" rx="2.5" className="fill-line" />
    <circle cx="92" cy="18" r="9" className="fill-highlight" />
  </svg>
);

export default function DesignSystem() {
  const { t, i18n } = useTranslation();
  const theme = useResolvedTheme();
  const [surface, setSurface] = useState<Surface>('admin');
  const root = useRef<HTMLDivElement>(null);
  const colors = useTokenColors(root, [...SURFACE_TOKENS, ...TEXT_TOKENS, ...ACTION_TOKENS, ...CHARTS, ...TONES.flatMap((x) => [x, `${x}-bg`, `${x}-fg`])], [surface, theme]);

  const [tab, setTab] = useState<'overview' | 'documents' | 'billing'>('overview');
  const [pill, setPill] = useState<'week' | 'month' | 'year'>('month');
  const [sort, setSort] = useState<SortState>({ key: 'due', dir: 'asc' });
  const [page, setPage] = useState(3);
  const [radio, setRadio] = useState<'email' | 'sms' | 'whatsapp'>('email');
  const [sw, setSw] = useState(true);
  const [modal, setModal] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const fmtMoney = (n: number) => new Intl.NumberFormat(i18n.resolvedLanguage ?? 'az', { style: 'currency', currency: 'EUR' }).format(n);
  const rows = [...ROWS].sort((a, b) => {
    if (!sort) return 0;
    const k = sort.key as keyof Row;
    const d = a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0;
    return sort.dir === 'asc' ? d : -d;
  });

  const seg = (value: string, options: { value: string; label: string }[], onChange: (v: string) => void, label: string) => (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 rounded-lg bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={clsx('rounded-md px-3 py-1.5 text-xs font-medium transition', value === o.value ? 'bg-card text-ink shadow-[var(--tv-shadow-card)]' : 'text-muted hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t('ds.page.title')}
        subtitle={t('ds.page.subtitle')}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {seg(surface, (['admin', 'public'] as const).map((v) => ({ value: v, label: t(`ds.page.surfaces.${v}`) })), (v) => setSurface(v as Surface), t('ds.page.surface'))}
            {seg(theme, (['light', 'dark'] as const).map((v) => ({ value: v, label: t(`ds.page.themes.${v}`) })), (v) => setPrefs({ theme: v as 'light' | 'dark' }), t('ds.page.theme'))}
            <DensityToggle variant="segmented" />
          </div>
        }
      />

      <div ref={root} data-surface={surface} className="space-y-10 rounded-2xl border border-line bg-canvas p-4 text-ink sm:p-6 lg:p-8">
        {/* ── Colours ── */}
        <Section id="ds-colors" title={t('ds.page.sections.colors')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
            {SURFACE_TOKENS.map((tk) => (
              <Swatch key={tk} token={tk} hex={colors[tk]} />
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            {TEXT_TOKENS.map((tk) => (
              <div key={tk} className="min-w-0 rounded-xl border border-line bg-card p-3">
                <p className="text-base font-semibold" style={{ color: `var(--color-${tk})` }}>
                  Aa Əə Şş Жж
                </p>
                <p className="code-id mt-1 text-xs font-medium">{tk}</p>
                <p className="code-id text-[11px] text-muted uppercase">{colors[tk]}</p>
                <p className="mt-1 flex flex-wrap gap-x-2 text-[11px] text-muted">
                  <span>
                    canvas <Ratio fg={colors[tk]} bg={colors.canvas} min={tk === 'subtle' ? 3 : 4.5} />
                  </span>
                  <span>
                    card <Ratio fg={colors[tk]} bg={colors.card} min={tk === 'subtle' ? 3 : 4.5} />
                  </span>
                  <span>
                    sunken <Ratio fg={colors[tk]} bg={colors.sunken} min={tk === 'subtle' ? 3 : 4.5} />
                  </span>
                </p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {ACTION_TOKENS.map((tk) => (
              <Swatch
                key={tk}
                token={tk}
                hex={colors[tk]}
                note={
                  tk === 'primary' ? (
                    <>
                      label <Ratio fg={colors['primary-contrast']} bg={colors.primary} />
                    </>
                  ) : tk === 'highlight' ? (
                    <>
                      label <Ratio fg={colors['highlight-contrast']} bg={colors.highlight} />
                    </>
                  ) : tk === 'focus' ? (
                    <>
                      vs canvas <Ratio fg={colors.focus} bg={colors.canvas} min={3} />
                    </>
                  ) : undefined
                }
              />
            ))}
          </div>
        </Section>

        <Section id="ds-status" title={t('ds.page.sections.status')}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {TONES.map((tone) => (
              <div key={tone} className="min-w-0 rounded-xl border border-line bg-card p-3">
                <Badge tone={tone} dot>
                  {tone}
                </Badge>
                <div className="mt-3 flex items-center gap-2">
                  <span className="size-4 rounded-full" style={{ background: `var(--color-${tone})` }} />
                  <span className="code-id text-[11px] text-muted uppercase">{colors[tone]}</span>
                </div>
                <p className="mt-1 text-[11px] text-muted">
                  fg/bg <Ratio fg={colors[`${tone}-fg`]} bg={colors[`${tone}-bg`]} />
                </p>
              </div>
            ))}
          </div>
        </Section>

        <Section id="ds-charts" title={t('ds.page.sections.charts')}>
          <div className="flex flex-wrap items-end gap-2">
            {CHARTS.map((c, i) => (
              <div key={c} className="flex flex-col items-center gap-1">
                <div className="w-10 rounded-t-md" style={{ background: `var(--color-${c})`, height: `${40 + ((i * 37) % 60)}px` }} />
                <span className="code-id text-[10px] text-muted">{i + 1}</span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── Typography ── */}
        <Section id="ds-type" title={t('ds.page.sections.type')}>
          <div className="space-y-4">
            <p className="type-display">Almaniyada iş və təhsil — Ə ğ ı İ ş ç ö ü</p>
            <p className="h-section">Работа в Германии · Arbeit in Deutschland</p>
            <p className="type-page-title">type-page-title — Müraciətlər</p>
            <p className="type-section-title">type-section-title — Sənədlər</p>
            <p className="type-card-title">type-card-title — Ödəniş planı</p>
            <p className="type-body measure">
              type-body — Sənədləriniz yoxlanılır. Hər addımda sizə bildiriş göndəririk; suallarınız olarsa menecerinizlə çatda əlaqə saxlayın. Mətn sətirləri
              65–75 simvoldan uzun olmur (.measure).
            </p>
            <p className="type-small">type-small — 13 px, muted</p>
            <p className="type-caption">type-caption — 12 px, muted</p>
            <p className="type-overline">type-overline</p>
            <p className="eyebrow">eyebrow</p>
            <p className="text-sm">
              <span className="code-id rounded bg-sunken px-1.5 py-0.5">TV-2026-00417</span> <span className="ml-3 num">1 234 567,89 €</span>{' '}
              <a href="#ds-type" className="link ml-3">
                .link
              </a>{' '}
              <kbd className="kbd ml-3">Ctrl</kbd> <kbd className="kbd">K</kbd>
            </p>
          </div>
        </Section>

        <div className="grid gap-10 lg:grid-cols-2">
          <Section id="ds-radii" title={t('ds.page.sections.radii')}>
            <div className="flex flex-wrap gap-3">
              {(['rounded-sm', 'rounded-md', 'rounded-lg', 'rounded-xl', 'rounded-2xl', 'rounded-3xl'] as const).map((r) => (
                <div key={r} className="text-center">
                  <div className={clsx('size-16 border border-line-strong bg-card', r)} />
                  <p className="code-id mt-1 text-[10px] text-muted">{r.replace('rounded-', '')}</p>
                </div>
              ))}
              <div className="text-center">
                <div className="size-16 rounded-[var(--tv-radius-control)] border border-line-strong bg-card" />
                <p className="code-id mt-1 text-[10px] text-muted">control</p>
              </div>
            </div>
          </Section>
          <Section id="ds-shadows" title={t('ds.page.sections.shadows')}>
            <div className="flex flex-wrap gap-5">
              {(['card', 'raised', 'overlay'] as const).map((s) => (
                <div key={s} className="grid size-24 place-items-center rounded-xl bg-card text-xs text-muted" style={{ boxShadow: `var(--tv-shadow-${s})` }}>
                  {s}
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ── Buttons ── */}
        <Section id="ds-buttons" title={t('ds.page.sections.buttons')}>
          <div className="space-y-4">
            {(['sm', 'md', 'lg'] as const).map((size) => (
              <div key={size} className="flex flex-wrap items-center gap-2">
                <span className="code-id w-8 text-xs text-muted">{size}</span>
                <Button size={size} icon={Plus}>
                  Primary
                </Button>
                <Button size={size} variant="secondary">
                  Secondary
                </Button>
                <Button size={size} variant="outline">
                  Outline
                </Button>
                <Button size={size} variant="ghost">
                  Ghost
                </Button>
                <Button size={size} variant="danger" icon={Trash2}>
                  Danger
                </Button>
                <Button size={size} variant="link">
                  Link
                </Button>
                <Button size={size} variant="highlight">
                  Highlight
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <span className="code-id w-8 text-xs text-muted" />
              <Button loading>{t('ds.page.states.loading')}</Button>
              <Button disabled>{t('ds.page.states.disabled')}</Button>
              <Button variant="secondary" disabled>
                {t('ds.page.states.disabled')}
              </Button>
              <IconButton icon={Pencil} label="Edit" />
              <IconButton icon={Download} label="Download" variant="secondary" />
              <IconButton icon={Plus} label="Add" variant="primary" />
              <IconButton icon={Trash2} label="Delete" variant="danger" />
              <IconButton icon={Settings} label="Settings" size="sm" />
              <IconButton icon={Bell} label="Loading" loading variant="secondary" />
            </div>
          </div>
        </Section>

        {/* ── Forms ── */}
        <Section id="ds-forms" title={t('ds.page.sections.forms')}>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <Field label="E-poçt" hint="Heç kimlə paylaşmırıq." required>
              <Input type="email" placeholder="ad@example.com" />
            </Field>
            <Field label="Pasport nömrəsi" error="Format: C01234567">
              <Input defaultValue="C0123" className="code-id" />
            </Field>
            <Field label={t('ds.page.states.disabled')}>
              <Input disabled defaultValue="—" />
            </Field>
            <Field label="Viza növü">
              <Select defaultValue="work">
                <option value="work">İş vizası (§18a)</option>
                <option value="study">Təhsil vizası</option>
                <option value="ausbildung">Ausbildung</option>
              </Select>
            </Field>
            <Field label="Qeyd" hint="Maks. 500 simvol">
              <Textarea rows={3} placeholder="…" />
            </Field>
            <Field label="Axtarış" hideLabel>
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
                <Input type="search" placeholder="Axtarış…" className="pl-9" />
              </div>
            </Field>
            <div className="space-y-3">
              <Checkbox label="Şərtlərlə razıyam" hint="AGB və məxfilik siyasəti" defaultChecked />
              <Checkbox label={t('ds.page.states.disabled')} disabled />
            </div>
            <RadioGroup
              label="Bildiriş kanalı"
              name="ds-radio"
              value={radio}
              onChange={setRadio}
              direction="row"
              options={[
                { value: 'email', label: 'E-poçt' },
                { value: 'sms', label: 'SMS' },
                { value: 'whatsapp', label: 'WhatsApp' },
              ]}
            />
            <div className="space-y-3">
              <Switch checked={sw} onChange={setSw} label="Bildirişlər" showLabel hint="Yeni mesaj gələndə" />
              <Switch checked={!sw} onChange={(v) => setSw(!v)} label="Kiçik" size="sm" showLabel />
            </div>
          </div>
        </Section>

        {/* ── Cards ── */}
        <Section id="ds-cards" title={t('ds.page.sections.cards')}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Card title="panel" subtitle="default" icon={FileText} actions={<IconButton icon={MoreHorizontal} label="More" size="sm" />}>
              <p className="text-sm text-muted">{t('ds.page.sample')}</p>
            </Card>
            <Card title="flat" variant="flat">
              <p className="text-sm text-muted">{t('ds.page.sample')}</p>
            </Card>
            <Card title="raised" variant="raised">
              <p className="text-sm text-muted">{t('ds.page.sample')}</p>
            </Card>
            <Card title="interactive" interactive footer={<Button size="sm" variant="secondary">OK</Button>}>
              <p className="text-sm text-muted">{t('ds.page.states.hover')}</p>
            </Card>
          </div>
        </Section>

        {/* ── Badges ── */}
        <Section id="ds-badges" title={t('ds.page.sections.badges')}>
          <div className="flex flex-wrap items-center gap-2">
            {([...TONES, 'brand', 'highlight'] as BadgeTone[]).map((tone) => (
              <Badge key={tone} tone={tone}>
                {tone}
              </Badge>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <StatusPill domain="invoice" status="PAID" label="Ödənilib" />
            <StatusPill domain="document" status="PENDING" label="Gözləyir" />
            <StatusPill domain="case" status="REJECTED" label="Rədd edildi" />
            <StatusPill domain="case" status="APPOINTMENT_SCHEDULED" label="Görüş təyin edilib" />
            <Badge tone="info" outline>
              outline
            </Badge>
            <Badge tone="success" pill dot>
              pill
            </Badge>
            <Badge tone="neutral" size="sm">
              sm
            </Badge>
          </div>
        </Section>

        {/* ── Tabs ── */}
        <Section id="ds-tabs" title={t('ds.page.sections.tabs')}>
          <Tabs
            label="Case"
            value={tab}
            onChange={setTab}
            items={[
              { key: 'overview', label: 'Ümumi', icon: FolderOpen },
              { key: 'documents', label: 'Sənədlər', count: 12 },
              { key: 'billing', label: 'Ödənişlər', icon: Wallet },
            ]}
          />
          <div className="mt-4">
            <Tabs
              label="Period"
              variant="pills"
              value={pill}
              onChange={setPill}
              items={[
                { key: 'week', label: 'Həftə' },
                { key: 'month', label: 'Ay' },
                { key: 'year', label: 'İl' },
              ]}
            />
          </div>
        </Section>

        {/* ── Table ── */}
        <Section id="ds-table" title={t('ds.page.sections.table')}>
          <Card padding="none">
            <Table
              caption="Invoices"
              rows={rows}
              rowKey={(r) => r.id}
              sort={sort}
              onSortChange={setSort}
              stackOnMobile
              columns={[
                { key: 'number', header: 'No.', cell: (r) => <span className="code-id">{r.number}</span>, primary: true, sortable: true },
                { key: 'client', header: 'Müştəri', cell: (r) => r.client, sortable: true },
                {
                  key: 'status',
                  header: 'Status',
                  cell: (r) => <StatusPill domain="invoice" status={r.status} label={r.status} />,
                },
                { key: 'due', header: 'Son tarix', cell: (r) => <span className="num">{r.due}</span>, sortable: true, hideBelow: 'md' },
                { key: 'amount', header: 'Məbləğ', cell: (r) => fmtMoney(r.amount), numeric: true, sortable: true },
              ]}
            />
            <div className="border-t border-line px-4 py-3">
              <Pagination page={page} pages={12} total={236} pageSize={20} onChange={setPage} />
            </div>
          </Card>
        </Section>

        {/* ── Overlays ── */}
        <Section id="ds-overlays" title={t('ds.page.sections.overlays')}>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setModal(true)}>
              {t('ds.page.openModal')}
            </Button>
            <Button variant="secondary" onClick={() => setDrawer(true)}>
              {t('ds.page.openDrawer')}
            </Button>
            <Button variant="danger" onClick={() => setConfirm(true)}>
              ConfirmDialog
            </Button>
            <Menu
              trigger={<Button variant="secondary" iconRight={MoreHorizontal}>Menu</Button>}
              items={[{ label: 'Redaktə et', icon: Pencil, onSelect: () => undefined }, { label: 'Yüklə', icon: Download, hint: 'Ctrl+D', onSelect: () => undefined }, 'separator', { label: 'Sil', icon: Trash2, danger: true, onSelect: () => undefined }]}
            />
            <Tooltip content="Tooltip">
              <Button variant="ghost">Tooltip</Button>
            </Tooltip>
          </div>
          <Modal
            open={modal}
            onClose={() => setModal(false)}
            title={t('ds.page.openModal')}
            description={t('ds.page.modalText')}
            footer={
              <>
                <Button variant="secondary" onClick={() => setModal(false)}>
                  {t('ui.cancel')}
                </Button>
                <Button onClick={() => setModal(false)}>{t('ui.confirm')}</Button>
              </>
            }
          >
            <Field label="Ad">
              <Input data-autofocus placeholder="…" />
            </Field>
          </Modal>
          <Drawer open={drawer} onClose={() => setDrawer(false)} title={t('ds.page.openDrawer')} description={t('ds.page.modalText')} width="md">
            <SkeletonText lines={4} />
          </Drawer>
          <ConfirmDialog open={confirm} onClose={() => setConfirm(false)} onConfirm={() => setConfirm(false)} title="Silinsin?" message={t('ds.page.modalText')} confirmLabel="Sil" />
        </Section>

        {/* ── Feedback ── */}
        <Section id="ds-feedback" title={t('ds.page.sections.feedback')}>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Toast" variant="flat">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => toast(t('ds.page.toastText'))}>
                  normal
                </Button>
                <Button size="sm" variant="secondary" onClick={() => toast.success(t('ds.page.toastText'))}>
                  success
                </Button>
                <Button size="sm" variant="secondary" onClick={() => toast.warning(t('ds.page.toastText'))}>
                  warning
                </Button>
                <Button size="sm" variant="secondary" onClick={() => toast.error(t('ds.page.toastText'))}>
                  error
                </Button>
              </div>
            </Card>
            <Card title="Skeleton / Spinner" variant="flat">
              <div className="flex items-center gap-3">
                <Skeleton rounded="full" className="size-10 shrink-0" />
                <SkeletonText lines={2} className="flex-1" />
                <Spinner className="size-5 text-muted" />
              </div>
            </Card>
            <Card variant="flat" padding="none">
              <EmptyState illustration={<Illustration />} title={t('ds.page.emptyTitle')} text={t('ds.page.emptyText')} action={<Button size="sm" icon={Plus}>Yeni</Button>} />
            </Card>
          </div>
          <EmptyState icon={Inbox} compact title={t('ds.page.emptyTitle')} text={t('ds.page.emptyText')} />
        </Section>

        {/* ── Data display ── */}
        <Section id="ds-data" title={t('ds.page.sections.data')}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Açıq işlər" value={128} icon={FolderOpen} delta={{ label: '+6', direction: 'up', good: true }} hint="bu həftə" />
            <StatTile label="Gecikmiş" value={4} tone="danger" icon={Bell} />
            <StatTile label="Gəlir (ay)" value={48250} format={fmtMoney} delta={{ label: '−3 %', direction: 'down', good: false }} />
            <StatTile label="Yüklənir" value={0} loading icon={Users} />
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {(['xs', 'sm', 'md', 'lg', 'xl'] as const).map((s, i) => (
              <Avatar key={s} size={s} name={['Leyla Məmmədova', 'Orxan Əliyev', 'Günay Həsənova', 'Kamran Quliyev', 'Triad Vision'][i]} status={i === 2 ? 'online' : undefined} decorative={false} />
            ))}
            <Avatar name="Siemens AG" shape="square" />
          </div>
          <Breadcrumbs className="mt-5" items={[{ label: 'Sistem', to: '/admin/settings' }, { label: t('ds.page.title') }]} />
        </Section>

        <Section id="ds-usage" title={t('ds.page.sections.usage')}>
          <ul className="measure list-disc space-y-1.5 pl-5 text-sm text-ink">
            {(t('ds.page.rules', { returnObjects: true }) as string[]).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}
