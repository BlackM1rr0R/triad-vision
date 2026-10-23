# Triad Vision design system (`components/ui`)

One set of accessible, typed, theme-aware primitives for the public site, client portal (`/account`),
employer portal (`/company`), admin (`/admin`) and staff workspace (`/workspace`).

```ts
import { Button, Modal, ConfirmDialog, StatusPill, Table, EmptyState, PageHeader } from '@/components/ui';
// or per file: import { Modal } from '@/components/ui/Modal';
```

No headless-UI / Radix dependency: focus management, Escape stacking and scroll locking live in
`overlay.ts` and are shared by every overlay. `INVENTORY.md` lists the legacy duplicates and what replaced them.

---

## 1. Rules

1. **Colours are tokens.** Use `bg-card`, `bg-surface`, `bg-page`, `bg-field`, `text-ink`, `text-muted`, `border-line`, `brand-*`
   and the status tones. Avoid raw `bg-white` / `slate-*` / `amber-100` in new code: the dark theme only knows
   the tokens (a few legacy raw classes are remapped in `index.css`, but that list is not growing).
2. **Status colour comes from `status.ts` only.** Never write `bg-amber-100 text-amber-800` for a status. Use
   `<StatusPill domain="invoice" status={x.status} label={…} />`, or `TONE_CLASS[statusTone('invoice', x.status)]`
   when you need the class string. New status enum? Add it to `STATUS_TONES` (one line) and use it.
3. **No `backdrop-filter`** (`backdrop-blur-*`) anywhere. It re-blurs on every scroll frame. Overlays use the plain
   `bg-scrim` dim; sticky headers use a solid `bg-card`.
4. **Overlays are Modal / Drawer / ConfirmDialog / Menu.** Do not hand-roll `fixed inset-0` dialogs: you'd lose the
   focus trap, Escape stacking, focus return and scroll lock.
5. **Buttons:** `<Button>` / `<IconButton>`, or `buttonClass()` on a `<Link>`. Icon-only buttons need `label`.
6. **Forms:** wrap controls in `<Field label hint error required>`; it wires `id`, `aria-describedby`, `aria-invalid`.
7. **Phones first:** every component works at 390 px. Modals become bottom sheets (or full screen), drawers go
   full screen, tables can stack (`stackOnMobile`), tab lists scroll sideways, filter chips scroll sideways.
8. **Windows repo:** keep each file's existing line endings when editing.

---

## 2. Tokens (`src/index.css`)

Light values are in `@theme`; dark values are redefined on `:root[data-theme='dark']` (set by `lib/prefs.ts`;
`dark:` variants follow it too). High-contrast mode (`html.a11y-contrast`) forces status text to black/white.

| Group | Tokens (Tailwind utilities: `bg-*`, `text-*`, `border-*`) |
| --- | --- |
| Surfaces | `page` (body), `surface` (muted panels, table headers, hovers), `card` (cards, modals, menus), `field` (inputs), `scrim` (overlay dim) |
| Text | `ink` (primary text), `muted` (secondary text) |
| Lines | `line` (all borders / dividers) |
| Brand | `brand-50 … brand-700`, `navy-700 … navy-950` (dark heroes) |
| Status (per tone) | `{tone}-bg` tint, `{tone}-fg` text on that tint, `{tone}-border`, `{tone}` solid (bars, dots) |

Tones: `success`, `warning`, `danger`, `info`, `neutral`, `accent`. Measured contrast of `-fg` on `-bg`:
light 6.4–7.4 : 1; dark (tint over card) 7.4–8.8 : 1. All ≥ 4.5 : 1. The `brand` badge tone is 6.1 : 1 (light) and 4.6 : 1 (dark).

## 3. Status vocabulary (`status.ts`)

| Tone | Meaning | Examples |
| --- | --- | --- |
| `success` | done / accepted | ACCEPTED, APPROVED, PAID, SIGNED, COMPLETED, DONE, ACTIVE, CONFIRMED, DELIVERED |
| `warning` | waiting on someone / needs action | PENDING ("Gözləyir"), DOCUMENTS_PENDING, CONTRACT_SENT, REVIEW, due soon, EXPIRED (quotes), MEDIUM |
| `danger` | negative end / failure / urgent | REJECTED, DECLINED, CANCELLED, FAILED, OVERDUE, NO_SHOW, URGENT, HIGH |
| `info` | moving along | NEW, SENT, SUBMITTED, IN_PROGRESS, VIEWED, DOCUMENTS_REVIEW, DECISION_PENDING |
| `neutral` | not started / inactive | DRAFT, TODO, QUEUED, SKIPPED, ARCHIVED, CLOSED, LOW |
| `accent` | booked milestone | APPOINTMENT_SCHEDULED, BOOKED, interview CONFIRMED, SCHEDULED campaign, AT_APOSTILLE |

