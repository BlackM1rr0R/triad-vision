import clsx from 'clsx';
import { useTranslation } from 'react-i18next';
import { Archive } from 'lucide-react';
import { registerCopy } from '@/i18n';

// Case.documentsPurgedAt: the retention job (server/src/jobs/retention.ts) deleted the files of this closed case.
registerCopy({
  az: { docsPurged: { title: 'Sənədlər saxlama müddəti bitdiyi üçün silinib', staff: '{{date}} tarixində bu müraciətin faylları saxlama qaydasına (DSGVO) uyğun olaraq avtomatik silindi. Siyahılar və tarixçə qalır, fayllar isə artıq açılmır.', client: '{{date}} tarixində bu müraciətin sənədləri məlumatların qorunması qaydasına uyğun olaraq silindi. Sənədə yenidən ehtiyac olarsa, menecerinizə yazın.' } },
  de: { docsPurged: { title: 'Dokumente nach Ablauf der Aufbewahrungsfrist gelöscht', staff: 'Am {{date}} wurden die Dateien dieser Akte gemäß Aufbewahrungsregel (DSGVO) automatisch gelöscht. Listen und Verlauf bleiben erhalten, die Dateien lassen sich nicht mehr öffnen.', client: 'Am {{date}} wurden die Dokumente dieses Antrags gemäß Datenschutz gelöscht. Wenn Sie ein Dokument erneut brauchen, schreiben Sie Ihrer Betreuerin / Ihrem Betreuer.' } },
  en: { docsPurged: { title: 'Documents removed after the retention period', staff: 'On {{date}} the files of this case were deleted automatically under the retention rule (GDPR). Lists and history remain; the files can no longer be opened.', client: 'On {{date}} the documents of this case were deleted under our data-protection rules. If you need a document again, message your case manager.' } },
  ru: { docsPurged: { title: 'Документы удалены по истечении срока хранения', staff: '{{date}} файлы этого дела были автоматически удалены по правилу хранения (GDPR). Списки и история сохранены, файлы больше не открываются.', client: '{{date}} документы этого обращения были удалены согласно правилам защиты данных. Если документ снова понадобится, напишите вашему менеджеру.' } },
});

/** Notice shown above case documents when the retention job removed the files (admin case tab and client portal). */
export function DocumentsPurgedNotice({ at, audience, className }: { at: string | Date | null | undefined; audience: 'staff' | 'client'; className?: string }) {
  const { t, i18n } = useTranslation();
  if (!at) return null;
  const lang = i18n.language === 'az' ? 'az-Latn-AZ' : i18n.language;
  const date = new Date(at).toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric' });
  return (
    <div role="status" data-testid="documents-purged" className={clsx('flex items-start gap-3 rounded-xl border border-warning-border bg-warning-bg p-3.5 text-sm text-warning-fg', className)}>
      <Archive className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="min-w-0">
        <span className="font-semibold">{t('docsPurged.title')}.</span> {t(`docsPurged.${audience}`, { date })}
      </p>
    </div>
  );
}
