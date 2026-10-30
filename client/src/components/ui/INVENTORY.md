# UI inventory: legacy duplicates and their canonical replacements

This is the state after Phase 1 of the design-system work. "Adapter" means the old export still exists with the same props
but now renders the canonical component, so its importers changed visually and gained accessibility without code changes.
For the APIs, see `README.md`.

## Modals / dialogs → `ui/Modal`

| Legacy | Used by | Status |
| --- | --- | --- |
| `admin/Modal` (`Modal`, `useOverlay`) | ~60 admin files | **re-export** of `ui/Modal` / `ui/overlay` |
| `mail/Dialog` `Dialog` | 4 mail files | adapter (size 1:1, z 80) |
| `calls/Modal` | 9 call / callback views | adapter (`wide`→lg, z 95) |
| `settlement/Modal` | 14 settlement dialogs | adapter (always open; `wide`→xl) |
| `site/Sheet` | 2 site features | adapter (z 85) |
| `vault/VaultModal` | 4 vault dialogs | adapter (z 100). **Backdrop blur removed.** |
| `workspace/ui` `Modal` | 12 workspace files | adapter (mobile full screen, top aligned, z 70, `as="form"`) |
| `chat/bits` `Modal` | 18 chat files | adapter (md→lg, lg→xl) |
| `ui/DetailModal` | 3 site pages | adapter (eyebrow and icon tile). **Backdrop blur removed.** |
| `tasks/NewTaskDialog` | tasks | migrated to Modal (form) |
| `tasks/CalendarView` day popup | tasks | migrated |
| `translations/PricingDialog` | admin translations | migrated (form) |
| `messagingPlus/PartyThread` dialog | messaging | migrated |
| `drive/intel/CompareDialog` | drive | migrated (2xl, mobile full) |
| `aiWriting/AiCvWizard` | portal CV | migrated. **Backdrop blur removed.** |
| `pages/admin/ClientRegister` manage columns | admin | migrated |
| `search/SearchPalette` | global | **kept** (the command-palette rebuild is next). Blur replaced by `bg-scrim`. |

## Confirm dialogs → `ui/ConfirmDialog`

| Legacy | Status |
| --- | --- |
| `admin/ConfirmDialog` (31 importers) | **re-export** |
| `portal/ConfirmDialog` (11 importers) | adapter (`danger`, `busy`, z 100). Blur removed; buttons now sit in the footer row. |
| `mail/Dialog` `Confirm` | adapter (mail labels kept) |
| `tasks/TaskPanel` `ConfirmBox` | adapter; focus now starts on the confirm button (was Cancel) |
| `pages/admin/Duplicates` `ConfirmMerge` | ConfirmDialog with `confirmText="MERGE"` (shared "Type … to confirm" wording) |
| native `window.confirm()` | **done**: all 37 call sites use `confirmDialog()` (`ui/ConfirmHost`) |

## Drawers → `ui/Drawer`

| Legacy | Status |
| --- | --- |
| `admin/Drawer` (19 importers) | **re-export** (default width lg = 42rem, same as before) |
| `pages/admin/Arrivals` detail panel | migrated (`width="md"`, 32rem; it was 36rem) |
| `aiAdmin/AdminAiPanel` | **TODO(ui)**: docked on lg, overlay below (no trap / Escape yet) |
| `tasks/TaskPanel` side panel | **TODO(ui)**: docked inside the board on md+, not an overlay |

## Badges / status pills → `ui/Badge` + `ui/status.ts`

- `lib/caseStatus` `STATUS_TONE` / `STATUS_BAR_TONE`, `admin/labels` `DOC_STATUS_TONE` / `INQUIRY_STATUS_TONE` / `ROLE_TONE` / `DOC_ACCESS_TONE`,
  and `portal/StatusBadge` `DOC_TONE` are built from `STATUS_TONES` / `TONE_CLASS`.
- About 50 feature status maps are rewired: agents, aiDocs, aiMail urgency, aiMgmt, aiStaff, arrival, booking, calls, campaigns, caseNext, clientData,
  clientProcess, company, docsIntel, drive collab / org, esign, expiry, family, finance aging, jobs, ops, originals, partnerPortal, partners,
  portal, privacy, quiz, quotes, requests, tasks, translations, account German / LetterExplain / Referral, admin Automation / GrowthEvents /
  Invoices / Messaging / ProblemReports / Reviews / Dashboard, and workspace LiveChats.
- `scoreTone` helpers (jobs, Surveys, CandidateRequests), `StatTile` / `Kpi` tones and `workspace/ui` `Chip` use the tones.
- 63 ad-hoc `badge bg-X-100 text-X-800` strings in 36 files became token pairs.
- `admin/StatusBadge` `ToneBadge`, `partnerPortal/ui` and `originals/parts` badges are kept as wrappers. Their colours come from the maps above.
- **Categorical, intentionally not in status.ts:** TAG_TONE, FOLDER_TONE, NotesBoard colours, avatar hues (chat / mail / tasks / workspace),
  calendar TONES, StorageReport series, Leave TYPE_TONE, German LEVEL_TONE, ContractTemplates KIND_TONE, aiMail / today CATEGORY_TONE,
  history SOURCE_TONE, drive AccessOverview SOURCE_TONE, ActivityViews TONE, DocsAudit ACTION_TONE, and the CompanyWorkers timeline bars.

## Empty states → `ui/EmptyState`

