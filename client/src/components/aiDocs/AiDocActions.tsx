import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { toast } from 'sonner';
import { AlertTriangle, Bot, CheckCircle2, Languages, MinusCircle, RefreshCw, XCircle } from 'lucide-react';
import { registerCopy } from '@/i18n';
import { pagesAiDocs } from '@/i18n/pagesAiDocs';
import { Spinner } from '@/components/ui/Spinner';
import { STATUS_TONES, toneClasses } from '@/components/ui/status';
import { aiLimitMessage, aiOfChecks, errorCode, issueText, recheckDoc, type AiDocCheck, type AiFields } from './api';

registerCopy(pagesAiDocs);

const TranslateDraftDialog = lazy(() => import('./TranslateDraftDialog'));

const TONE: Record<AiDocCheck['verdict'] | 'none', string> = toneClasses(STATUS_TONES.check);

const ICON = { ok: CheckCircle2, warn: AlertTriangle, wrong_document: XCircle, unreadable: XCircle, skipped: MinusCircle, none: Bot } as const;

const FIELD_KEYS: (keyof AiFields)[] = ['name', 'birthDate', 'documentNumber', 'issueDate', 'expiryDate', 'issuer'];

/**
 * Staff side of the document AI on a case document row: the AI verdict chip (details with issues and the
 * fields read on click / hover), "Yenidən yoxla" (ADMIN scope, cost on the staff member) and
 * "AI layihə tərcüməsi" (German draft into the client folder "Übersetzungen").
 */
export const AiDocActions = ({ docId, checks, name, mimeType, onChanged }: { docId: string; checks: unknown; name: string; mimeType: string; onChanged?: () => unknown }) => {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? 'az').slice(0, 2);
  const [local, setLocal] = useState<AiDocCheck | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(false);
  const boxRef = useRef<HTMLSpanElement>(null);
  const ai = local ?? aiOfChecks(checks);
  const state = ai?.verdict ?? 'none';
  const Icon = ICON[state];
  const translatable = mimeType === 'application/pdf' || mimeType.startsWith('image/');

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const recheck = useMutation({
    mutationFn: () => recheckDoc(docId),
    onSuccess: (r) => {
      setLocal(r);
      toast.success(t('aiDocs.check.rechecked'));
      void onChanged?.();
    },
    onError: (err) => toast.error(aiLimitMessage(err) ?? `${t('aiDocs.draft.errors.generic')} (${errorCode(err)})`),
  });

  const lines: string[] = [];
  if (ai && ai.verdict !== 'skipped') {
    if (ai.documentType) lines.push(`${t('aiDocs.check.docType')}: ${ai.documentType}${ai.language ? ` · ${ai.language}` : ''}`);
    ai.issues.forEach((i) => lines.push(`• ${issueText(i, lang)}`));
    lines.push(`${t('aiDocs.check.apostille.label')}: ${t(`aiDocs.check.apostille.${ai.apostille}`)}`);
    if (ai.translationNeeded) lines.push(t('aiDocs.check.translationNeeded'));
    FIELD_KEYS.forEach((k) => ai.fields[k] && lines.push(`${t(`aiDocs.check.fields.${k}`)}: ${ai.fields[k]}`));
  } else if (ai?.verdict === 'skipped') lines.push(`${t('aiDocs.check.skipped')} (${ai.reason})`);

  return (
    <span ref={boxRef} className="relative inline-flex items-center gap-0.5">
      <button
        type="button"
        className={clsx('badge inline-flex items-center gap-1 whitespace-nowrap', TONE[state])}
        title={lines.join('\n') || t('aiDocs.check.chip.none')}
        onClick={() => ai && setOpen((o) => !o)}
        aria-expanded={ai ? open : undefined}
      >
        <Icon className="size-3.5" aria-hidden />
        {t(`aiDocs.check.chip.${state}`)}
        {ai && ai.verdict !== 'skipped' && ai.issues.length > 1 && <span aria-hidden>·{ai.issues.length}</span>}
      </button>
      <button
        type="button"
        onClick={() => recheck.mutate()}
        disabled={recheck.isPending}
        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-primary/[0.06] hover:text-link disabled:opacity-50"
        title={t('aiDocs.check.recheck')}
        aria-label={`${t('aiDocs.check.recheck')}: ${name}`}
      >
        {recheck.isPending ? <Spinner className="size-3.5" /> : <RefreshCw className="size-3.5" aria-hidden />}
      </button>
      {translatable && (
        <button
          type="button"
          onClick={() => setDraft(true)}
          className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-primary/[0.06] hover:text-link"
          title={t('aiDocs.draft.action')}
          aria-label={`${t('aiDocs.draft.action')}: ${name}`}
        >
          <Languages className="size-3.5" aria-hidden />
        </button>
      )}
      {open && ai && (
        <span className="absolute top-full right-0 z-30 mt-1 block w-72 max-w-[80vw] rounded-lg border border-line bg-card p-3 text-left text-xs text-ink shadow-[var(--tv-shadow-raised)]">
          <span className="mb-1 block font-semibold">
            {t(`aiDocs.check.chip.${state}`)} · {t(`aiDocs.check.by.${ai.by}`)} · {new Date(ai.at).toLocaleString(i18n.resolvedLanguage)}
          </span>
          {lines.map((l, i) => (
            <span key={i} className="block leading-relaxed break-words">
              {l}
            </span>
          ))}
          <span className="mt-2 block text-[11px] text-muted">{t('aiDocs.check.note')}</span>
        </span>
      )}
      {draft && (
        <Suspense fallback={null}>
          <TranslateDraftDialog source={{ documentId: docId }} fileName={name} where="case" onClose={() => setDraft(false)} />
        </Suspense>
      )}
    </span>
  );
};

export default AiDocActions;
