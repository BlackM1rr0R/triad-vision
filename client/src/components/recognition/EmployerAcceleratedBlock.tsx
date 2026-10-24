import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { Check, Rocket } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesRecognition } from '@/i18n/pagesRecognition';
import { fmtDate } from '@/components/admin/labels';
import { euro, type EmployerAccelerated } from './api';

registerCopy(pagesRecognition);

/**
 * Employer portal, worker drawer: read-only § 81a procedure of the worker — steps with dates, what the employer
 * still has to do (sign the agreement with the Ausländerbehörde, pay the fee) and the embassy dates to expect.
 */
export const EmployerAcceleratedBlock = ({ a }: { a: EmployerAccelerated }) => {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'en' ? 'en-GB' : i18n.language === 'ru' ? 'ru-RU' : i18n.language === 'az' ? 'az-Latn-AZ' : 'de-DE';
  return (
    <section>
      <h3 className="mb-1 flex items-center gap-2 text-sm font-bold text-navy-900">
        <Rocket className="size-4 text-brand-600" aria-hidden /> {t('accel.employer.title')}
      </h3>
      <p className="mb-3 text-xs text-muted">{t('accel.employer.hint')}</p>
      {a.todos.length > 0 && (
        <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-[11px] font-semibold tracking-wide text-amber-800 uppercase">{t('accel.employer.todoTitle')}</p>
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {a.todos.map((todo) => (
              <li key={todo}>{t(`accel.employer.todo.${todo}`, { fee: euro(a.feeCents, locale) })}</li>
            ))}
          </ul>
        </div>
      )}
      <ol className="space-y-1.5">
        {a.steps.map((s) => (
          <li key={s.status} className={clsx('flex items-center gap-2 text-sm', s.done ? 'text-ink' : 'text-muted')} aria-current={s.current ? 'step' : undefined}>
            <span className={clsx('grid size-4 shrink-0 place-items-center rounded-full', s.done ? 'bg-brand-600 text-white' : 'border border-line')}>{s.done && <Check className="size-3" aria-hidden />}</span>
            <span className={clsx('min-w-0 flex-1', s.current && !a.final && 'font-semibold text-navy-900')}>{t(`accel.status.${s.status}`)}</span>
            {s.at && <span className="text-xs text-muted tabular-nums">{fmtDate(s.at)}</span>}
          </li>
        ))}
      </ol>
      {(a.status === 'REJECTED' || a.status === 'CANCELLED') && <p className="mt-2 badge bg-danger-bg text-danger-fg">{t(`accel.status.${a.status}`)}</p>}
      {(a.authority || a.appointmentAt || a.appointmentDeadline || a.decisionDeadline) && (
      <dl className="mt-3 divide-y divide-line rounded-2xl border border-line px-4 text-sm">
        {a.authority && (
          <div className="flex justify-between gap-3 py-2">
            <dt className="text-muted">{t('accel.employer.authority')}</dt>
            <dd className="text-right font-medium text-ink">{a.authority}</dd>
          </div>
        )}
        {a.appointmentAt ? (
          <div className="flex justify-between gap-3 py-2">
            <dt className="text-muted">{t('accel.employer.appointmentAt')}</dt>
            <dd className="font-medium text-ink tabular-nums">{fmtDate(a.appointmentAt)}</dd>
          </div>
        ) : (
          a.appointmentDeadline && (
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-muted">{t('accel.employer.appointmentDeadline')}</dt>
              <dd className="font-medium text-ink tabular-nums">{fmtDate(a.appointmentDeadline)}</dd>
            </div>
          )
        )}
        {a.decisionDeadline && (
          <div className="flex justify-between gap-3 py-2">
            <dt className="text-muted">{t('accel.employer.decisionDeadline')}</dt>
            <dd className="font-medium text-ink tabular-nums">{fmtDate(a.decisionDeadline)}</dd>
          </div>
        )}
      </dl>
      )}
    </section>
  );
};

export default EmployerAcceleratedBlock;