`brand` is a badge tone for non-status labels (roles, categories). It is never a status.

```ts
statusTone('document', 'PENDING')            // 'warning'
toneClass('warning')                          // 'bg-warning-bg text-warning-fg'
TONE_TEXT.danger / TONE_SOLID.success / TONE_BORDER.info
toneClasses(STATUS_TONES.invoice)             // Record<InvoiceStatus, string>, drop-in for legacy *_TONE maps
toneSolids(STATUS_TONES.case)                 // bar colours
scoreTone(score, good = 80, ok = 55)          // match / NPS numbers
```

Domains: `case, document, docItem, task, taskPriority, taskDue, clientTask, checklist, invoice, quote, booking,
officeVisit, interview, signature, signer, application, vacancy, company, request, inquiry, commission, severity,
urgency, check, campaign, recipient, outbound, call, liveChat, automationRun, arrival, housing, translation,
privacy, review, problemReport, leave, publication, reward, confirmation, form, shareLink, expiry, driveStage,
original, agentStage, aging, attendee, result, nextStep, ballSide, workerStage, assignment, readiness, certificate`.
Unknown values fall back to `neutral`.

Categorical colours (tags, folder colours, avatar hues, calendar colours, chart series) are **not** statuses.
They stay in their features.

## 4. Typography and spacing (app surfaces)

| Class | Use | Style |
| --- | --- | --- |
| `type-page-title` | the page `<h1>` (PageHeader) | display, xl → 2xl, bold |
| `type-section-title` | `<Section>` heading | display, lg, bold |
| `type-card-title` | Card / panel header | sans, sm, semibold |
| `type-body` | running text | sm, relaxed |
| `type-small` | secondary lines | 13 px, muted |
| `type-caption` | meta, timestamps | xs, muted |
| `eyebrow` | uppercase kicker (site) | xs, bold, tracking |

| Class | Rhythm |
| --- | --- |
| `app-page` | page padding: `px-4 py-5 → sm:px-6 sm:py-6 → lg:px-8 lg:py-8` |
| `stack-page` | gap between page sections: `gap-6` |
| `stack-section` | gap inside a section: `gap-4` |
| `card-body` | card padding: `p-4 sm:p-5` (Card `padding="md"`) |

The marketing site keeps `.container-x`, `.section`, `.h-section`, `.card-pad`.

---

## 5. Components

### Button / IconButton (`Button.tsx`)

```tsx
<Button onClick={save} loading={m.isPending}>Save</Button>
<Button variant="secondary" size="sm" icon={Plus}>Add</Button>
<Link to="/jobs" className={buttonClass({ variant: 'outline', size: 'sm' })}>Browse</Link>
<IconButton icon={Trash2} label="Delete" variant="danger" size="sm" onClick={…} />
```

| Prop | Type | Default |
| --- | --- | --- |
| `variant` | `primary \| secondary \| outline \| ghost \| danger \| link` | `primary` |
| `size` | `sm \| md \| lg` | `md` (`md` is the legacy `.btn` size) |
| `loading` | boolean: spinner, disabled, `aria-busy` | – |
| `icon`, `iconRight` | `LucideIcon` or element | – |
| `block` | full width | – |
| `type` | defaults to `"button"` | – |

IconButton: `icon`, **`label` (required, becomes aria-label and the title tooltip)**, `variant: ghost | secondary | primary | danger`,
`size` (`sm` 32 px, `md` 40 px, `lg` 44 px), `loading`, `tooltip` (default true).
Legacy classes stay valid and map to variants: `.btn-primary`, `.btn-secondary`, `.btn-ghost` (= outline), `.btn-quiet` (= ghost), `.btn-danger`, `.btn-white`, `.btn-outline` (on dark heroes), `.btn-sm`.

### Modal (`Modal.tsx`)

```tsx
<Modal open={open} onClose={close} title="Edit client" description="Changes are logged." size="lg"
  as="form" onSubmit={submit} busy={m.isPending}
  footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button type="submit" loading={m.isPending}>Save</Button></>}>
  …
</Modal>
```

| Prop | Notes |
| --- | --- |
| `open`, `onClose`, `title` | title labels the dialog (`aria-labelledby`) |
| `description`, `eyebrow`, `icon`, `headerActions` | header content (`description` → `aria-describedby`) |
| `footer` | right-aligned action row, safe-area padded |
| `size` | `sm` 28rem · `md` 32rem (default) · `lg` 42rem · `xl` 56rem · `2xl` 72rem |
| `mobile` | `sheet` (default: bottom sheet up to full height) · `full` (always full screen) |
| `align` | `center` (default) · `top` (8vh from top, for growing content) |
| `busy` | Escape / backdrop / × do nothing while true |
| `as="form"` + `onSubmit` | panel is a `<form>` |
| `initialFocus` | ref; otherwise `[data-autofocus]`, then the first field, then the panel |
| `role` | `dialog` (default) / `alertdialog` |
| `closeOnBackdrop`, `hideClose`, `zIndex` (80), `padded` (true), `className`, `bodyClassName`, `closeLabel` | |

