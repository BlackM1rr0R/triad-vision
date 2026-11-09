import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useSiteContent } from '@/lib/content';
import { useL10n } from '@/lib/l10n';
import type { CaseDetail } from '@/lib/types';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { toastError } from '../labels';
import { useCaseRefresh } from './shared';
import { useCompanyOptions, useJobsCopy, useVacancyOptions, type CaseLink } from './caseLinks';
import { FolderField, type FolderInfo } from '@/components/vacancyFolders/FolderPicker'; // vacancy folder of the client folder

/**
 * "Edit details" of the case (visa category, employer, vacancy, drive folder) — was the inline form of the old header.
 * The profession is no free text any more: it follows the vacancy (server side); an old free-text value stays readable.
 */
export const CaseDetailsDialog = ({ c, open, onClose }: { c: CaseDetail; open: boolean; onClose: () => void }) => {
  const { t } = useTranslation();
  const { tr } = useL10n();
  const refresh = useCaseRefresh(c.id);
  const { data: content } = useSiteContent();
  const link = c as CaseDetail & CaseLink;
  const [visaId, setVisaId] = useState(c.visaCategory?.id ?? '');
  const [companyId, setCompanyId] = useState(link.companyId ?? '');
  const [vacancyId, setVacancyId] = useState(link.vacancyId ?? '');
  // Folder the client folder lives in (default: the vacancy's folder; null = Anträge / Partner). Sent only when changed.
  const initialParent = (c as CaseDetail & { driveFolders?: { parent: FolderInfo | null } }).driveFolders?.parent ?? null;
  const [parent, setParent] = useState<FolderInfo | null>(initialParent);
  const [parentTouched, setParentTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  useJobsCopy(open);
  const { data: companies } = useCompanyOptions(open);
  const { data: vacancies } = useVacancyOptions(open);

  const visaOptions = content?.visaCategories ?? [];
  const currentMissing = c.visaCategory && !visaOptions.some((v) => v.id === c.visaCategory?.id);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/admin/cases/${c.id}`, {
        visaCategoryId: visaId || null,
        companyId: companyId || null,
        vacancyId: vacancyId || null,
        ...(parentTouched ? { driveParentId: parent?.id ?? null } : {}),
      });
      await refresh();
      onClose();
      toast.success(t('admin.case.header.updated'));
    } catch (err) {
      toastError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('caseLayout.edit.title')}
      description={t('caseLayout.edit.description')}
      busy={saving}
      size="lg"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      footer={
        <>
          <Button variant="secondary" size="sm" onClick={onClose} disabled={saving}>
            {t('admin.common.cancel')}
          </Button>
          <Button type="submit" size="sm" loading={saving}>
            {t('admin.common.save')}
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="label">{t('admin.case.header.profession')}</span>
          <p className="min-h-10 rounded-lg bg-sunken px-3 py-2 text-sm text-ink">{c.profession}</p>
          <p className="mt-1 text-xs text-muted">{t('vacFolders.position.hint')}</p>
        </div>
        <div>
          <label htmlFor="ed-visa" className="label">
            {t('admin.case.header.visaCategory')}
          </label>
          <select id="ed-visa" className="input" value={visaId} onChange={(e) => setVisaId(e.target.value)}>
            <option value="">{t('admin.case.header.notSelected')}</option>
            {currentMissing && c.visaCategory && <option value={c.visaCategory.id}>{tr(c.visaCategory.title)}</option>}
            {visaOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {tr(v.title)} ({v.visaLabel})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ed-company" className="label">
            {t('jobsArea.admin.caseLink.company')}
          </label>
          <select
            id="ed-company"
            className="input"
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              if (vacancyId && vacancies?.find((x) => x.id === vacancyId)?.companyId !== e.target.value) setVacancyId('');
            }}
          >
            <option value="">{t('admin.case.header.notSelected')}</option>
            {link.companyId && !companies && <option value={link.companyId}>…</option>}
            {companies?.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ed-vacancy" className="label">
            {t('jobsArea.admin.caseLink.vacancy')}
          </label>
          <select
            id="ed-vacancy"
            className="input"
            value={vacancyId}
            onChange={(e) => {
              setVacancyId(e.target.value);
              const owner = vacancies?.find((x) => x.id === e.target.value)?.companyId;
              if (owner) setCompanyId(owner);
            }}
          >
            <option value="">{t('admin.case.header.notSelected')}</option>
            {link.vacancyId && !vacancies && <option value={link.vacancyId}>…</option>}
            {vacancies
              ?.filter((x) => !companyId || x.companyId === companyId || x.id === vacancyId)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {tr(x.title)}
                </option>
              ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <span className="label">{t('vacFolders.case.parent')}</span>
          <FolderField
            value={parent}
            empty={t('vacFolders.case.parentDefault')}
            clearLabel={t('vacFolders.app.reset')}
            onChange={(f) => {
              setParent(f);
              setParentTouched(true);
            }}
          />
          <p className="mt-1 text-xs text-muted">{t('vacFolders.case.parentHint')}</p>
        </div>
      </div>
    </Modal>
  );
};

export default CaseDetailsDialog;
