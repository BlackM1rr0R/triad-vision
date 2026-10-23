import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { CheckCircle2, ChevronRight, ClipboardList, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import type { L10n } from '@/lib/types';
import { clientTasksKey, type FormStatus } from './api';

interface Tasks {
  forms: { id: string; title: L10n; status: FormStatus; sentAt: string; submittedAt: string | null; dueAt: string | null }[];
  confirmation: { id: string; status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED'; requestedAt: string; submittedAt: string | null; fields: number } | null;
}

/** Client case page: questionnaires to fill and the data confirmation, open ones first. Hidden when there is nothing. */
export default function ClientDataTasks({ caseId }: { caseId: string }) {
  const { t } = useTranslation();
  const { tr, date } = useL10n();
  const { data } = useQuery({
    queryKey: clientTasksKey(caseId),
    queryFn: async () => (await api.get<Tasks>(`/client-data/cases/${caseId}/tasks`)).data,
    refetchInterval: 60_000,
  });
  if (!data || (!data.forms.length && !data.confirmation)) return null;
  const open = (s: FormStatus) => s === 'SENT' || s === 'DRAFT';
  const forms = [...data.forms].sort((a, b) => Number(open(b.status)) - Number(open(a.status)));
  const conf = data.confirmation;

  const Row = ({ to, icon: Icon, title, sub, todo }: { to: string; icon: typeof ClipboardList; title: string; sub: string; todo: boolean }) => (
    <li>
      <Link to={to} className={clsx('flex min-h-14 items-center gap-3 rounded-xl border px-4 py-3 transition hover:border-brand-400', todo ? 'border-brand-400/50 bg-brand-50/40 dark:bg-brand-950/20' : 'border-line bg-white')}>
        <span className={clsx('grid size-9 shrink-0 place-items-center rounded-lg', todo ? 'bg-brand-600 text-white' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300')}>
          {todo ? <Icon className="size-4" aria-hidden /> : <CheckCircle2 className="size-4" aria-hidden />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold break-words text-navy-900">{title}</span>
          <span className="block text-xs text-muted">{sub}</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
      </Link>
    </li>
  );

  return (
    <section className="card p-5 sm:p-6" aria-labelledby="client-data-title">
      <h2 id="client-data-title" className="flex items-center gap-2 text-lg font-extrabold text-navy-900">
        <ClipboardList className="size-5 text-brand-600" aria-hidden /> {t('clientData.portal.tasksTitle')}
      </h2>
      <p className="mt-1 text-sm text-muted">{t('clientData.portal.tasksHint')}</p>
      <ul className="mt-4 space-y-2">
        {conf && (
          <Row
            to={`/account/cases/${caseId}/confirm`}
            icon={ShieldCheck}
            title={t('clientData.portal.confirmTitle')}
            todo={conf.status === 'PENDING'}
            sub={conf.status === 'PENDING' ? t('clientData.portal.confirmTodo', { count: conf.fields }) : conf.status === 'SUBMITTED' ? t('clientData.portal.confirmInReview') : t('clientData.portal.confirmOk')}
          />
        )}
        {forms.map((f) => (
          <Row
            key={f.id}
            to={`/account/cases/${caseId}/forms/${f.id}`}
            icon={ClipboardList}
            title={tr(f.title)}
            todo={open(f.status)}
            sub={open(f.status) ? (f.dueAt ? t('clientData.portal.due', { date: date(f.dueAt) }) : t(`clientData.status.${f.status}`)) : t('clientData.portal.formSent', { date: f.submittedAt ? date(f.submittedAt) : '' })}
          />
        ))}
      </ul>
    </section>
  );
}
