import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { CheckCheck, Copy, Download, ExternalLink, FileArchive, LifeBuoy, PackageCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { useBlobDownload } from '@/components/cv/CvDownloadButton';
import { xappError } from './externalApps';

/**
 * "Send it to the employer yourself" (server autoState CLIENT_SEND, lib/germanyJobs/autoSend.ts): open the direct
 * employer page, download Anschreiben + CV (separately or as ZIP), copy subject / e-mail text / Anschreiben, then
 * confirm "Göndərdim" or ask staff for help. Copy registered by the page (pagesExternalAuto: xauto.portal.client).
 */

export interface ClientSendInfo {
  pageUrl: string;
  direct: boolean;
  employerEmail: string | null;
  subject: string;
  letter: string | null;
  emailText: string;
  hasCv: boolean;
  since: string | null;
  helpAt: string | null;
}

const copyText = async (text: string, done: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(done);
  } catch {
    toast.error(text.slice(0, 120));
  }
};

const StepTitle = ({ n, children }: { n: number; children: React.ReactNode }) => (
  <p className="flex items-center gap-2 font-semibold text-ink">
    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-on-primary" aria-hidden>
      {n}
    </span>
    {children}
  </p>
);

export const ClientSendGuide = ({ appId, info, queryKey }: { appId: string; info: ClientSendInfo; queryKey: readonly unknown[] }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const dl = useBlobDownload();
  const [helpOpen, setHelpOpen] = useState(false);
  const [note, setNote] = useState('');
  const base = `/external-applications/${appId}`;

  const act = useMutation({
    mutationFn: async (v: { path: '/sent' | '/help'; body?: unknown }) => api.post(`${base}${v.path}`, v.body ?? {}),
    onSuccess: async (_r, v) => {
      toast.success(t(v.path === '/sent' ? 'xauto.portal.client.sentDone' : 'xauto.portal.client.helpDone'));
      setHelpOpen(false);
      await qc.invalidateQueries({ queryKey });
    },
    onError: (err) => toast.error(xappError(err)),
  });

  const copied = t('xauto.portal.client.copied');
  return (
    <section className="mt-4 space-y-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-3 text-sm" aria-label={t('xauto.portal.client.title')}>
      <div>
        <p className="flex items-center gap-2 font-semibold text-ink">
          <PackageCheck className="size-4 shrink-0 text-link" aria-hidden /> {t('xauto.portal.client.title')}
        </p>
        <p className="mt-1 text-muted">{info.employerEmail ? t('xauto.portal.client.introEmail', { email: info.employerEmail }) : t('xauto.portal.client.intro')}</p>
        {info.helpAt && <p className="mt-1 text-info-fg">{t('xauto.portal.client.helpAsked')}</p>}
      </div>

      <ol className="space-y-3">
        <li>
          <StepTitle n={1}>{t('xauto.portal.client.step1')}</StepTitle>
          <p className="ml-7 text-xs text-muted">{t('xauto.portal.client.step1Hint')}</p>
          <a href={info.pageUrl} target="_blank" rel="nofollow noopener noreferrer" className="btn-secondary btn-sm ml-7 mt-1.5">
            {t('xauto.portal.client.open')} <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </li>
        <li>
          <StepTitle n={2}>{t('xauto.portal.client.step2')}</StepTitle>
          <p className="ml-7 text-xs text-muted">{t('xauto.portal.client.step2Hint')}</p>
          <div className="ml-7 mt-1.5 flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Download} loading={dl.busy} onClick={() => void dl.run(`${base}/package/cover-letter.pdf`, 'Anschreiben.pdf')}>
              {t('xauto.portal.client.letterPdf')}
            </Button>
            {info.hasCv && (
              <Button size="sm" variant="secondary" icon={Download} loading={dl.busy} onClick={() => void dl.run(`${base}/package/cv`, 'Lebenslauf.pdf')}>
                {t('xauto.portal.client.cvPdf')}
              </Button>
            )}
            <Button size="sm" variant="ghost" icon={FileArchive} loading={dl.busy} onClick={() => void dl.run(`${base}/package.zip`, 'Bewerbung.zip')}>
              {t('xauto.portal.client.zip')}
            </Button>
          </div>
        </li>
        <li>
          <StepTitle n={3}>{t('xauto.portal.client.step3')}</StepTitle>
          <p className="ml-7 text-xs text-muted">{t('xauto.portal.client.step3Hint')}</p>
          <p className="ml-7 mt-1 break-words rounded bg-surface px-2 py-1 font-mono text-xs text-ink">{info.subject}</p>
          <div className="ml-7 mt-1.5 flex flex-wrap gap-2">
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => void copyText(info.subject, copied)}>
              {t('xauto.portal.client.copySubject')}
            </Button>
            <Button size="sm" variant="ghost" icon={Copy} onClick={() => void copyText(info.emailText, copied)}>
              {t('xauto.portal.client.copyEmail')}
            </Button>
            {info.letter && (
              <Button size="sm" variant="ghost" icon={Copy} onClick={() => void copyText(info.letter!, copied)}>
                {t('xauto.portal.client.copyLetter')}
              </Button>
            )}
          </div>
        </li>
        <li>
          <StepTitle n={4}>{t('xauto.portal.client.step4')}</StepTitle>
          <div className="ml-7 mt-1.5 flex flex-wrap gap-2">
            <Button size="sm" icon={CheckCheck} loading={act.isPending} onClick={() => act.mutate({ path: '/sent' })}>
              {t('xauto.portal.client.sent')}
            </Button>
            {!info.helpAt && (
              <Button size="sm" variant="ghost" icon={LifeBuoy} onClick={() => setHelpOpen((v) => !v)} aria-expanded={helpOpen}>
                {t('xauto.portal.client.help')}
              </Button>
            )}
          </div>
          {helpOpen && (
            <form
              className="ml-7 mt-2 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act.mutate({ path: '/help', body: { note: note.trim() || undefined } });
              }}
            >
              <label className="min-w-0 flex-1">
                <span className="sr-only">{t('xauto.portal.client.helpNote')}</span>
                <input className="input" maxLength={500} placeholder={t('xauto.portal.client.helpNote')} value={note} onChange={(e) => setNote(e.target.value)} />
              </label>
              <Button type="submit" size="sm" variant="secondary" loading={act.isPending}>
                {t('xauto.portal.client.helpSend')}
              </Button>
            </form>
          )}
        </li>
      </ol>
    </section>
  );
};