| Legacy | Status |
| --- | --- |
| `admin/ui` `EmptyState` (58 files) | delegates |
| `company/shared` `Empty` (35 importers) | adapter (`tone="brand"`) |
| `workspace/ui` `Empty` | adapter |
| inline blocks: CompanyInvoices, CompanyQuotes, mail MessageList, partner Clients / Commissions, cities CompareTable | migrated |
| large portal empty states (size-14 icon, display title) | **TODO(ui)**: use `<EmptyState size="lg" tone="brand">`. Files: account Applications, Arrival, InterviewPrep, Interviews, LetterExplain, Letters, Notifications, Translations, Vault; jobs/Jobs, QuotePage, booking/BookingManage, admin/Today (also mail ReadingPane, SearchPalette) |

## Skeletons / loaders → `ui/Skeleton`, `ui/Spinner`

- `workspace/ui` `Skeleton` and `tasks/bits` `Skeleton` are adapters.
- These use the canonical primitives inside: aiCase CaseAiChecks, aiEmployer AiWorking, settlement SummaryCards (SkeletonBlock), today TodayCard, workspace Drive.
- Hand-rolled spinners in `lib/auth.tsx` and `tasks/CalendarView` became `Spinner`.
- Kept: `PageHeroSkeleton` and `DashboardSkeleton` (white/10 bones on the navy hero), and 34 lucide `Loader2 animate-spin` icon spinners.

## Buttons → `ui/Button` / `.btn-*`

- `btn-white btn-sm border border-line` → `btn-secondary btn-sm` (410 replacements in 158 files). The remaining 6 files are in excluded `admin/case/**` etc.
- `.btn-primary`, `.btn-ghost` (= outline), `.btn-danger`, `.btn-white`, `.btn-outline` (dark heroes) stay as the CSS behind the variants.
- `workspace/ui` `IconButton` is an adapter over `ui/IconButton`.

## Tabs → `ui/Tabs`

Migrated, 21 lists in 19 files:

- admin: Automation, Bookings (×2), Calls, DocGuides, GrowthTools, Invoices, Journey, Messaging, Partners, PrivacyRequests, Profitability (×2), Quotes, StaffDetail, TimeTracking
- workspace: Tasks, Team
- account: Arrival
- Announcements, VacancyForm

ClientTasks filter chips were wrongly marked up as `role="tablist"`; they are now `role="group"`.

| Kept | Reason |
| --- | --- |
| sheet/SheetTabs, workspace/PdfEditor, drive/DetailsPanel | bespoke tool tabs |
| esign/SigningFlow, aiWriting/AiLetterWizard, campaigns/CampaignWizard | wizard steps |
| account/Profile | rail / sidebar hybrid |
| admin/case/ActionPanel | excluded file |
| workspace/Calendar, account/InterviewPrep, admin/L10nInput | **TODO(ui)**: the props they need now exist on `Tabs` (`TabItem.className` / `title`, `size`, `fullWidth`); migrate them next |

## Tables → `ui/Table` (new; no table migrated in Phase 1)

There are 65 files with a hand-written `<table>`. The busiest admin lists are good candidates:
CasesList, Users, Invoices, Quotes, Candidates, Partners, Originals, Expiring, Messaging, Campaigns, DocsAudit, Translations,
TimeTracking, WeeklyReports, agents/CommissionsTable, and tasks/ListView. Use `<SortableTh>` first where a full rewrite is too risky.

## Forms → `ui/Field`

`.input` / `.label` are used in about 240 files and stay valid. `ui/Field` + `Input/Select/Textarea` render the same classes and add the ARIA wiring.

**TODO(ui):** `workspace/ui` `Field` and `chat/bits` `Field` wrap the control in a `<label>`; moving them to `ui/Field` needs call-site ids.

## Cards / panels / page headers

- `admin/ui` `Panel` → `ui/Card` (same spacing). `admin/ui` `PageHead` → `ui/PageHeader`.
- `workspace/ui` `Card` is kept: it is rounded-2xl with different padding, so swapping it would not be pixel-equivalent.
- The site keeps `.card`. `ui/Card variant="raised"` uses it.

## Menus / dropdowns / tooltips

`ui/Menu` and `ui/Tooltip` are new. These legacy ones are kept, because each has bespoke behaviour:

- `drive/ContextMenu` (right-click)
- `sheet/Popups` (ContextMenu / FilterMenu)
- `mail/menus` (Snooze / Move / Labels)
- `originals/parts` LabelMenu
- `tasks/bits` Popover and `tasks/pickers`
- `calendar/EventPopover`
- `admin/charts` chart tooltip

Migrate the simple "⋯" row-action menus to `ui/Menu` as pages are reworked.

## Toasts

There is a single sonner `<Toaster>` in `main.tsx` (262 files call `toast`). It is already one system, so nothing was changed.

## Backdrop-filter

- Removed: admin Modal overlay, DetailModal, VaultModal, portal ConfirmDialog, AiCvWizard, SearchPalette, calendar AgendaView sticky header,
  workspace Contacts sticky header, QuizResult label.
- `grep backdrop-blur src` now returns nothing.

## Intentional non-dialog overlays (kept)

- ai/AiLauncher, publicAi/AdvisorBubble (chat bubbles)
- layout/Header mobile menu, layout/Effects intro
- docCreate/DocEditor (full-screen editor)
- workspace Drive / Mail off-canvas sidebars
- timeCare/HeaderTimer, a11y/AccessibilityWidget, mail/Compose

Excluded files, owned by the next phase: AdminLayout, CaseAdmin, `admin/case/**`, AccountLayout, AccountHome, CaseView, WorkspaceLayout.

## native `confirm()` → ConfirmDialog (done)

Every former `window.confirm` call site now awaits `confirmDialog()` from `ui/ConfirmHost` (promise-based, queued,
rendered by the one `<ConfirmHost />` in main.tsx). Link guards (sheet/useLeaveGuard, PdfEditor back link) hold the
navigation, ask, then replay it.
