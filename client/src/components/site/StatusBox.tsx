import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowRight, ListChecks } from 'lucide-react';
import { registerCopy } from '@/i18n';

// Only the box's three texts (the full status copy ships with /status, pagesSite).
registerCopy({
  az: { site: { statusBox: { title: 'Müraciətinizin statusu', text: 'Müraciət nömrəsi və doğum tarixi ilə daxil olmadan yoxlayın.', cta: 'Statusu yoxla' } } },
  de: { site: { statusBox: { title: 'Status Ihres Antrags', text: 'Ohne Anmeldung prüfen — mit Antragsnummer und Geburtsdatum.', cta: 'Status prüfen' } } },
  en: { site: { statusBox: { title: 'Your application status', text: 'Check it without logging in — with the case number and date of birth.', cta: 'Check status' } } },
  ru: { site: { statusBox: { title: 'Статус вашей заявки', text: 'Проверьте без входа — по номеру заявки и дате рождения.', cta: 'Проверить статус' } } },
});

/** Small "check your status" box (contact page) linking to the public status check /status. */
export const StatusBox = () => {
  const { t } = useTranslation();
  return (
    <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:p-6">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl chip-sage">
        <ListChecks className="size-5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="type-card-title text-ink">{t('site.statusBox.title')}</p>
        <p className="text-sm text-muted">{t('site.statusBox.text')}</p>
      </div>
      <Link to="/status" className="btn-secondary min-h-11 shrink-0">
        {t('site.statusBox.cta')}
        <ArrowRight className="size-4" aria-hidden />
      </Link>
    </div>
  );
};
