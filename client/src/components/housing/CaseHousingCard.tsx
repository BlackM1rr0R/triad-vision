import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { Check, ExternalLink, KeyRound, MapPin, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesHousing } from '@/i18n/pagesHousing';
import { Badge, Button, Card, Drawer, Field, Input, Textarea } from '@/components/ui';
import { BRING_ITEMS, deadlineTone, fmtBerlin, fmtDay, priceLabel, staffHousingKey, useHousingError, useStaffHousing, type StaffCaseHousing, type StaffListing, type StaffProposal } from './api';

registerCopy(pagesHousing);

const DATE_LOCALE: Record<string, string> = { az: 'az-Latn-AZ', de: 'de-DE', en: 'en-GB', ru: 'ru-RU' };

const Row = ({ label, children }: { label: ReactNode; children: ReactNode }) => (
  <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
    <dt className="text-muted">{label}</dt>
    <dd className="text-right font-medium text-ink">{children}</dd>
  </div>
);

const useSave = (caseId: string) => {
  const qc = useQueryClient();
  const onError = useHousingError();
  return useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.patch<StaffCaseHousing>(`/admin/housing/cases/${caseId}`, body)).data,
    onSuccess: (data) => qc.setQueryData(staffHousingKey(caseId), data),
    onError,
  });
};