Behaviour: portal to body, focus trap (Tab / Shift+Tab), Escape closes only the top-most overlay, focus returns
to the opener, the body scroll lock compensates the scrollbar width (no layout shift) and pauses Lenis,
plain `bg-scrim` (no blur).

### ConfirmDialog (`ConfirmDialog.tsx`)

```tsx
<ConfirmDialog open={!!target} onClose={() => setTarget(null)} onConfirm={remove} loading={del.isPending}
  title="Delete folder?" message="All files inside are deleted." confirmLabel="Delete" confirmText={target?.name} />
```

`tone`: `danger` (default) or `primary`. `danger` is a legacy boolean alias. `loading` / `busy`, `confirmLabel`, `cancelLabel`,
`message` + `children`, **`confirmText`**: "type to confirm" (the confirm button stays disabled until the exact text
is typed; Enter submits), `hideIcon`, `zIndex`. role = `alertdialog`; focus starts on the confirm button (or on the text field).

### Drawer (`Drawer.tsx`)

`open, onClose, title, description, headerActions, children, footer, side: 'right' | 'left', width: 'sm' 24rem | 'md' 32rem | 'lg' 42rem (default) | 'xl' 56rem,
busy, closeOnBackdrop, as/onSubmit, initialFocus, zIndex (70, below modals), padded`. Full screen on phones.

### Badge / StatusPill / StatusDot (`Badge.tsx`)

```tsx
<StatusPill domain="document" status={doc.status} label={t(`portal.docs.status.${doc.status}`)} />
<Badge tone="brand" icon={Shield}>Admin</Badge>
<StatusDot tone={statusTone('call', c.status)} label="Completed" />
```

Badge: `tone (BadgeTone)`, `dot`, `icon`, `outline`, `size: sm | md`. StatusPill: `domain`, `status`, `label` (+ Badge props; `dot` defaults on).

### Tabs (`Tabs.tsx`)

```tsx
const [tab, setTab] = useTabParam('tab', ['list', 'settings'] as const, 'list');   // ?tab=settings
<Tabs label="Invoices" idPrefix="inv" value={tab} onChange={setTab}
  items={[{ key: 'list', label: 'List', count: 12 }, { key: 'settings', label: 'Settings', icon: Settings }]} />
<TabPanel idPrefix="inv" tabKey={tab}>…</TabPanel>
```

WAI-ARIA tabs with roving tabindex: arrow keys, Home and End move between tabs and activate them. `variant`: `underline` (default) or `pills`.
`useTabParam(param, keys, fallback, { replace })` keeps the tab in the URL; the fallback removes the param.

### Table (`Table.tsx`)

```tsx
<Table rows={q.data?.items} loading={q.isLoading} rowKey={(r) => r.id} sort={sort} onSortChange={setSort} stackOnMobile
  empty={<EmptyState compact icon={Inbox} title="No invoices" />}
  columns={[
    { key: 'number', header: 'No.', cell: (r) => r.number, sortable: true, primary: true },
    { key: 'status', header: 'Status', cell: (r) => <StatusPill domain="invoice" status={r.status} label={…} /> },
    { key: 'client', header: 'Client', cell: (r) => r.client, hideBelow: 'md' },
    { key: 'total', header: 'Total', cell: (r) => fmt(r.total), align: 'right' },
  ]} />
```

Props: `columns, rows, rowKey, loading, loadingRows, empty, sort, onSortChange` (the caller sorts), `stickyHeader` (default true),
`stackOnMobile` (below sm each row becomes a label/value card; `primary` is the card title), `onRowClick, rowClassName, caption, dense`.
`SortableTh` adds sort buttons with `aria-sort` to hand-written tables.

### EmptyState (`EmptyState.tsx`)

`icon, title, text, action, tone: neutral | brand, size: md | lg (page-level), padding: none | sm | md | lg, compact` (= padding sm).

### Skeleton (`Skeleton.tsx`)

`<Skeleton className="h-4 w-40" rounded="md|lg|xl|full" style>`, `<SkeletonText lines>`, `<SkeletonBlock>` (role=status),
`<SkeletonList count>`, `<SkeletonRows rows cols>` (inside a `<tbody>`). Spinner: `<Spinner className label?>` (decorative unless `label`), `<PageLoader>`.

