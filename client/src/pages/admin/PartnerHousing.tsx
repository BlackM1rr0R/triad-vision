import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Building2, CalendarClock, KeyRound, Pencil, Plus, Trash2, Users, X } from 'lucide-react';
import { api } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { registerCopy } from '@/i18n';
import { pagesHousing } from '@/i18n/pagesHousing';
import { Badge, Button, ConfirmDialog, Drawer, EmptyState, Field, IconButton, Input, Modal, PageHeader, Select, Switch, Table, Tabs, TabPanel, Textarea, useTabParam } from '@/components/ui';
import { ImageField } from '@/components/admin/ImageField';
import { LISTING_TYPES, deadlineTone, fmtBerlin, fmtDay, priceLabel, useHousingError, type DeadlineState, type ListingType, type StaffListing } from '@/components/housing/api';

registerCopy(pagesHousing);

const KEY = ['admin-housing', 'listings'] as const;
const TABS = ['listings', 'deadlines'] as const;
const DATE_LOCALE: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

interface ListResponse {
  items: StaffListing[];
  canEdit: boolean;
}

interface DeadlineRow {
  caseId: string;
  number: string;
  client: string;
  assignedStaff: { id: string; firstName: string; lastName: string } | null;
  moveInDate: string;
  appointmentAt: string | null;
  deadline: string | null;
  daysLeft: number | null;
  state: DeadlineState;
}

interface ProposalRow {
  id: string;
  caseId: string;
  source: 'STAFF' | 'CLIENT';
  response: 'PENDING' | 'INTERESTED' | 'NOT_INTERESTED';
  introducedAt: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  case: { id: string; number: string; client: { firstName: string; lastName: string } };
}

type Form = {
  name: string;
  city: string;
  type: ListingType;
  priceMin: string;
  priceMax: string;
  description: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  address: string;
  notes: string;
  photos: string[];
  active: boolean;
  companyId: string;
};

const emptyForm: Form = { name: '', city: '', type: 'APARTMENT', priceMin: '', priceMax: '', description: '', contactName: '', contactPhone: '', contactEmail: '', address: '', notes: '', photos: [], active: true, companyId: '' };

const toForm = (l: StaffListing): Form => ({
  name: l.name,
  city: l.city,
  type: l.type,
  priceMin: l.priceMin != null ? String(l.priceMin) : '',
  priceMax: l.priceMax != null ? String(l.priceMax) : '',
  description: l.description ?? '',
  contactName: l.contactName ?? '',
  contactPhone: l.contactPhone ?? '',
  contactEmail: l.contactEmail ?? '',
  address: l.address ?? '',
  notes: l.notes ?? '',
  photos: l.photos,
  active: l.active,
  companyId: l.companyId ?? '',
});

