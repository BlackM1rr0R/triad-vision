import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardList, Save, Send } from 'lucide-react';
import { api, errorCode } from '@/lib/api';
import { useL10n } from '@/lib/l10n';
import { usePageTitle } from '@/lib/usePageTitle';
import { PageLoader, Spinner } from '@/components/ui/Spinner';
import { clientTasksKey, missingKeys, type Answers, type ClientForm } from '@/components/clientData/api';
import { FormRenderer } from '@/components/clientData/FormRenderer';

/** /account/cases/:id/forms/:formId — the client fills a questionnaire: autosaved draft, submit with required check. */
export default function CaseFormPage() {
  const { id = '', formId = '' } = useParams();
  const { t } = useTranslation();
  const { tr, dateTime, date } = useL10n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ['client-case-form', id, formId];
  const { data, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<{ form: ClientForm }>(`/client-data/cases/${id}/forms/${formId}`)).data.form,
    enabled: !!id && !!formId,
  });
  const [answers, setAnswers] = useState<Answers>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const dirty = useRef(false);
  usePageTitle(data ? tr(data.title) : t('clientData.portal.formTitle'));

  useEffect(() => {
    if (data) {
      setAnswers(data.answers ?? {});
      setSavedAt(data.draftAt);
    }
  }, [data]);

  const save = async (quiet = false) => {
    if (!data?.editable) return;
    setBusy('save');
    try {
      const res = (await api.put<{ form: ClientForm }>(`/client-data/cases/${id}/forms/${formId}`, { answers })).data.form;
      dirty.current = false;
      setSavedAt(res.draftAt);
      if (!quiet) toast.success(t('clientData.portal.draftSaved'));
    } catch (err) {
      if (!quiet) toast.error(t(`clientData.errors.${errorCode(err)}`, { defaultValue: t('common.error') }));
    } finally {
      setBusy(null);
    }
  };

  // Autosave 3 s after the last change.
  useEffect(() => {
    if (!dirty.current || !data?.editable) return;
    const h = window.setTimeout(() => void save(true), 3000);
    return () => window.clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers]);

  const submit = async () => {
    if (!data) return;
    const m = missingKeys(data.fields, answers);
    setMissing(m);
    if (m.size) {
      toast.error(t('clientData.errors.REQUIRED_MISSING'));
      return;
    }
    setBusy('submit');
    try {
      await api.post(`/client-data/cases/${id}/forms/${formId}/submit`, { answers });
      dirty.current = false;
      toast.success(t('clientData.portal.submitted'));
      await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: clientTasksKey(id) })]);
      navigate(`/account/cases/${id}`);
    } catch (err) {
      const body = (err as { response?: { data?: { missing?: { key: string; row?: number; sub?: string }[] } } }).response?.data;
      if (body?.missing) setMissing(new Set(body.missing.map((x) => (x.sub !== undefined ? `${x.key}.${x.row}.${x.sub}` : x.key))));
      toast.error(t(`clientData.errors.${errorCode(err)}`, { defaultValue: t('common.error') }));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <PageLoader />;
  if (error || !data) {
    return (
      <div className="card mx-auto max-w-lg p-8 text-center">
        <AlertTriangle className="mx-auto size-10 text-warning" aria-hidden />
        <p className="mt-4 font-semibold text-ink">{t('clientData.errors.FORM_NOT_FOUND')}</p>
        <Link to={`/account/cases/${id}`} className="btn-primary mt-6">
          <ArrowLeft className="size-4" aria-hidden /> {t('clientData.common.back')}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5 pb-24 sm:pb-0">
      <Link to={`/account/cases/${id}`} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm font-semibold text-link hover:text-link">
        <ArrowLeft className="size-4" aria-hidden /> {t('clientData.common.back')}
      </Link>
      <header className="card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-contrast">
            <ClipboardList className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h1 className="type-page-title break-words">{tr(data.title)}</h1>
            <p className="mt-1 text-sm text-muted">{data.editable ? t('clientData.portal.formHint') : t('clientData.portal.formReadOnly')}</p>
            {data.dueAt && <p className="mt-1 text-xs font-semibold text-warning-fg">{t('clientData.portal.due', { date: date(data.dueAt) })}</p>}
          </div>
        </div>
        {data.note && <p className="mt-4 rounded-lg border border-warning-border bg-warning-bg px-4 py-3 text-sm whitespace-pre-line text-warning-fg">{data.note}</p>}
        {!data.editable && (
          <p className="mt-4 flex items-center gap-2 rounded-lg bg-success-bg px-4 py-3 text-sm text-success-fg">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden /> {t('clientData.portal.submittedHint', { date: data.submittedAt ? dateTime(data.submittedAt) : '' })}
          </p>
        )}
      </header>

      <section className="card p-5 sm:p-6">
        <FormRenderer
          fields={data.fields}
          answers={answers}
          readOnly={!data.editable}
          missing={missing}
          caseId={id}
          onChange={(next) => {
            dirty.current = true;
            setAnswers(next);
          }}
        />
      </section>

      {data.editable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card p-3 sm:static sm:rounded-xl sm:border sm:p-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-muted" role="status">
              {busy === 'save' ? t('clientData.common.saving') : savedAt ? t('clientData.portal.savedAt', { date: dateTime(savedAt) }) : ''}
            </span>
            <div className="flex w-full gap-2 sm:w-auto">
              <button type="button" className="btn-white flex-1 border border-line sm:flex-none" disabled={!!busy} onClick={() => void save()}>
                {busy === 'save' ? <Spinner className="size-4" /> : <Save className="size-4" aria-hidden />} {t('clientData.portal.saveDraft')}
              </button>
              <button type="button" className="btn-primary flex-1 sm:flex-none" disabled={!!busy} onClick={() => void submit()}>
                {busy === 'submit' ? <Spinner className="size-4" /> : <Send className="size-4" aria-hidden />} {t('clientData.portal.submit')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
