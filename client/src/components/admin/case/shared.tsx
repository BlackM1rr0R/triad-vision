import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Download, ExternalLink, FileText, Image as ImageIcon } from 'lucide-react';
import { api, fileUrl, formatBytes } from '@/lib/api';
import type { CaseDetail, CaseDocument, DocStage, Requirement } from '@/lib/types';
import { toastError } from '../labels';

export const caseKey = (id: string) => ['admin-case', id] as const;

export type ActionBody =
  | { action: 'REQUEST_CHANGES'; note: string }
  | { action: 'REJECT_SIGNATURE'; note: string }
  | { action: 'CONFIRM_CONTRACT' }
  | { action: 'SCHEDULE_APPOINTMENT'; at: string; place: string; note?: string }
  | { action: 'MARK_LODGED' }
  | { action: 'DECIDE'; decision: 'APPROVED' | 'REJECTED'; reason?: string; validFrom?: string; validTo?: string }
  | { action: 'CANCEL'; reason: string }
  | { action: 'REOPEN'; to: 'DOCUMENTS_PENDING' | 'EMBASSY_DOCUMENTS'; note?: string };

/** Invalidate the case detail and every list/aggregate that depends on it. */
export const useCaseRefresh = (id: string) => {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: caseKey(id) }),
      qc.invalidateQueries({ queryKey: ['admin-cases'] }),
      qc.invalidateQueries({ queryKey: ['admin-dashboard'] }),
    ]);
};

export const useCaseAction = (id: string) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: ActionBody) => (await api.post<{ case: CaseDetail }>(`/admin/cases/${id}/actions`, body)).data.case,
    onSuccess: (c) => {
      qc.setQueryData(caseKey(id), c);
      void qc.invalidateQueries({ queryKey: ['admin-cases'] });
      void qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
      toast.success('Əməliyyat yerinə yetirildi. Müştəriyə bildiriş göndərildi.');
    },
    onError: (err) => toastError(err),
  });
};

export const uploadCaseDocument = async (
  caseId: string,
  file: File,
  stage: Exclude<DocStage, 'CONTRACT_SIGNED'>,
  requirementId?: string,
) => {
  const fd = new FormData();
  fd.append('stage', stage);
  if (requirementId) fd.append('requirementId', requirementId);
  fd.append('file', file);
  return (await api.post<{ document: CaseDocument }>(`/admin/cases/${caseId}/documents`, fd)).data.document;
};

export const stageRequirements = (c: CaseDetail, stage: 'INITIAL' | 'EMBASSY') =>
  c.requirements.filter((r) => r.stage === stage).sort((a, b) => a.sortOrder - b.sortOrder);

export const isAccepted = (r: Requirement) => r.documents.some((d) => d.status === 'ACCEPTED');

/** Required requirements of a stage that still have no accepted document (server precondition). */
export const missingAccepted = (c: CaseDetail, stage: 'INITIAL' | 'EMBASSY') =>
  stageRequirements(c, stage).filter((r) => r.required && !isAccepted(r));

export const DocIcon = ({ mime, className }: { mime: string; className?: string }) =>
  mime.startsWith('image/') ? <ImageIcon className={className} aria-hidden /> : <FileText className={className} aria-hidden />;

/** Open-in-new-tab and download links for a stored document. */
export const DocLinks = ({ doc }: { doc: CaseDocument }) => (
  <span className="inline-flex shrink-0 items-center">
    <a
      href={fileUrl(doc.id)}
      target="_blank"
      rel="noreferrer"
      className="grid size-10 place-items-center rounded-lg lg:size-8 text-muted transition hover:bg-brand-50 hover:text-brand-700"
      title="Aç"
      aria-label={`${doc.originalName} — aç`}
    >
      <ExternalLink className="size-3.5" />
    </a>
    <a
      href={fileUrl(doc.id, true)}
      className="grid size-10 place-items-center rounded-lg lg:size-8 text-muted transition hover:bg-brand-50 hover:text-brand-700"
      title="Yüklə"
      aria-label={`${doc.originalName} — yüklə`}
    >
      <Download className="size-3.5" />
    </a>
  </span>
);

export const DocMeta = ({ doc }: { doc: CaseDocument }) => (
  <span className="block truncate text-[11px] text-muted">
    {formatBytes(doc.size)} · {new Intl.DateTimeFormat('az-Latn-AZ', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(doc.createdAt))}
  </span>
);
