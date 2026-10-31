import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Clock, ExternalLink, Landmark, ListChecks, Mail, MapPin, Phone, Plus, X } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button, IconButton } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { confirmDialog } from '@/components/ui/confirmStore';
import { registerCopy } from '@/i18n';
import { pagesAuthorities } from '@/i18n/pagesAuthorities';
import { api } from '@/lib/api';
import { authorityError, authorityPlace, safeUrl, type AuthorityOption, type CaseAuthorities, type CaseAuthorityInfo } from './api';

registerCopy(pagesAuthorities);

const caseKey = (caseId: string) => ['admin', 'authorities', 'case', caseId] as const;

/** Address, contact channels, waiting time and requirements of one linked authority. */
const AuthorityInfo = ({ a }: { a: CaseAuthorityInfo }) => {
  const { t } = useTranslation();
  const url = safeUrl(a.website);
  const days = a.waiting.effectiveDays;
  return (
    <div className="mt-2 space-y-1.5 rounded-xl bg-sunken/60 p-3 text-xs text-ink">
      <p className="flex flex-wrap items-center gap-1.5">
        <Link to={`/admin/authorities/${a.id}`} className="font-semibold hover:underline">
          {a.name}
        </Link>
        {authorityPlace(a) && <span className="text-muted">· {authorityPlace(a)}</span>}
        {!a.active && <Badge tone="neutral" size="sm">{t('authorities.inactive')}</Badge>}
      </p>
      {a.address && (
        <p className="flex items-start gap-1.5">
          <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted" aria-hidden />
          <span className="whitespace-pre-line">{a.address}</span>
        </p>
      )}
      {(a.phone || a.email || url) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {a.phone && (
            <a href={`tel:${a.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 text-link hover:underline">
              <Phone className="size-3.5" aria-hidden /> {a.phone}
            </a>
          )}
          {a.email && (
            <a href={`mailto:${a.email}`} className="inline-flex items-center gap-1 break-all text-link hover:underline">
              <Mail className="size-3.5" aria-hidden /> {a.email}
            </a>
          )}
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-link hover:underline">
              <ExternalLink className="size-3.5" aria-hidden /> {url.replace(/^https?:\/\//i, '')}
            </a>
          )}
        </p>
      )}
      {(days !== null || a.checklist.length > 0) && (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
          {days !== null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" aria-hidden /> {t('authorities.case.waiting', { count: days })}
            </span>
          )}
          {a.checklist.length > 0 && (
            <span className="inline-flex items-center gap-1">
              <ListChecks className="size-3.5" aria-hidden /> {t('authorities.case.checklistCount', { count: a.checklist.length })}
            </span>
          )}
        </p>
      )}
      {a.requirements && (
        <details>
          <summary className="cursor-pointer font-medium text-ink">{t('authorities.detail.requirements')}</summary>
          <p className="mt-1 whitespace-pre-line">{a.requirements}</p>
          {a.checklist.length > 0 && (
            <ul className="mt-1.5 list-inside list-disc">
              {a.checklist.map((c, i) => (
                <li key={i}>
                  {c.label}
                  {!c.required && <span className="text-muted"> ({t('authorities.f.optional')})</span>}
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
    </div>
  );
};

/**
 * Admin case view (Ümumi tab, #case-authorities): embassy and Ausländerbehörde of the case picked from the
 * authorities catalogue, further authorities (Agentur für Arbeit, recognition body …) and their key info.
 */
export default function CaseAuthoritiesCard({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [otherId, setOtherId] = useState('');
  const [note, setNote] = useState('');
  const card = useQuery({ queryKey: caseKey(caseId), queryFn: async () => (await api.get<CaseAuthorities>(`/admin/authorities/cases/${caseId}`)).data });
  const options = useQuery({
    queryKey: ['admin', 'authorities', 'options'],
    queryFn: async () => (await api.get<{ items: AuthorityOption[] }>('/admin/authorities/options')).data.items,
    staleTime: 60_000,
  });
  const onError = (err: unknown) => toast.error(t(`authorities.errors.${authorityError(err)}`, { defaultValue: t('authorities.errors.generic') }));
  const onData = (data: CaseAuthorities) => {
    qc.setQueryData(caseKey(caseId), data);
    void qc.invalidateQueries({ queryKey: ['admin', 'authorities'], exact: false, refetchType: 'none' });
  };
  const setMain = useMutation({
    mutationFn: async (body: { embassyAuthorityId?: string | null; abhAuthorityId?: string | null }) => (await api.put<CaseAuthorities>(`/admin/authorities/cases/${caseId}`, body)).data,
    onSuccess: onData,
    onError,
  });
  const addOther = useMutation({
    mutationFn: async () => (await api.post<CaseAuthorities>(`/admin/authorities/cases/${caseId}/links`, { authorityId: otherId, note: note.trim() || null })).data,
    onSuccess: (data) => {
      onData(data);
      setAdding(false);
      setOtherId('');
      setNote('');
    },
    onError,
  });
  const removeOther = useMutation({
    mutationFn: async (authorityId: string) => (await api.delete<CaseAuthorities>(`/admin/authorities/cases/${caseId}/links/${authorityId}`)).data,
    onSuccess: onData,
    onError,
  });

  const data = card.data;
  const opts = options.data ?? [];
  if (card.isLoading || !data) return null;
  const label = (o: { name: string; city: string | null }) => (o.city ? `${o.name} (${o.city})` : o.name);
  const linkedIds = new Set([data.embassy?.id, data.abh?.id, ...data.others.map((o) => o.id)].filter(Boolean));
  const otherOpts = opts.filter((o) => !linkedIds.has(o.id));

  const slot = (key: 'embassy' | 'abh', type: 'EMBASSY' | 'AUSLAENDERBEHOERDE') => {
    const current = data[key];
    const choices = opts.filter((o) => o.type === type);
    // An inactive authority that is still linked stays selectable as the current value.
    const withCurrent = current && !choices.some((o) => o.id === current.id) ? [{ id: current.id, type, name: current.name, city: current.city, country: current.country }, ...choices] : choices;
    const field = key === 'embassy' ? 'embassyAuthorityId' : 'abhAuthorityId';
    return (
      <div>
        <label className="block">
          <span className="label">{t(`authorities.case.${key}`)}</span>
          <select className="input" value={current?.id ?? ''} disabled={setMain.isPending} onChange={(e) => setMain.mutate({ [field]: e.target.value || null })}>
            <option value="">{t('authorities.case.none')}</option>
            {withCurrent.map((o) => (
              <option key={o.id} value={o.id}>
                {label(o)}
              </option>
            ))}
          </select>
        </label>
        {current && <AuthorityInfo a={current} />}
      </div>
    );
  };

  return (
    <div id="case-authorities" className="scroll-mt-40">
      <Card
        title={t('authorities.case.title')}
        subtitle={t('authorities.case.subtitle')}
        icon={Landmark}
        actions={
          <Link to="/admin/authorities" className="text-xs font-medium text-link hover:underline">
            {t('authorities.case.toCatalogue')}
          </Link>
        }
      >
        {!opts.length && !linkedIds.size ? (
          <p className="text-sm text-muted">
            {t('authorities.case.emptyCatalogue')}{' '}
            <Link to="/admin/authorities" className="text-link hover:underline">
              {t('authorities.case.toCatalogue')}
            </Link>
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {slot('embassy', 'EMBASSY')}
              {slot('abh', 'AUSLAENDERBEHOERDE')}
            </div>
            {!data.embassy && data.appointmentPlace && <p className="text-xs text-muted">{t('authorities.case.placeHint', { place: data.appointmentPlace })}</p>}

            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink">{t('authorities.case.others')}</h3>
              {data.others.map((o) => (
                <div key={o.id} className="relative">
                  <div className="absolute top-2 right-2">
                    <IconButton
                      icon={X}
                      size="sm"
                      label={t('authorities.case.removeOther', { name: o.name })}
                      onClick={async () => {
                        if (await confirmDialog({ message: t('authorities.case.removeOther', { name: o.name }), tone: 'primary' })) removeOther.mutate(o.id);
                      }}
                    />
                  </div>
                  <AuthorityInfo a={o} />
                  {o.note && <p className="mt-1 text-xs text-muted">{o.note}</p>}
                </div>
              ))}
              {adding ? (
                <form
                  className="mt-2 flex flex-wrap items-end gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (otherId) addOther.mutate();
                  }}
                >
                  <label className="block min-w-48 flex-1">
                    <span className="sr-only">{t('authorities.case.addOther')}</span>
                    <select className="input" required value={otherId} onChange={(e) => setOtherId(e.target.value)}>
                      <option value="">{t('authorities.case.none')}</option>
                      {otherOpts.map((o) => (
                        <option key={o.id} value={o.id}>
                          {t(`authorities.types.${o.type}`)} · {label(o)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block min-w-40 flex-1">
                    <span className="sr-only">{t('authorities.case.notePlaceholder')}</span>
                    <input className="input" maxLength={300} placeholder={t('authorities.case.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />
                  </label>
                  <Button type="submit" size="sm" loading={addOther.isPending} disabled={!otherId}>
                    {t('authorities.case.add')}
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>
                    {t('common.cancel')}
                  </Button>
                </form>
              ) : (
                otherOpts.length > 0 && (
                  <Button variant="secondary" size="sm" icon={Plus} className="mt-2" onClick={() => setAdding(true)}>
                    {t('authorities.case.addOther')}
                  </Button>
                )
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
