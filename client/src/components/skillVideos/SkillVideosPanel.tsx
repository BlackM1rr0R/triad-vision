import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { Eye, EyeOff, Film, Lightbulb, Pencil, RefreshCw, Trash2, Upload, Video } from 'lucide-react';
import { api, formatBytes } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Checkbox, Field, Input, Select } from '@/components/ui/Field';
import { StatusPill } from '@/components/ui/Badge';
import {
  ACCEPT,
  SKILL_TAGS,
  capturePoster,
  fmtDuration,
  probeDuration,
  toastSkillVideoError,
  uploadSkillVideo,
  type OwnListResponse,
  type OwnSkillVideo,
  type SkillTag,
  type SkillVideoLimits,
} from './api';
import { Recorder, type Recording } from './Recorder';

const KEY = ['skill-videos'] as const;

type FormMode = { kind: 'record' | 'upload'; replace?: OwnSkillVideo } | { kind: 'edit'; video: OwnSkillVideo };

/** What the candidate should show for a skill (prompt card above the recorder / file picker). */
export const PromptCard = ({ skill }: { skill: SkillTag }) => {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-info-border bg-info-bg p-3 text-info-fg">
      <Lightbulb className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-semibold">{t('skillVideos.recorder.prompt')}</p>
        <p className="mt-0.5">{t(`skillVideos.prompts.${skill}`)}</p>
      </div>
    </div>
  );
};

interface Picked {
  blob: Blob;
  fileName: string;
  durationSec: number | null;
  source: 'RECORDED' | 'UPLOADED';
}