### Field / Input / Select / Textarea / Checkbox (`Field.tsx`)

```tsx
<Field label="E-mail" required hint="We never share it." error={errors.email}>
  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
</Field>
```

Field: `label, hint, error, required` (adds a visual `*` and "required" for screen readers), `hideLabel, labelAside, id`. Controls inside
pick up `id`, `aria-describedby` (error + hint) and `aria-invalid` from context. Plain elements (`<select className="input">`) get them
cloned in. `Input/Select/Textarea` render the existing `.input` class (`invalid` adds the danger border). `Checkbox` takes `label` and `hint`.

### Card / CardHeader (`Card.tsx`)

`title, subtitle, icon, actions, footer, variant: panel (flat, default) | raised (site .card shadow), padding: none | sm | md | lg, as: h2 | h3,
headerClassName` (replaces the header padding), `bodyClassName`. The admin `Panel` is a Card with admin spacing.

### Menu (`Menu.tsx`)

```tsx
<Menu trigger={<IconButton icon={MoreHorizontal} label={t('ui.moreActions')} />}
  items={[{ label: 'Edit', icon: Pencil, onSelect: edit }, { label: 'Open', to: `/admin/cases/${id}` }, 'separator',
          { heading: 'Danger zone' }, { label: 'Delete', icon: Trash2, danger: true, onSelect: remove }]} />
```

role=menu with arrow keys, Home and End, type-ahead, and Escape to close and return focus. ArrowDown/ArrowUp on the trigger opens the menu.
It renders in a portal with fixed positioning (never clipped by table overflow) and flips up when there's no room below.
Props: `trigger` (must forward ref and onClick: Button and IconButton do), `items`, `align: start | end`, `label`, `widthClassName`.
It needs to render inside the router.

### Tooltip (`Tooltip.tsx`)

`<Tooltip content="Download" side="top|bottom|left|right"><button …/></Tooltip>`: CSS only. It shows on hover after 300 ms and
on keyboard focus, Escape hides it, and it sets `aria-describedby`. Keep the text short; it's supplementary, never the only label.

### PageHeader / Breadcrumbs / Section / Toolbar / FilterBar (`PageHeader.tsx`)

```tsx
<div className="app-page stack-page">          {/* layouts usually provide app-page */}
  <PageHeader title="Invoices" subtitle="42 open" meta={<Badge tone="warning">3 overdue</Badge>}
    breadcrumbs={[{ label: 'Finance', to: '/admin/finance' }, { label: 'Invoices' }]}
    actions={<Button icon={Plus}>New invoice</Button>} />
  <FilterBar search={<Input type="search" placeholder="Search…" />} filters={<>{chips}</>} end={<Button size="sm" variant="secondary">Export</Button>} />
  <Section title="Overdue" actions={<Button variant="link">All</Button>}>…</Section>
</div>
```

`PageHeader`: `title, subtitle, actions, breadcrumbs, leading, meta`. `Toolbar`: `children, end, label` (role=toolbar when labelled).
`FilterBar`: `search, filters` (scroll sideways on phones), `end`.

### Overlay hooks (`overlay.ts`)

`useOverlay(open, onClose, { closeOnEscape, lockScroll, trapFocus, initialFocus, restoreFocus })` returns a panel ref.
It's for custom overlays (command palette, docked-on-desktop panels that become overlays on phones).
`useEscapeLayer(active, onEscape)` joins the Escape stack without a trap (popovers). `lockScroll()` is ref-counted.
`hasOpenOverlay()` lets global shortcuts pause.

## 6. Legacy paths that still work

| Old import | Now |
| --- | --- |
| `components/admin/Modal` (`Modal`, `useOverlay`) | re-export of `ui/Modal`, `ui/overlay` |
| `components/admin/Drawer` | re-export of `ui/Drawer` |
| `components/admin/ConfirmDialog` | re-export of `ui/ConfirmDialog` |
| `components/admin/ui` `Panel`, `EmptyState`, `PageHead`, `StatTile` | delegate to `Card`, `EmptyState`, `PageHeader`, tones |
| `components/portal/ConfirmDialog`, `mail/Dialog` (`Dialog`, `Confirm`), `vault/VaultModal`, `calls/Modal`, `settlement/Modal`, `site/Sheet`, `chat/bits` `Modal`, `workspace/ui` `Modal`/`Empty`/`Skeleton`/`Chip`/`IconButton`, `company/shared` `Empty`, `tasks/bits` `Skeleton`, `ui/DetailModal` | thin adapters over the canonical components (same props) |
| `lib/caseStatus` `STATUS_TONE`, `STATUS_BAR_TONE`; every feature `*_TONE` status map | built from `STATUS_TONES` |

New code should import from `@/components/ui` directly.
