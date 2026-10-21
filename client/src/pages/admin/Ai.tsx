import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Inbox, Settings } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAi } from '@/i18n/pagesAi';
import { pagesAiMail } from '@/i18n/pagesAiMail';
import { usePageTitle } from '@/lib/usePageTitle';
import { ChatPanel } from '@/components/ai';

registerCopy(pagesAi);
registerCopy(pagesAiMail);

/** /admin/ai — the super admin's operations assistant, full page. */
export default function AdminAi() {
  const { t } = useTranslation();
  usePageTitle(t('ai.assistant'));
  return (
    <div className="flex h-[calc(100dvh-9rem)] min-h-[28rem] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-ink sm:text-2xl">{t('ai.assistant')}</h1>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/admin/ai/mail-triage" className="btn btn-sm border border-line bg-card text-ink hover:bg-surface">
            <Inbox className="size-3.5" aria-hidden /> {t('aiMail.settings.openSettings')}
          </Link>
          <Link to="/admin/ai/settings" className="btn btn-sm border border-line bg-card text-ink hover:bg-surface">
            <Settings className="size-3.5" aria-hidden /> {t('admin.nav.settings')}
          </Link>
        </div>
      </div>
      <ChatPanel scope="ADMIN" className="min-h-0 flex-1 rounded-xl border border-line shadow-[0_1px_2px_rgba(11,31,68,0.04)]" />
    </div>
  );
}
