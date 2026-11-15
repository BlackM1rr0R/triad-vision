import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Award, ExternalLink, RotateCcw, ShieldOff } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { registerCopy } from '@/i18n';
import { pagesMilestoneDocs } from '@/i18n/pagesMilestoneDocs';

registerCopy(pagesMilestoneDocs);

interface StaffCertificate {
  id: string;
  number: string;
  issuedAt: string;
  arrivedAt: string;
  revokedAt: string | null;
  revokeReason: string | null;
  verifyUrl: string;
}

/** Staff side of the "Welcome to Germany" certificate in the arrival drawer: status, revoke / restore (audited). */
export function StaffArrivalCertificate({ caseId }: { caseId: string }) {
  const { t, i18n } = useTranslation();
  const a = (k: string, o?: Record<string, unknown>) => String(t(`milestones.admin.${k}`, o));
  const qc = useQueryClient();
  const key = ['admin-arrival-certificate', caseId];
  const [reason, setReason] = useState('');
  const q = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ certificate: StaffCertificate | null }>('/admin/arrival-certificates', { params: { caseId } })).data.certificate });
  const change = useMutation({
    mutationFn: async (action: 'revoke' | 'restore') => (await api.post<{ certificate: StaffCertificate }>(`/admin/arrival-certificates/${q.data!.id}/${action}`, action === 'revoke' ? { reason: reason.trim() || undefined } : {})).data.certificate,
    onSuccess: (cert) => {
      qc.setQueryData(key, cert);
      setReason('');
      toast.success(a('done'));
    },
    onError: () => toast.error(a('error')),
  });
  const fmt = (iso: string) => new Intl.DateTimeFormat(i18n.resolvedLanguage ?? 'az', { dateStyle: 'medium' }).format(new Date(iso));
  const cert = q.data;

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <Award className="size-4" aria-hidden /> {a('title')}
      </h3>
      {q.isLoading ? null : !cert ? (
        <p className="mt-2 text-sm text-muted">{a('none')}</p>
      ) : (
        <div className="mt-2 space-y-3 text-sm">
          <p className="text-ink">
            <span className="font-semibold">{cert.number}</span> · {a('issued', { date: fmt(cert.issuedAt) })}
          </p>
          {cert.revokedAt ? (
            <>
              <p className="text-danger-fg">
                {a('revokedAt', { date: fmt(cert.revokedAt) })}
                {cert.revokeReason ? ` — ${cert.revokeReason}` : ''}
              </p>
              <Button variant="secondary" size="sm" icon={RotateCcw} loading={change.isPending} onClick={() => change.mutate('restore')}>
                {a('restore')}
              </Button>
            </>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="block min-w-0 flex-1">
                <span className="label">{a('reason')}</span>
                <input className="input" maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} />
              </label>
              <Button variant="secondary" size="sm" icon={ShieldOff} className="text-danger-fg" loading={change.isPending} onClick={() => change.mutate('revoke')}>
                {a('revoke')}
              </Button>
              <a href={cert.verifyUrl} target="_blank" rel="noopener" className="inline-flex min-h-10 items-center gap-1 px-2 text-sm font-semibold text-link hover:underline">
                <ExternalLink className="size-4" aria-hidden /> {a('open')}
              </a>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default StaffArrivalCertificate;