const ProposalRow = ({ p, caseId }: { p: StaffProposal; caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useHousingError();
  const m = useMutation({
    mutationFn: async (body: { introduced?: boolean; withdrawn?: boolean }) => (await api.patch(`/admin/housing/proposals/${p.id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: staffHousingKey(caseId) }),
    onError,
  });
  return (
    <li className={clsx('rounded-lg border border-line bg-card p-3', p.withdrawnAt && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{p.listing.name}</p>
          <p className="type-caption">
            {p.listing.city} · {t(`housing.admin.source.${p.source}`)}
          </p>
        </div>
        <Badge tone={p.withdrawnAt ? 'neutral' : p.introducedAt ? 'success' : p.response === 'INTERESTED' ? 'info' : p.response === 'NOT_INTERESTED' ? 'neutral' : 'warning'}>
          {p.withdrawnAt ? t('housing.admin.withdrawn') : p.introducedAt ? t('housing.admin.introduce') : t(`housing.offers.response.${p.response}`)}
        </Badge>
      </div>
      {p.clientNote && (
        <p className="mt-1 text-xs text-muted">
          {t('housing.admin.clientNote')}: {p.clientNote}
        </p>
      )}
      {!p.withdrawnAt && (
        <div className="mt-2 flex flex-wrap gap-2">
          {p.introducedAt ? (
            <Button size="sm" variant="ghost" loading={m.isPending} onClick={() => m.mutate({ introduced: false })}>
              {t('housing.admin.unintroduce')}
            </Button>
          ) : (
            <Button size="sm" icon={Check} loading={m.isPending} onClick={() => m.mutate({ introduced: true })}>
              {t('housing.admin.introduce')}
            </Button>
          )}
          <Button size="sm" variant="ghost" disabled={m.isPending} onClick={() => m.mutate({ withdrawn: true })}>
            {t('housing.admin.withdraw')}
          </Button>
        </div>
      )}
    </li>
  );
};

const SuggestionRow = ({ l, caseId }: { l: StaffListing; caseId: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const onError = useHousingError();
  const [note, setNote] = useState('');
  const m = useMutation({
    mutationFn: async () => (await api.post(`/admin/housing/listings/${l.id}/propose`, { caseId, note: note.trim() || undefined })).data,
    onSuccess: () => {
      toast.success(t('housing.admin.proposed'));
      void qc.invalidateQueries({ queryKey: staffHousingKey(caseId) });
    },
    onError,
  });
  const price = priceLabel(t, l.priceMin, l.priceMax);
  return (
    <li className="rounded-lg border border-line bg-card p-3">
      <p className="text-sm font-semibold text-ink">{l.name}</p>
      <p className="type-caption">
        {l.city} · {t(`housing.offers.types.${l.type}`)}
        {price ? ` · ${price}` : ''}
        {l.company ? ` · ${l.company.name}` : ''}
      </p>
      <div className="mt-2 flex gap-2">
        <Input value={note} maxLength={1000} placeholder={t('housing.admin.proposeNote')} aria-label={t('housing.admin.proposeNote')} onChange={(e) => setNote(e.target.value)} />
        <Button size="sm" icon={Send} loading={m.isPending} onClick={() => m.mutate()}>
          {t('housing.admin.propose')}
        </Button>
      </div>
    </li>
  );
};

const ManageDrawer = ({ caseId, data, onClose }: { caseId: string; data: StaffCaseHousing; onClose: () => void }) => {
  const { t, i18n } = useTranslation();
  const locale = DATE_LOCALE[(i18n.resolvedLanguage ?? 'az').slice(0, 2)] ?? 'en-GB';
  const save = useSave(caseId);
  const qc = useQueryClient();
  const onError = useHousingError();
  const h = data.housing!;
  const a = h.anmeldung;
  const [moveIn, setMoveIn] = useState(a.moveInDate ?? '');
  const [appt, setAppt] = useState({ date: a.appointment?.day ?? '', time: a.appointment?.time ?? '', address: a.appointment?.address ?? '' });
  const [reply, setReply] = useState('');
  useEffect(() => {
    setMoveIn(a.moveInDate ?? '');
    setAppt({ date: a.appointment?.day ?? '', time: a.appointment?.time ?? '', address: a.appointment?.address ?? '' });
  }, [a.moveInDate, a.appointment]);
  const answer = useMutation({
    mutationFn: async () => (await api.post<StaffCaseHousing>(`/admin/housing/cases/${caseId}/contract-review`, { reply: reply.trim() })).data,
    onSuccess: (d) => {
      qc.setQueryData(staffHousingKey(caseId), d);
      setReply('');
      toast.success(t('housing.admin.saved'));
    },
    onError,
  });
  const ok = () => toast.success(t('housing.admin.saved'));
  const fileUrl = (which: 'contract' | 'melde') => `/api/admin/housing/cases/${caseId}/files/${which}`;

  return (
    <Drawer open onClose={onClose} width="md" title={t('housing.admin.drawerTitle')} description={data.case.number} bodyClassName="space-y-4 bg-sunken">
      <Card title={t('housing.admin.anmeldung')} padding="sm" as="h3" actions={<Badge tone={deadlineTone(a.state)}>{t(`housing.state.${a.state}`)}</Badge>}>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ moveInDate: moveIn || null }, { onSuccess: ok });
          }}
        >
          <Field label={t('housing.anmeldung.moveIn')}>
            <Input type="date" value={moveIn} onChange={(e) => setMoveIn(e.target.value)} />
          </Field>
          <Button type="submit" size="sm" variant="secondary" loading={save.isPending}>
            {t('housing.page.save')}
          </Button>
        </form>
        {a.deadline && (
          <p className="mt-2 text-sm text-ink">
            {t('housing.summary.deadline', { date: fmtDay(a.deadline, locale) })}
            {a.daysLeft !== null && a.state !== 'done' && ` · ${a.daysLeft < 0 ? t('housing.summary.overdue', { count: -a.daysLeft }) : t('housing.summary.daysLeft', { count: a.daysLeft })}`}
          </p>
        )}
        <form
          className="mt-3 grid gap-2 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate({ appointment: { date: appt.date, time: appt.time, address: appt.address.trim() } }, { onSuccess: ok });
          }}
        >
          <Field label={t('housing.anmeldung.date')}>
            <Input type="date" required value={appt.date} onChange={(e) => setAppt((s) => ({ ...s, date: e.target.value }))} />
          </Field>
          <Field label={t('housing.anmeldung.time')}>
            <Input type="time" required value={appt.time} onChange={(e) => setAppt((s) => ({ ...s, time: e.target.value }))} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={t('housing.anmeldung.address')}>
              <Input required minLength={3} maxLength={300} value={appt.address} onChange={(e) => setAppt((s) => ({ ...s, address: e.target.value }))} />
            </Field>
          </div>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="submit" size="sm" loading={save.isPending}>
              {t('housing.anmeldung.saveAppointment')}
            </Button>
            {a.appointment && (
              <Button size="sm" variant="ghost" disabled={save.isPending} onClick={() => save.mutate({ appointment: null }, { onSuccess: ok })}>
                {t('housing.anmeldung.removeAppointment')}
              </Button>
            )}
          </div>
        </form>
        {a.appointment && (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {a.appointment.reminders.map((r) => (
              <li key={r.kind}>
                <Badge size="sm" tone={r.skipped ? 'neutral' : r.sent ? 'success' : 'info'}>
                  {t(`housing.anmeldung.reminder.${r.kind}`)}
                  {r.skipped ? ` · ${t('housing.anmeldung.reminderSkipped')}` : r.sent ? ` · ${t('housing.anmeldung.reminderSent')}` : ''}
                </Badge>
              </li>
            ))}
          </ul>
        )}
        <dl className="mt-3 border-t border-line pt-2">
          <Row label={t('housing.admin.bring')}>
            {a.bring.filter((b) => b.doneAt).length} / {BRING_ITEMS.length}
          </Row>
          <Row label={t('housing.admin.certificate')}>
            {a.certificate ? (
              <a href={fileUrl('melde')} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-link">
                <ExternalLink className="size-3.5" aria-hidden /> {a.certificate.filename}
              </a>
            ) : (
              t('housing.admin.none')
            )}
          </Row>
        </dl>
        <div className="mt-2">
          {a.status === 'DONE' ? (
            <Button size="sm" variant="ghost" loading={save.isPending} onClick={() => save.mutate({ anmeldungDone: false }, { onSuccess: ok })}>
              {t('housing.admin.reopen')}
            </Button>
          ) : (
            <>
              <Button size="sm" variant="secondary" icon={Check} loading={save.isPending} onClick={() => save.mutate({ anmeldungDone: true }, { onSuccess: ok })}>
                {t('housing.admin.markDone')}
              </Button>
              <p className="type-caption mt-1">{t('housing.admin.markDoneHint')}</p>
            </>
          )}
        </div>
      </Card>

      <Card title={t('housing.admin.steps')} padding="sm" as="h3" actions={<Badge tone="info">{t('housing.summary.steps', h.progress)}</Badge>}>
        <ul className="grid gap-1 sm:grid-cols-2">
          {h.steps.map((s) => (
            <li key={s.key} className={clsx('flex items-center gap-2 text-sm', s.doneAt ? 'text-ink' : 'text-muted')}>
              <span className={clsx('grid size-4 place-items-center rounded-full border', s.doneAt ? 'border-success bg-success text-white' : 'border-line')}>{s.doneAt && <Check className="size-3" strokeWidth={3} aria-hidden />}</span>
              {t(`housing.steps.${s.key}.title`)}
            </li>
          ))}
        </ul>
        <dl className="mt-2 border-t border-line pt-2">
          <Row label={t('housing.admin.cityLabel')}>{h.effectiveCity ?? t('housing.admin.none')}</Row>
          <Row label={t('housing.budget.label')}>{h.budgetMax ?? t('housing.admin.none')}</Row>
        </dl>
      </Card>

      <Card title={t('housing.admin.contract')} padding="sm" as="h3" actions={h.contract.file ? <Badge tone={h.contract.review === 'REQUESTED' ? 'warning' : h.contract.review === 'REVIEWED' ? 'success' : 'neutral'}>{t(`housing.contract.review.${h.contract.review}`)}</Badge> : undefined}>
        {h.contract.file ? (
          <div className="space-y-2">
            <a href={fileUrl('contract')} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link">
              <ExternalLink className="size-3.5" aria-hidden /> {h.contract.file.filename}
            </a>
            {h.contract.question && (
              <p className="rounded-lg bg-sunken p-2 text-sm text-ink">
                <span className="font-semibold">{t('housing.admin.question')}:</span> {h.contract.question}
              </p>
            )}
            {h.contract.reply && <p className="rounded-lg border border-success-border bg-success-bg p-2 text-sm whitespace-pre-line text-ink">{h.contract.reply}</p>}
            <Field label={t('housing.admin.reviewReply')}>
              <Textarea rows={3} maxLength={4000} value={reply} placeholder={t('housing.admin.reviewReplyPlaceholder')} onChange={(e) => setReply(e.target.value)} />
            </Field>
            <Button size="sm" icon={Send} disabled={reply.trim().length < 2} loading={answer.isPending} onClick={() => answer.mutate()}>
              {t('housing.admin.sendReply')}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted">{t('housing.admin.noContract')}</p>
        )}
      </Card>

      <Card title={t('housing.admin.proposals')} padding="sm" as="h3">
        {data.proposals.length ? (
          <ul className="space-y-2">
            {data.proposals.map((p) => (
              <ProposalRow key={p.id} p={p} caseId={caseId} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('housing.page.noProposals')}</p>
        )}
        <h4 className="type-card-title mt-4 mb-2 text-ink">{t('housing.admin.suggestions')}</h4>
        {data.suggestions.length ? (
          <ul className="space-y-2">
            {data.suggestions.map((l) => (
              <SuggestionRow key={l.id} l={l} caseId={caseId} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">{t('housing.admin.noSuggestions')}</p>
        )}
      </Card>
    </Drawer>
  );
};

/** "Mənzil & Anmeldung" on the case Overview: status + deadline at a glance, details in a drawer. */
export default function CaseHousingCard({ caseId, status }: { caseId: string; status: string }) {
  const { t, i18n } = useTranslation();
  const locale = DATE_LOCALE[(i18n.resolvedLanguage ?? 'az').slice(0, 2)] ?? 'en-GB';
  const approved = status === 'APPROVED';
  const q = useStaffHousing(caseId, approved);
  const [open, setOpen] = useState(() => typeof window !== 'undefined' && window.location.hash === '#case-housing');
  if (!approved) return null;
  const data = q.data;
  const h = data?.housing;
  const a = h?.anmeldung;
  const openProposals = data?.proposals.filter((p) => !p.withdrawnAt).length ?? 0;

  return (
    <div id="case-housing">
      <Card
        title={t('housing.admin.card')}
        icon={KeyRound}
        padding="sm"
        actions={
          h ? (
            <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
              {t('housing.admin.open')}
            </Button>
          ) : undefined
        }
      >
        {!h || !a ? (
          <p className="text-sm text-muted">{q.isLoading ? '…' : t('housing.admin.notApproved')}</p>
        ) : (
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <Row label={t('housing.admin.anmeldung')}>
              <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
                <Badge size="sm" tone={a.status === 'DONE' ? 'success' : a.status === 'APPOINTMENT_SET' ? 'accent' : 'neutral'}>
                  {t(`housing.status.${a.status}`)}
                </Badge>
                {a.state !== 'none' && a.state !== 'done' && (
                  <Badge size="sm" tone={deadlineTone(a.state)}>
                    {t(`housing.state.${a.state}`)}
                  </Badge>
                )}
              </span>
            </Row>
            <Row label={t('housing.anmeldung.deadline')}>
              {a.deadline ? (
                <span className={clsx(a.state === 'overdue' && 'text-danger', a.state === 'soon' && 'text-warning-fg')}>
                  {fmtDay(a.deadline, locale)}
                  {a.daysLeft !== null && a.state !== 'done' ? ` (${a.daysLeft < 0 ? t('housing.summary.overdue', { count: -a.daysLeft }) : t('housing.summary.daysLeft', { count: a.daysLeft })})` : ''}
                </span>
              ) : (
                t('housing.admin.none')
              )}
            </Row>
            <Row label={t('housing.admin.appointment')}>
              {a.appointment ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="size-3.5 text-muted" aria-hidden /> {fmtBerlin(a.appointment.at, locale)}
                </span>
              ) : (
                t('housing.admin.none')
              )}
            </Row>
            <Row label={t('housing.admin.housingProgress')}>{t('housing.summary.steps', h.progress)}</Row>
            <Row label={t('housing.admin.contract')}>
              {h.contract.file ? (h.contract.review === 'REQUESTED' ? <Badge size="sm" tone="warning">{t('housing.admin.reviewRequested')}</Badge> : t(`housing.contract.review.${h.contract.review}`)) : t('housing.admin.noContract')}
            </Row>
            <Row label={t('housing.admin.offers')}>{openProposals}</Row>
          </dl>
        )}
      </Card>
      {open && data?.housing && <ManageDrawer caseId={caseId} data={data} onClose={() => setOpen(false)} />}
    </div>
  );
}