const SkillVideoForm = ({ mode, limits, suggested, onClose }: { mode: FormMode; limits: SkillVideoLimits; suggested: SkillTag; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const editing = mode.kind === 'edit' ? mode.video : null;
  const base = mode.kind === 'edit' ? mode.video : mode.replace;
  const [title, setTitle] = useState(base?.title ?? '');
  const [skill, setSkill] = useState<SkillTag>(base?.skill ?? suggested);
  const [consent, setConsent] = useState(mode.kind === 'edit' ? mode.video.consent : false);
  const [picked, setPicked] = useState<Picked | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [retry, setRetry] = useState<{ n: number; max: number } | null>(null);
  const [checking, setChecking] = useState(false);
  // Record or pick a file (switchable while nothing is chosen yet).
  const [kind, setKind] = useState<'record' | 'upload' | 'edit'>(mode.kind);
  const recordable = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

  const save = useMutation({
    mutationFn: async () => {
      if (editing) return api.patch(`/skill-videos/${editing.id}`, { title: title.trim(), skill, consent });
      if (!picked) throw new Error('no file');
      const poster = await capturePoster(picked.blob).catch(() => null);
      return uploadSkillVideo(
        mode.kind !== 'edit' && mode.replace ? `/skill-videos/${mode.replace.id}/replace` : '/skill-videos',
        { file: picked.blob, fileName: picked.fileName, title: title.trim(), skill, source: picked.source, durationSec: picked.durationSec, consent, poster },
        setProgress,
        (n, max) => setRetry({ n, max }),
      );
    },
    onSuccess: () => {
      toast.success(editing ? t('skillVideos.saved') : t('skillVideos.uploaded'));
      void qc.invalidateQueries({ queryKey: KEY });
      onClose();
    },
    onError: toastSkillVideoError,
    onSettled: () => {
      setProgress(null);
      setRetry(null);
    },
  });

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    // Client-side checks first (the server checks again: bytes, size, duration).
    if (!/\.(mp4|m4v|webm|mov)$/i.test(file.name) && !/^video\/(mp4|webm|quicktime)/.test(file.type)) {
      toast.error(t('skillVideos.errors.UNSUPPORTED_FILE_TYPE'));
      return;
    }
    if (file.size > limits.maxBytes) {
      toast.error(t('skillVideos.errors.FILE_TOO_LARGE'));
      return;
    }
    setChecking(true);
    const duration = await probeDuration(file);
    setChecking(false);
    if (duration != null && duration > limits.maxSeconds + 1) {
      toast.error(t('skillVideos.errors.VIDEO_TOO_LONG'));
      return;
    }
    setPicked({ blob: file, fileName: file.name, durationSec: duration, source: 'UPLOADED' });
    if (!title.trim()) setTitle(t(`skillVideos.skills.${skill}`));
  };

  const recorded = (r: Recording | null) => {
    setPicked(r ? { blob: r.blob, fileName: r.fileName, durationSec: r.durationSec, source: 'RECORDED' } : null);
    if (r && !title.trim()) setTitle(t(`skillVideos.skills.${skill}`));
  };

  const busy = save.isPending;
  const canSave = !!title.trim() && (editing || picked) && !busy && !checking;
  const heading = editing ? t('skillVideos.form.editTitle') : mode.kind !== 'edit' && mode.replace ? t('skillVideos.form.replaceTitle') : t('skillVideos.form.newTitle');

  return (
    <Modal
      open
      onClose={onClose}
      busy={busy}
      title={heading}
      size="lg"
      as="form"
      onSubmit={(e) => {
        e.preventDefault();
        if (canSave) save.mutate();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('skillVideos.form.cancel')}
          </Button>
          <Button type="submit" loading={busy} disabled={!canSave}>
            {t('skillVideos.form.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('skillVideos.form.skill')}>
          <Select value={skill} onChange={(e) => setSkill(e.target.value as SkillTag)} disabled={busy}>
            {SKILL_TAGS.map((s) => (
              <option key={s} value={s}>
                {t(`skillVideos.skills.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        {!editing && <PromptCard skill={skill} />}
        {!editing && recordable && (
          <div className="flex flex-wrap gap-2" role="group">
            {(['record', 'upload'] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={kind === k ? 'primary' : 'secondary'}
                icon={k === 'record' ? Video : Upload}
                aria-pressed={kind === k}
                disabled={busy}
                onClick={() => {
                  setPicked(null);
                  setKind(k);
                }}
              >
                {t(k === 'record' ? 'skillVideos.record' : 'skillVideos.upload')}
              </Button>
            ))}
          </div>
        )}
        {kind === 'record' && <Recorder maxSeconds={limits.maxRecordSeconds} onRecorded={recorded} />}
        {kind === 'upload' && (
          <Field label={t('skillVideos.form.file')} hint={t('skillVideos.limits', { count: limits.maxCount, rec: limits.maxRecordSeconds, mb: Math.round(limits.maxBytes / 1048576), min: Math.round(limits.maxSeconds / 60) })}>
            <div className="flex flex-wrap items-center gap-2">
              <input ref={input} type="file" accept={ACCEPT} className="sr-only" tabIndex={-1} onChange={(e) => { void pickFile(e.target.files?.[0]); e.target.value = ''; }} />
              <Button size="sm" variant="secondary" icon={Upload} loading={checking} disabled={busy} onClick={() => input.current?.click()}>
                {t('skillVideos.upload')}
              </Button>
              {picked && (
                <span className="min-w-0 truncate text-sm text-muted">
                  {t('skillVideos.form.chosen', { name: picked.fileName, size: formatBytes(picked.blob.size), duration: fmtDuration(picked.durationSec) })}
                </span>
              )}
            </div>
          </Field>
        )}
        <Field label={t('skillVideos.form.title')} required hint={editing?.status === 'APPROVED' ? t('skillVideos.form.renameHint') : undefined}>
          <Input value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} placeholder={t('skillVideos.form.titlePh')} disabled={busy} />
        </Field>
        <Checkbox checked={consent} onChange={(e) => setConsent(e.target.checked)} label={t('skillVideos.consentLabel')} hint={t('skillVideos.consentHint')} disabled={busy} />
        {progress !== null && (
          <div role="status">
            <p className="mb-1 text-xs text-muted">{retry ? t('skillVideos.retrying', retry) : t('skillVideos.uploading', { percent: progress })}</p>
            <span className="block h-1.5 overflow-hidden rounded-full bg-line" aria-hidden>
              <span className="block h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
};

const VideoCard = ({ v, onEdit, onReplace, onRemove }: { v: OwnSkillVideo; onEdit: () => void; onReplace: () => void; onRemove: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const consent = useMutation({
    mutationFn: (on: boolean) => api.patch(`/skill-videos/${v.id}`, { consent: on }),
    onSuccess: (_r, on) => {
      toast.success(on ? t('skillVideos.consentGiven') : t('skillVideos.withdrawn'));
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: toastSkillVideoError,
  });
  const q = encodeURIComponent(v.updatedAt);
  return (
    <li className="min-w-0 rounded-xl border border-line bg-card p-3">
      <video
        key={v.updatedAt}
        controls
        preload="metadata"
        playsInline
        controlsList="nodownload"
        className="aspect-video w-full rounded-lg bg-navy-900"
        poster={v.hasPoster ? `/api/skill-videos/${v.id}/poster?v=${q}` : undefined}
        src={`/api/skill-videos/${v.id}/file?v=${q}`}
      />
      <div className="mt-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-ink">{v.title}</p>
          <p className="text-xs text-muted">
            {t(`skillVideos.skills.${v.skill}`)} · {fmtDuration(v.durationSec)} · {formatBytes(v.size)}
          </p>
        </div>
        <StatusPill domain="review" status={v.status} label={t(`skillVideos.status.${v.status}`)} />
      </div>
      {v.status === 'REJECTED' && v.rejectReason && (
        <p className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-sm text-danger-fg">
          <span className="font-semibold">{t('skillVideos.reason')}: </span>
          {v.rejectReason}
        </p>
      )}
      <p className={clsx('mt-2 flex items-center gap-1.5 text-xs', v.visibleToEmployers ? 'text-success-fg' : 'text-muted')}>
        {v.visibleToEmployers ? <Eye className="size-3.5" aria-hidden /> : <EyeOff className="size-3.5" aria-hidden />}
        {v.visibleToEmployers ? t('skillVideos.visible') : t('skillVideos.hidden')}
        {v.employerViews > 0 && <> · {t('skillVideos.viewedBy', { count: v.employerViews })}</>}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant={v.consent ? 'secondary' : 'primary'} loading={consent.isPending} onClick={() => consent.mutate(!v.consent)}>
          {v.consent ? t('skillVideos.withdraw') : t('skillVideos.giveConsent')}
        </Button>
        <Button size="sm" variant="secondary" icon={Pencil} onClick={onEdit}>
          {t('skillVideos.edit')}
        </Button>
        <Button size="sm" variant="secondary" icon={RefreshCw} onClick={onReplace}>
          {t('skillVideos.replace')}
        </Button>
        <Button size="sm" variant="ghost" icon={Trash2} className="text-danger" onClick={onRemove}>
          {t('skillVideos.remove')}
        </Button>
      </div>
    </li>
  );
};

/** Candidate profile (Peşə məlumatları tab): record / upload up to five skill videos, consent per video. */
export const SkillVideosPanel = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState<FormMode | null>(null);
  const [removing, setRemoving] = useState<OwnSkillVideo | null>(null);
  const { data } = useQuery({ queryKey: KEY, queryFn: async () => (await api.get<OwnListResponse>('/skill-videos')).data });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/skill-videos/${id}`),
    onSuccess: () => {
      toast.success(t('skillVideos.removed'));
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: KEY });
    },
    onError: toastSkillVideoError,
  });
  // Deep link from the rejection notification (…#skill-videos).
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (data && window.location.hash === '#skill-videos') ref.current?.scrollIntoView({ block: 'start' });
  }, [data]);

  const items = data?.items ?? [];
  const limits = data?.limits;
  const full = !!limits && items.length >= limits.maxCount;
  const recordable = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia;

  return (
    <section ref={ref} id="skill-videos" className={clsx('card card-pad scroll-mt-24', className)} aria-labelledby="skill-videos-title">
      <h2 id="skill-videos-title" className="flex items-center gap-2.5 text-lg font-bold text-navy-900">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Film className="size-4.5" aria-hidden />
        </span>
        {t('skillVideos.title')}
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">{t('skillVideos.intro')}</p>
      {limits && (
        <p className="mt-1 text-xs text-muted">
          {t('skillVideos.limits', { count: limits.maxCount, rec: limits.maxRecordSeconds, mb: Math.round(limits.maxBytes / 1048576), min: Math.round(limits.maxSeconds / 60) })}
        </p>
      )}
      {!!data?.employersTotal && (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-success-bg px-3 py-1 text-sm font-semibold text-success-fg">
          <Eye className="size-4" aria-hidden /> {t('skillVideos.viewedTotal', { count: data.employersTotal })}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        {recordable && (
          <Button size="sm" icon={Video} disabled={!limits || full} onClick={() => setForm({ kind: 'record' })}>
            {t('skillVideos.record')}
          </Button>
        )}
        <Button size="sm" variant={recordable ? 'secondary' : 'primary'} icon={Upload} disabled={!limits || full} onClick={() => setForm({ kind: 'upload' })}>
          {t('skillVideos.upload')}
        </Button>
      </div>
      {full && limits && <p className="mt-2 text-xs text-warning-fg">{t('skillVideos.limitReached', { count: limits.maxCount })}</p>}
      {data && !items.length && <p className="mt-4 text-sm text-muted">{t('skillVideos.empty')}</p>}
      {items.length > 0 && (
        <ul className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {items.map((v) => (
            <VideoCard
              key={v.id}
              v={v}
              onEdit={() => setForm({ kind: 'edit', video: v })}
              onReplace={() => setForm({ kind: recordable ? 'record' : 'upload', replace: v })}
              onRemove={() => setRemoving(v)}
            />
          ))}
        </ul>
      )}
      {form && limits && data && <SkillVideoForm mode={form} limits={limits} suggested={data.suggestedSkill} onClose={() => setForm(null)} />}
      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        loading={remove.isPending}
        title={t('skillVideos.confirmRemove')}
        message={t('skillVideos.confirmRemoveText')}
        confirmLabel={t('skillVideos.remove')}
      />
    </section>
  );
};
