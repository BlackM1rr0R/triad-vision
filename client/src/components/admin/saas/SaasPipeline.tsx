import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Filter, Save } from 'lucide-react';
import { api } from '@/lib/api';
import { registerCopy } from '@/i18n';
import { pagesOnboarding } from '@/i18n/pagesOnboarding';
import { pagesPlatform } from '@/i18n/pagesPlatform';
import { EmptyState, ErrorBlock, LoadingBlock, Panel } from '@/components/admin/ui';
import { fmtDate, toastError } from '@/components/admin/labels';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select, Textarea } from '@/components/ui/Field';
import type { BadgeTone } from '@/components/ui/status';

registerCopy(pagesOnboarding);
registerCopy(pagesPlatform); // interest labels (platform.features.*.t)

type Stage = 'demo_requested' | 'demo_done' | 'trial' | 'customer' | 'lost';
interface Lead {
  id: string;
  inquiryId: string | null;
  stage: Stage;
  agencyName: string;
  country: string | null;
  website: string | null;
  teamSize: string | null;
  interests: string[] | null;
  demoAt: string | null;
  staffNotes: string | null;
  createdAt: string;
  contact: { name: string; email: string; phone: string | null; locale: string; message: string } | null;
  customer: { id: string; name: string; status: string; domain: string } | null;
}
interface LeadsView {
  items: Lead[];
  counts: Record<Stage, number>;
  stages: Stage[];
}

const TONE: Record<Stage, BadgeTone> = { demo_requested: 'info', demo_done: 'warning', trial: 'info', customer: 'success', lost: 'neutral' };
/** Moves the server accepts (lib/saas/pipeline.ts canMove): one step forward / back, to / from lost. */
const ORDER: Stage[] = ['demo_requested', 'demo_done', 'trial', 'customer'];
const movesFrom = (s: Stage): Stage[] =>
  s === 'lost' ? [...ORDER] : [ORDER[ORDER.indexOf(s) - 1], ORDER[ORDER.indexOf(s) + 1], 'lost'].filter((x): x is Stage => !!x && x !== s);
const toLocalInput = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '');

/** System → Customers (owner instance): SaaS sales pipeline of the /platform demo requests. */
export const SaasPipeline = ({ onCustomersChanged }: { onCustomersChanged: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['saas-leads'], queryFn: async () => (await api.get<LeadsView>('/admin/saas-leads')).data });
  const [filter, setFilter] = useState<Stage | ''>('');
  const save = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => (await api.patch(`/admin/saas-leads/${id}`, patch)).data,
    onSuccess: (_d, vars) => {
      void qc.invalidateQueries({ queryKey: ['saas-leads'] });
      if ('stage' in vars.patch) onCustomersChanged();
      toast.success(t('saas.saved'));
    },
    onError: (e) => toastError(e),
  });

  return (
    <Panel id="saas-pipeline" title={t('saas.title')} icon={Filter}>
      <p className="mb-4 text-sm text-muted">{t('saas.intro')}</p>
      {q.isError ? (
        <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={t('saas.move')}>
            <Button size="sm" variant={filter === '' ? 'primary' : 'secondary'} onClick={() => setFilter('')}>
              {q.data.items.length}
            </Button>
            {q.data.stages.map((s) => (
              <Button key={s} size="sm" variant={filter === s ? 'primary' : 'secondary'} onClick={() => setFilter(s)}>
                {t(`saas.stages.${s}`)} · {q.data.counts[s]}
              </Button>
            ))}
          </div>
          {q.data.items.length === 0 ? (
            <EmptyState icon={Filter} title={t('saas.empty')} />
          ) : (
            <ul className="grid gap-3 lg:grid-cols-2">
              {q.data.items
                .filter((l) => !filter || l.stage === filter)
                .map((l) => (
                  <LeadCard key={l.id} lead={l} busy={save.isPending && save.variables?.id === l.id} onSave={(patch) => save.mutate({ id: l.id, patch })} />
                ))}
            </ul>
          )}
        </>
      )}
    </Panel>
  );
};

const LeadCard = ({ lead, busy, onSave }: { lead: Lead; busy: boolean; onSave: (patch: Record<string, unknown>) => void }) => {
  const { t } = useTranslation();
  const [demoAt, setDemoAt] = useState(toLocalInput(lead.demoAt));
  const [notes, setNotes] = useState(lead.staffNotes ?? '');
  return (
    <li className="rounded-xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-ink">{lead.agencyName}</p>
          <p className="text-xs text-muted">
            {[lead.country, lead.teamSize ? `${t('saas.teamSize')}: ${lead.teamSize}` : null, fmtDate(lead.createdAt)].filter(Boolean).join(' · ')}
          </p>
        </div>
        <Badge tone={TONE[lead.stage]} dot>
          {t(`saas.stages.${lead.stage}`)}
        </Badge>
      </div>
      {lead.contact ? (
        <p className="mt-2 text-sm text-ink">
          {lead.contact.name} · <a className="text-link underline" href={`mailto:${lead.contact.email}`}>{lead.contact.email}</a>
          {lead.contact.phone ? ` · ${lead.contact.phone}` : ''}
        </p>
      ) : (
        <p className="mt-2 text-xs text-muted">{t('saas.anonymized')}</p>
      )}
      {lead.website && <p className="mt-1 text-xs break-all text-muted">{lead.website}</p>}
      {!!lead.interests?.length && (
        <p className="mt-2 flex flex-wrap gap-1 text-xs">
          <span className="text-muted">{t('saas.interests')}:</span>
          {lead.interests.map((i) => (
            <span key={i} className="rounded bg-sunken px-1.5 py-0.5 text-ink">
              {t(`platform.features.${i}.t`)}
            </span>
          ))}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs">
        {lead.inquiryId && (
          <Link className="text-link underline" to={`/admin/inquiries?open=${lead.inquiryId}`}>
            {t('saas.lead')}
          </Link>
        )}
        {lead.customer && (
          <span className="text-ink">
            {t('saas.customer')}: <strong>{lead.customer.name}</strong> ({t(`wl.customers.statuses.${lead.customer.status}`)})
          </span>
        )}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label={t('saas.move')}>
          <Select value="" disabled={busy} onChange={(e) => e.target.value && onSave({ stage: e.target.value })}>
            <option value="">{t(`saas.stages.${lead.stage}`)}</option>
            {movesFrom(lead.stage).map((s) => (
              <option key={s} value={s}>
                → {t(`saas.stages.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t('saas.demoAt')}>
          <Input type="datetime-local" value={demoAt} onChange={(e) => setDemoAt(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Field label={t('saas.notes')}>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} />
          </Field>
        </div>
      </div>
      <div className="mt-3">
        <Button size="sm" variant="secondary" icon={Save} loading={busy} onClick={() => onSave({ demoAt: demoAt ? new Date(demoAt).toISOString() : null, staffNotes: notes })}>
          {t('saas.save')}
        </Button>
      </div>
    </li>
  );
};
