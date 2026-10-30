import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { GraduationCap, Maximize2 } from 'lucide-react';
import { useL10n } from '@/lib/l10n';
import { registerCopy } from '@/i18n';
import { pagesFamilyLanguage } from '@/i18n/pagesFamilyLanguage';
import { pagesJourney } from '@/i18n/pagesJourney';
import { pagesGermanVocab } from '@/i18n/pagesGermanVocab';
import { useApiError } from '@/components/portal/useApiError';
import { Modal } from '@/components/admin/Modal';
import { DefRow, Panel } from '@/components/admin/ui';
import { useGermanOverview, useGermanWrite, useStaffPractice } from './api';
import { GermanProgressBoard, LevelProgress } from './GermanProgressBoard';
import { ActivityBars } from './VocabTrainer';
import { levelLabel, PROFILE_LEVELS } from './types';

registerCopy(pagesJourney);
registerCopy(pagesFamilyLanguage);
registerCopy(pagesGermanVocab);

/**
 * Admin case page sidebar: the candidate's German level (User.germanLevel — the value matching and vacancies
 * use; staff may set it), progress to the goal, next exam and last result; the full board opens in a dialog.
 */
export const GermanStaffPanel = ({ userId }: { userId: string }) => {
  const { t } = useTranslation();
  const { dateTime } = useL10n();
  const apiError = useApiError();
  const write = useGermanWrite(userId);
  const { data: ov } = useGermanOverview(userId);
  const { data: practice } = useStaffPractice(userId);
  const [open, setOpen] = useState(false);
  if (!ov) return null;
  const vocab = practice?.vocab;

  const now = Date.now();
  const next = ov.exams
    .filter((e) => e.examDate && new Date(e.examDate).getTime() >= now && e.status !== 'CANCELLED')
    .sort((a, b) => a.examDate!.localeCompare(b.examDate!))[0];
  const last = ov.exams.find((e) => e.passed !== null);

  const setLevel = async (level: string) => {
    try {
      await write('put', '/level', { level });
      toast.success(t('germanProgress.staff.levelSaved'));
    } catch (err) {
      apiError(err);
    }
  };

  return (
    <Panel
      title={t('germanProgress.staff.title')}
      icon={GraduationCap}
      id="case-german"
      actions={
        <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)} aria-label={t('germanProgress.title')}>
          <Maximize2 className="size-3.5" aria-hidden />
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label htmlFor="gs-level" className="label">
            {t('germanProgress.staff.setLevel')}
          </label>
          <select id="gs-level" className="input" value={ov.level} onChange={(e) => void setLevel(e.target.value)}>
            {PROFILE_LEVELS.map((l) => (
              <option key={l} value={l}>
                {levelLabel(l)}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] text-muted">{t('germanProgress.staff.levelHint')}</p>
        </div>
        <LevelProgress ov={ov} compact />
        <dl className="space-y-1 text-sm">
          {ov.requiredLevel && <DefRow label={t('journey.german.required')}>{ov.requiredLevel}</DefRow>}
          <DefRow label={t('germanProgress.staff.nextExam')}>
            {next ? `${t(`germanProgress.exams.providers.${next.provider}`)} ${next.level} · ${dateTime(next.examDate!)}` : '—'}
          </DefRow>
          <DefRow label={t('germanProgress.staff.lastResult')}>
            {last ? `${t(`germanProgress.exams.providers.${last.provider}`)} ${last.level} · ${last.passed ? t('germanProgress.exams.passed') : t('germanProgress.exams.failed')}` : '—'}
          </DefRow>
          <DefRow label={t('germanProgress.courses.title')}>{ov.courses.length}</DefRow>
        </dl>
        {practice && vocab && (
          <div className="space-y-3 border-t border-line pt-4">
            <h3 className="text-xs font-semibold text-muted uppercase">{t('germanVocab.staff.title')}</h3>
            <dl className="space-y-1 text-sm">
              <DefRow label={t('germanVocab.streak')}>
                {vocab.streak.current} · {t('germanVocab.best', { count: vocab.streak.best })}
              </DefRow>
              <DefRow label={t('germanVocab.staff.lastPractice')}>{vocab.lastPracticeAt ? dateTime(vocab.lastPracticeAt) : t('germanVocab.staff.never')}</DefRow>
              <DefRow label={t('germanVocab.learned')}>
                {vocab.learned} / {vocab.started} · {t('germanVocab.of', { total: vocab.total })}
              </DefRow>
              <DefRow label={t('germanVocab.staff.totalReviews')}>
                {vocab.totals.reviews}
                {vocab.totals.reviews > 0 && ` · ${t('germanVocab.staff.accuracy')} ${Math.round((vocab.totals.correct / vocab.totals.reviews) * 100)}%`}
              </DefRow>
            </dl>
            {vocab.totals.reviews > 0 && <ActivityBars activity={vocab.activity} />}
            <div>
              <h4 className="text-xs font-semibold text-muted">{t('germanVocab.staff.tests')}</h4>
              {practice.attempts.length === 0 ? (
                <p className="mt-1 text-sm text-muted">{t('germanVocab.staff.noTests')}</p>
              ) : (
                <ul className="mt-1 space-y-0.5 text-sm">
                  {practice.attempts.map((a) => (
                    <li key={a.id} className="flex justify-between gap-2">
                      <span className="text-ink">{t('germanVocab.staff.testResult', { level: levelLabel(a.estimated), correct: a.correct, total: a.total, percent: a.percent })}</span>
                      <span className="shrink-0 text-xs text-muted">{dateTime(a.createdAt)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
      <Modal open={open} onClose={() => setOpen(false)} title={`${t('germanProgress.title')} · ${ov.user.firstName} ${ov.user.lastName}`} size="lg">
        {open && <GermanProgressBoard userId={userId} />}
      </Modal>
    </Panel>
  );
};

export default GermanStaffPanel;