const ListingModal = ({ listing, onClose }: { listing: StaffListing | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useHousingError();
  const [form, setForm] = useState<Form>(listing ? toForm(listing) : emptyForm);
  const companies = useQuery({ queryKey: ['admin-housing', 'companies'], queryFn: async () => (await api.get<{ items: { id: string; name: string; city: string | null }[] }>('/admin/housing/companies')).data.items, staleTime: 5 * 60_000 });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const save = useMutation({
    mutationFn: async () => {
      const num = (v: string) => (v.trim() ? Number(v) : null);
      const body = {
        name: form.name.trim(),
        city: form.city.trim(),
        type: form.type,
        priceMin: num(form.priceMin),
        priceMax: num(form.priceMax),
        description: form.description,
        contactName: form.contactName,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail,
        address: form.address,
        notes: form.notes,
        photos: form.photos.filter(Boolean),
        active: form.active,
        companyId: form.companyId || null,
      };
      return listing ? (await api.patch(`/admin/housing/listings/${listing.id}`, body)).data : (await api.post('/admin/housing/listings', body)).data;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success(t('housing.page.saved'));
      onClose();
    },
    onError,
  });
  const f = (k: 'name' | 'city' | 'contactName' | 'contactPhone' | 'contactEmail' | 'address', max: number, required = false, type = 'text') => (
    <Field label={t(`housing.page.fields.${k}`)} required={required}>
      <Input type={type} required={required} maxLength={max} value={form[k]} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={listing ? t('housing.page.edit') : t('housing.page.add')}
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      busy={save.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('housing.page.cancel')}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {t('housing.page.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {f('name', 160, true)}
        {f('city', 80, true)}
        <Field label={t('housing.page.fields.type')}>
          <Select value={form.type} onChange={(e) => set('type', e.target.value as ListingType)}>
            {LISTING_TYPES.map((x) => (
              <option key={x} value={x}>
                {t(`housing.offers.types.${x}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('housing.page.fields.company')}>
          <Select value={form.companyId} onChange={(e) => set('companyId', e.target.value)}>
            <option value="">{t('housing.page.fields.noCompany')}</option>
            {(companies.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.city ? ` · ${c.city}` : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('housing.page.fields.priceMin')}>
          <Input type="number" min={0} max={20000} value={form.priceMin} onChange={(e) => set('priceMin', e.target.value)} />
        </Field>
        <Field label={t('housing.page.fields.priceMax')}>
          <Input type="number" min={0} max={20000} value={form.priceMax} onChange={(e) => set('priceMax', e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('housing.page.fields.description')}>
            <Textarea rows={3} maxLength={4000} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
        </div>
        <p className="type-caption sm:col-span-2">{t('housing.page.contactHint')}</p>
        {f('contactName', 160)}
        {f('contactPhone', 60, false, 'tel')}
        {f('contactEmail', 190, false, 'email')}
        {f('address', 300)}
        <div className="sm:col-span-2">
          <Field label={t('housing.page.fields.notes')}>
            <Textarea rows={2} maxLength={4000} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
          </Field>
        </div>
        <div className="space-y-3 sm:col-span-2">
          <p className="label">{t('housing.page.fields.photos')}</p>
          {form.photos.map((p, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <ImageField label={`${t('housing.page.fields.photos')} ${i + 1}`} value={p} onChange={(url) => set('photos', form.photos.map((x, j) => (j === i ? url : x)))} />
              </div>
              <IconButton icon={X} size="sm" label={t('housing.page.delete')} onClick={() => set('photos', form.photos.filter((_, j) => j !== i))} />
            </div>
          ))}
          {form.photos.length < 8 && (
            <Button size="sm" variant="secondary" icon={Plus} onClick={() => set('photos', [...form.photos, ''])}>
              {t('housing.page.fields.addPhoto')}
            </Button>
          )}
        </div>
        <div className="sm:col-span-2">
          <Switch checked={form.active} onChange={(v: boolean) => set('active', v)} label={t('housing.page.fields.active')} />
        </div>
      </div>
    </Modal>
  );
};

const ProposalsDrawer = ({ listing, onClose }: { listing: StaffListing; onClose: () => void }) => {
  const { t } = useTranslation();
  const q = useQuery({ queryKey: ['admin-housing', 'proposals', listing.id], queryFn: async () => (await api.get<{ items: ProposalRow[] }>(`/admin/housing/listings/${listing.id}/proposals`)).data.items });
  return (
    <Drawer open onClose={onClose} width="sm" title={t('housing.page.proposalsTitle')} description={`${listing.name} · ${listing.city}`}>
      {q.data?.length ? (
        <ul className="space-y-2">
          {q.data.map((p) => (
            <li key={p.id} className="rounded-lg border border-line bg-card p-3">
              <Link to={`/admin/cases/${p.caseId}#case-housing`} className="font-semibold text-link">
                {p.case.number} · {p.case.client.firstName} {p.case.client.lastName}
              </Link>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <Badge size="sm" tone="neutral">
                  {t(`housing.admin.source.${p.source}`)}
                </Badge>
                <Badge size="sm" tone={p.withdrawnAt ? 'neutral' : p.introducedAt ? 'success' : p.response === 'INTERESTED' ? 'info' : 'warning'}>
                  {p.withdrawnAt ? t('housing.admin.withdrawn') : p.introducedAt ? t('housing.admin.introduce') : t(`housing.offers.response.${p.response}`)}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{q.isLoading ? '…' : t('housing.page.noProposals')}</p>
      )}
    </Drawer>
  );
};

const ListingsTab = () => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useHousingError();
  const [search, setSearch] = useState('');
  const [active, setActive] = useState<'all' | 'active' | 'inactive'>('all');
  const [editing, setEditing] = useState<StaffListing | null | 'new'>(null);
  const [deleting, setDeleting] = useState<StaffListing | null>(null);
  const [proposalsOf, setProposalsOf] = useState<StaffListing | null>(null);
  const q = useQuery({
    queryKey: [...KEY, search, active],
    queryFn: async () => (await api.get<ListResponse>('/admin/housing/listings', { params: { q: search || undefined, active } })).data,
    placeholderData: keepPreviousData,
  });
  const del = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/housing/listings/${id}`)).data,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: KEY });
      toast.success(t('housing.page.deleted'));
      setDeleting(null);
    },
    onError,
  });
  const canEdit = !!q.data?.canEdit;
  return (
    <div className="stack-section">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <Input type="search" value={search} placeholder={t('housing.page.search')} aria-label={t('housing.page.search')} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={active} aria-label={t('housing.page.cols.status')} onChange={(e) => setActive(e.target.value as typeof active)} className="w-auto">
          {(['all', 'active', 'inactive'] as const).map((k) => (
            <option key={k} value={k}>
              {t(`housing.page.filter.${k}`)}
            </option>
          ))}
        </Select>
        {canEdit && (
          <Button icon={Plus} onClick={() => setEditing('new')}>
            {t('housing.page.add')}
          </Button>
        )}
      </div>
      {q.data && !canEdit && <p className="type-small">{t('housing.page.readOnly')}</p>}
      <Table
        rows={q.data?.items}
        loading={q.isLoading}
        rowKey={(r) => r.id}
        stackOnMobile
        empty={<EmptyState compact icon={KeyRound} title={t('housing.page.empty')} />}
        columns={[
          {
            key: 'listing',
            header: t('housing.page.cols.listing'),
            primary: true,
            cell: (r) => (
              <span className="flex items-center gap-2">
                {r.photos[0] ? <img src={r.photos[0]} alt="" className="size-9 shrink-0 rounded object-cover" /> : null}
                <span className="min-w-0">
                  <span className="block font-semibold text-ink">{r.name}</span>
                  <span className="type-caption block">{t(`housing.offers.types.${r.type}`)}</span>
                </span>
              </span>
            ),
          },
          { key: 'city', header: t('housing.page.cols.city'), cell: (r) => r.city },
          { key: 'price', header: t('housing.page.cols.price'), cell: (r) => priceLabel(t, r.priceMin, r.priceMax) ?? '—', hideBelow: 'md' },
          { key: 'employer', header: t('housing.page.cols.employer'), cell: (r) => r.company?.name ?? '—', hideBelow: 'lg' },
          { key: 'status', header: t('housing.page.cols.status'), cell: (r) => <Badge tone={r.active ? 'success' : 'neutral'}>{r.active ? t('housing.page.fields.active') : t('housing.page.inactive')}</Badge> },
          {
            key: 'actions',
            header: '',
            align: 'right',
            cell: (r) => (
              <span className="inline-flex gap-1">
                <Button size="sm" variant="ghost" icon={Users} onClick={() => setProposalsOf(r)}>
                  {r.proposals ?? 0}
                </Button>
                {canEdit && <IconButton icon={Pencil} size="sm" label={t('housing.page.edit')} onClick={() => setEditing(r)} />}
                {canEdit && <IconButton icon={Trash2} size="sm" variant="danger" label={t('housing.page.delete')} onClick={() => setDeleting(r)} />}
              </span>
            ),
          },
        ]}
      />
      {editing && <ListingModal listing={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      {proposalsOf && <ProposalsDrawer listing={proposalsOf} onClose={() => setProposalsOf(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && del.mutate(deleting.id)}
        loading={del.isPending}
        title={t('housing.page.delete')}
        message={t('housing.page.deleteConfirm', { name: deleting?.name ?? '' })}
        confirmLabel={t('housing.page.delete')}
      />
    </div>
  );
};

const DeadlinesTab = () => {
  const { t, i18n } = useTranslation();
  const locale = DATE_LOCALE[(i18n.resolvedLanguage ?? 'az').slice(0, 2)] ?? 'en-GB';
  const q = useQuery({ queryKey: ['admin-housing', 'deadlines'], queryFn: async () => (await api.get<{ items: DeadlineRow[] }>('/admin/housing/deadlines')).data.items });
  return (
    <Table
      rows={q.data}
      loading={q.isLoading}
      rowKey={(r) => r.caseId}
      stackOnMobile
      empty={<EmptyState compact icon={CalendarClock} title={t('housing.page.noDeadlines')} />}
      columns={[
        {
          key: 'case',
          header: t('housing.page.cols.case'),
          primary: true,
          cell: (r) => (
            <Link to={`/admin/cases/${r.caseId}#case-housing`} className="font-semibold text-link">
              <span className="code-id">{r.number}</span> · {r.client}
            </Link>
          ),
        },
        { key: 'moveIn', header: t('housing.page.cols.moveIn'), cell: (r) => fmtDay(r.moveInDate, locale), hideBelow: 'md' },
        {
          key: 'deadline',
          header: t('housing.page.cols.deadline'),
          cell: (r) =>
            r.deadline ? (
              <span className="inline-flex flex-wrap items-center gap-1.5">
                {fmtDay(r.deadline, locale)}
                <Badge size="sm" tone={deadlineTone(r.state)}>
                  {r.daysLeft !== null && r.daysLeft < 0 ? t('housing.summary.overdue', { count: -r.daysLeft }) : t('housing.summary.daysLeft', { count: r.daysLeft ?? 0 })}
                </Badge>
              </span>
            ) : (
              '—'
            ),
        },
        { key: 'appointment', header: t('housing.page.cols.appointment'), cell: (r) => (r.appointmentAt ? fmtBerlin(r.appointmentAt, locale) : '—') },
        { key: 'staff', header: t('housing.page.cols.staff'), cell: (r) => (r.assignedStaff ? `${r.assignedStaff.firstName} ${r.assignedStaff.lastName}` : '—'), hideBelow: 'lg' },
      ]}
    />
  );
};

/** Partner landlords (İşlər → Tərəfdaş mənzillər): ADMIN+ edit, STAFF+ view / propose; open Anmeldung deadlines. */
export default function PartnerHousing() {
  const { t } = useTranslation();
  usePageTitle(t('housing.page.title'));
  const [tab, setTab] = useTabParam('tab', TABS, 'listings');
  return (
    <div className="stack-page">
      <PageHeader title={t('housing.page.title')} subtitle={t('housing.page.subtitle')} leading={<Building2 className="size-6 text-link" aria-hidden />} />
      <Tabs
        label={t('housing.page.title')}
        idPrefix="ph"
        value={tab}
        onChange={setTab}
        items={[
          { key: 'listings', label: t('housing.page.tabs.listings'), icon: KeyRound },
          { key: 'deadlines', label: t('housing.page.tabs.deadlines'), icon: CalendarClock },
        ]}
      />
      <TabPanel idPrefix="ph" tabKey={tab}>
        {tab === 'listings' ? <ListingsTab /> : <DeadlinesTab />}
      </TabPanel>
    </div>
  );
}
