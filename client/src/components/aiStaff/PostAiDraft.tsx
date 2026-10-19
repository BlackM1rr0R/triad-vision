import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Copy, Sparkles, Wand2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Modal } from '@/components/admin/Modal';
import { Spinner } from '@/components/ui/Spinner';
import { toastError } from '@/components/admin/labels';
import { aiReasonText } from './shared';

type L10n = { az: string; de: string; en: string; ru: string };
export interface DraftPost {
  id: string;
  slug: string;
  title: L10n;
  excerpt: L10n;
  body: L10n;
  published: boolean;
}

const AUDIENCES = ['all', 'candidates', 'employers'] as const;
const TONES = ['informative', 'friendly', 'professional'] as const;
const LENGTHS = ['short', 'medium', 'long'] as const;

const Select = <T extends string>({ id, label, value, options, onChange, text }: { id: string; label: string; value: T; options: readonly T[]; onChange: (v: T) => void; text: (v: T) => string }) => (
  <label htmlFor={id} className="block">
    <span className="text-xs font-semibold text-ink">{label}</span>
    <select id={id} className="input mt-1" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o} value={o}>
          {text(o)}
        </option>
      ))}
    </select>
  </label>
);

/** "AI ilə yaz" + "Mətni yaxşılaşdır" for the admin posts editor. The draft is saved unpublished. */
export const PostAiTools = ({ onCreated }: { onCreated: (post: DraftPost) => void }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [topic, setTopic] = useState('');
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number]>('all');
  const [tone, setTone] = useState<(typeof TONES)[number]>('informative');
  const [length, setLength] = useState<(typeof LENGTHS)[number]>('medium');
  const [lang, setLang] = useState<'az' | 'de'>('az');

  const [improveOpen, setImproveOpen] = useState(false);
  const [para, setPara] = useState('');
  const [wish, setWish] = useState('');
  const [better, setBetter] = useState('');
  const [improving, setImproving] = useState(false);

  const create = async () => {
    if (topic.trim().length < 3) return;
    setBusy(true);
    try {
      const res = (await api.post<{ post: DraftPost | null; reason?: string }>('/admin/ai-staff/content/post-draft', { topic: topic.trim(), audience, tone, length, lang }, { timeout: 240_000 })).data;
      if (!res.post) {
        toast.error(aiReasonText(t, res.reason));
        return;
      }
      toast.success(t('aiStaff.post.created'));
      if (res.reason) toast.warning(t('aiStaff.post.partial'));
      setOpen(false);
      setTopic('');
      onCreated(res.post);
    } catch (err) {
      toastError(err, t('aiStaff.errors.generic'));
    } finally {
      setBusy(false);
    }
  };

  const improve = async () => {
    if (para.trim().length < 3) return;
    setImproving(true);
    try {
      const res = (await api.post<{ text: string | null; reason?: string }>('/admin/ai-staff/content/improve', { text: para.trim(), instruction: wish.trim() || undefined })).data;
      if (res.text) setBetter(res.text);
      else toast.error(aiReasonText(t, res.reason));
    } catch (err) {
      toastError(err, t('aiStaff.errors.generic'));
    } finally {
      setImproving(false);
    }
  };

  return (
    <>
      <button type="button" className="btn-white btn-sm border border-line" onClick={() => setImproveOpen(true)}>
        <Wand2 className="size-3.5" /> {t('aiStaff.post.improve')}
      </button>
      <button type="button" className="btn-white btn-sm border border-brand-200 text-brand-700" onClick={() => setOpen(true)}>
        <Sparkles className="size-3.5" /> {t('aiStaff.post.button')}
      </button>

      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={t('aiStaff.post.title')}
        description={t('aiStaff.post.seoNote')}
        footer={
          <>
            <button type="button" className="btn-white btn-sm border border-line" onClick={() => setOpen(false)} disabled={busy}>
              {t('aiStaff.post.cancel')}
            </button>
            <button type="button" className="btn-primary btn-sm" onClick={() => void create()} disabled={busy || topic.trim().length < 3}>
              {busy ? <Spinner className="size-3.5" /> : <Sparkles className="size-3.5" />} {t('aiStaff.post.generate')}
            </button>
          </>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <label htmlFor="ai-post-topic" className="block sm:col-span-2">
            <span className="text-xs font-semibold text-ink">{t('aiStaff.post.topic')}</span>
            <textarea id="ai-post-topic" className="input mt-1" rows={2} maxLength={400} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={t('aiStaff.post.topicPlaceholder')} />
          </label>
          <Select id="ai-post-audience" label={t('aiStaff.post.audience')} value={audience} options={AUDIENCES} onChange={setAudience} text={(v) => t(`aiStaff.post.audiences.${v}`)} />
          <Select id="ai-post-tone" label={t('aiStaff.post.tone')} value={tone} options={TONES} onChange={setTone} text={(v) => t(`aiStaff.post.tones.${v}`)} />
          <Select id="ai-post-length" label={t('aiStaff.post.length')} value={length} options={LENGTHS} onChange={setLength} text={(v) => t(`aiStaff.post.lengths.${v}`)} />
          <Select id="ai-post-lang" label={t('aiStaff.post.lang')} value={lang} options={['az', 'de'] as const} onChange={setLang} text={(v) => t(`aiStaff.post.langs.${v}`)} />
          {busy && (
            <p className="flex items-center gap-2 text-xs text-muted sm:col-span-2">
              <Spinner className="size-3.5 text-brand-600" /> {t('aiStaff.post.busy')}
            </p>
          )}
        </div>
      </Modal>

      <Modal open={improveOpen} onClose={() => !improving && setImproveOpen(false)} title={t('aiStaff.post.improveTitle')} size="lg">
        <div className="space-y-3">
          <textarea className="input" rows={5} maxLength={3000} value={para} onChange={(e) => setPara(e.target.value)} placeholder={t('aiStaff.post.improvePlaceholder')} aria-label={t('aiStaff.post.improvePlaceholder')} />
          <div className="flex flex-wrap gap-2">
            <input className="input h-9 min-w-0 flex-1 text-xs" maxLength={200} value={wish} onChange={(e) => setWish(e.target.value)} placeholder={t('aiStaff.post.improveHint')} aria-label={t('aiStaff.post.improveHint')} />
            <button type="button" className="btn-primary btn-sm" onClick={() => void improve()} disabled={improving || para.trim().length < 3}>
              {improving ? <Spinner className="size-3.5" /> : <Wand2 className="size-3.5" />} {t('aiStaff.post.improveRun')}
            </button>
          </div>
          {better && (
            <div className="rounded-lg border border-line bg-surface p-3">
              <p className="text-sm whitespace-pre-wrap text-ink">{better}</p>
              <button
                type="button"
                className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
                onClick={() => {
                  void navigator.clipboard?.writeText(better).then(() => toast.success(t('aiStaff.post.copied')));
                }}
              >
                <Copy className="size-3.5" /> {t('aiStaff.post.copy')}
              </button>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
