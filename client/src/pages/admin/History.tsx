import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { registerCopy } from '@/i18n';
import { pagesHistory } from '@/i18n/pagesHistory';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageHead, Panel } from '@/components/admin/ui';
import { HistoryTimeline } from '@/components/history/HistoryTimeline';
import { HISTORY_ENTITIES, type HistoryEntity } from '@/components/history/shared';

registerCopy(pagesHistory);

/** Admin → Changes: field history across cases, users and companies, with filters and one-click revert (ADMIN+). */
export default function AdminHistory() {
  const { t } = useTranslation();
  usePageTitle(t('history.pageTitle'));
  const [params] = useSearchParams();
  const entityParam = params.get('entity');
  const entity = HISTORY_ENTITIES.includes(entityParam as HistoryEntity) ? (entityParam as HistoryEntity) : undefined;
  const entityId = params.get('entityId') ?? undefined;
  return (
    <div>
      <PageHead title={t('history.pageTitle')} subtitle={t('history.pageSubtitle')} />
      <Panel bodyClassName="p-4 sm:p-6">
        <HistoryTimeline
          key={`${entity ?? ''}:${entityId ?? ''}`}
          showEntity
          showEntityFilter
          pageSize={50}
          initial={entity ? { entity, ...(entityId ? { entityId } : {}) } : {}}
        />
      </Panel>
    </div>
  );
}
