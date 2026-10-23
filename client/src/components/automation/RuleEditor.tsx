import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import clsx from 'clsx';
import { ArrowDown, ArrowUp, Braces, CheckCircle2, FlaskConical, Plus, Save, Search, Trash2, XCircle } from 'lucide-react';
import { api } from '@/lib/api';
import type { CaseStatus } from '@/lib/types';
import { currentLocale } from '@/i18n';
import { Drawer } from '@/components/admin/Drawer';
import { Spinner } from '@/components/ui/Spinner';
import { statusLabel } from '@/components/admin/labels';
import {
  ACTION_TYPES,
  APP_STATUSES,
  CASE_STATUSES,
  CONDITION_TYPES,
  DOC_STAGES,
  LANGS,
  OPS,
  TRIGGER_TYPES,
  VISA_TYPES,
  defaultAction,
  defaultCondition,
  defaultTrigger,
  fmtDelay,
  phKey,
  reasonText,
  toastAutomationError,
  type Action,
  type Condition,
  type ConditionType,
  type DryRun,
  type L10n,
  type Lang,
  type Meta,
  type RuleDraft,
  type StaffTarget,
  type Trigger,
  type TriggerType,
} from './types';
import { MultiChips } from './MultiChips';

// ─── Small building blocks ──────────────────────────────────────────────

const Section = ({ title, children, tone }: { title: string; children: ReactNode; tone: string }) => (
  <section className="rounded-xl border border-line bg-white">
    <h3 className={clsx('rounded-t-xl border-b border-line px-4 py-2.5 text-xs font-bold tracking-wide uppercase', tone)}>{title}</h3>
    <div className="space-y-3 p-4">{children}</div>
  </section>
);

const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <label className="block min-w-0">
    <span className="label">{label}</span>
    {children}
    {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
  </label>
);

// Placeholder picker: the last focused template field receives the chip's {{key}} at the cursor.
type Target = { el: HTMLInputElement | HTMLTextAreaElement; apply: (v: string) => void };

const useTemplateTarget = () => {
  const ref = useRef<Target | null>(null);
  const insert = (key: string) => {
    const t = ref.current;
    if (!t) return;
    const token = `{{${key}}}`;
    const start = t.el.selectionStart ?? t.el.value.length;
    const end = t.el.selectionEnd ?? start;
    t.apply(t.el.value.slice(0, start) + token + t.el.value.slice(end));
    requestAnimationFrame(() => {
      t.el.focus();
      t.el.setSelectionRange(start + token.length, start + token.length);
    });
  };
  return { ref, insert };
};

type TargetRef = ReturnType<typeof useTemplateTarget>['ref'];

const TemplateInput = ({ value, onChange, target, multiline, maxLength, placeholder }: { value: string; onChange: (v: string) => void; target: TargetRef; multiline?: boolean; maxLength: number; placeholder?: string }) => {
  const elRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  // Keep the picker's setter current (it closes over this render's action object).
  useEffect(() => {
    if (target.current && target.current.el === elRef.current) target.current.apply = onChange;
  });
  const register = (el: HTMLInputElement | HTMLTextAreaElement) => {
    elRef.current = el;
    target.current = { el, apply: onChange };
  };
  return multiline ? (
    <textarea className="input min-h-24" value={value} maxLength={maxLength} placeholder={placeholder} onFocus={(e) => register(e.currentTarget)} onChange={(e) => onChange(e.target.value)} />
  ) : (
    <input className="input" value={value} maxLength={maxLength} placeholder={placeholder} onFocus={(e) => register(e.currentTarget)} onChange={(e) => onChange(e.target.value)} />
  );
};

const L10nTemplate = ({ value, onChange, target, multiline, maxLength }: { value: L10n; onChange: (v: L10n) => void; target: TargetRef; multiline?: boolean; maxLength: number }) => (
  <div className="grid gap-2 sm:grid-cols-2">
    {LANGS.map((l) => (
      <div key={l} className="min-w-0">
        <span className="mb-1 block text-[11px] font-bold text-muted uppercase">{l}</span>
        <TemplateInput value={value[l]} onChange={(v) => onChange({ ...value, [l]: v })} target={target} multiline={multiline} maxLength={maxLength} />
      </div>
    ))}
  </div>
);

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();
const l10nPick = (v: L10n | null | undefined, l: Lang) => (v ? v[l] || v.de || v.en || v.az || v.ru || '' : '');

// ─── Trigger ────────────────────────────────────────────────────────────

const TriggerEditor = ({ value, onChange }: { value: Trigger; onChange: (t: Trigger) => void }) => {
  const { t } = useTranslation();
  const any = t('automation.common.any');
  const st = (s: CaseStatus) => statusLabel(s);
  return (
    <div className="space-y-3">
      <Field label={t('automation.editor.when')}>
        <select className="input" value={value.type} onChange={(e) => onChange(defaultTrigger(e.target.value as TriggerType))}>
          {TRIGGER_TYPES.map((x) => <option key={x} value={x}>{t(`automation.triggers.${x}`)}</option>)}
        </select>
      </Field>
      {value.type === 'CASE_STATUS_CHANGED' && (
        <>
          <Field label={t('automation.triggerFields.from')}><MultiChips options={CASE_STATUSES} value={value.from} onChange={(from) => onChange({ ...value, from })} label={st} anyLabel={any} /></Field>
          <Field label={t('automation.triggerFields.to')}><MultiChips options={CASE_STATUSES} value={value.to} onChange={(to) => onChange({ ...value, to })} label={st} anyLabel={any} /></Field>
        </>
      )}
      {(value.type === 'DOCUMENT_UPLOADED' || value.type === 'DOCUMENT_ACCEPTED' || value.type === 'DOCUMENT_REJECTED') && (
        <Field label={t('automation.triggerFields.stages')}>
          <MultiChips options={DOC_STAGES} value={value.stages} onChange={(stages) => onChange({ ...value, stages } as Trigger)} label={(s) => t(`automation.stages.${s}`)} anyLabel={any} />
        </Field>
      )}
      {value.type === 'DOCUMENT_UPLOADED' && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={value.byClientOnly} onChange={(e) => onChange({ ...value, byClientOnly: e.target.checked })} /> {t('automation.triggerFields.byClientOnly')}</label>
      )}
      {value.type === 'APPOINTMENT_SET' && (
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={value.includeReschedule} onChange={(e) => onChange({ ...value, includeReschedule: e.target.checked })} /> {t('automation.triggerFields.includeReschedule')}</label>
      )}
      {(value.type === 'CLIENT_INACTIVE' || value.type === 'STATUS_DURATION') && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('automation.triggerFields.days')}>
              <input type="number" min={1} max={365} className="input" value={value.days} onChange={(e) => onChange({ ...value, days: Math.max(1, Math.min(365, Number(e.target.value) || 1)) })} />
            </Field>
            {value.type === 'STATUS_DURATION' && (
              <Field label={t('automation.triggerFields.status')}>
                <select className="input" value={value.status} onChange={(e) => onChange({ ...value, status: e.target.value as CaseStatus })}>
                  {CASE_STATUSES.slice(0, 8).map((s) => <option key={s} value={s}>{st(s)}</option>)}
                </select>
              </Field>
            )}
          </div>
          {value.type === 'CLIENT_INACTIVE' && (
            <Field label={t('automation.triggerFields.statuses')}><MultiChips options={CASE_STATUSES.slice(0, 8)} value={value.statuses} onChange={(statuses) => onChange({ ...value, statuses })} label={st} anyLabel={any} /></Field>
          )}
          <p className="text-xs text-muted">{t('automation.triggerFields.timeHint')}</p>
        </>
      )}
      {value.type === 'APPLICATION_STATUS_CHANGED' && (
        <Field label={t('automation.triggerFields.appTo')}><MultiChips options={APP_STATUSES} value={value.to as (typeof APP_STATUSES)[number][]} onChange={(to) => onChange({ ...value, to })} label={(s) => t(`automation.appStatus.${s}`)} anyLabel={any} /></Field>
      )}
      {value.type === 'INQUIRY_CREATED' && (
        <Field label={t('automation.triggerFields.kinds')}><MultiChips options={['company', 'contact'] as const} value={value.kinds} onChange={(kinds) => onChange({ ...value, kinds })} label={(s) => t(`automation.inquiryKinds.${s}`)} anyLabel={any} /></Field>
      )}
    </div>
  );
};

// ─── Conditions ─────────────────────────────────────────────────────────

const ConditionRow = ({ value, onChange, onRemove, meta }: { value: Condition; onChange: (c: Condition) => void; onRemove: () => void; meta: Meta }) => {
  const { t } = useTranslation();
  const lang = currentLocale();
  const values = 'values' in value ? value.values : [];
  const setValues = (v: string[]) => onChange({ ...value, values: v } as Condition);
  const needsValues = !['set', 'not_set'].includes(value.op) && value.type !== 'REQUIREMENT';
  return (
    <div className="rounded-lg border border-line bg-surface/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <select className="input w-auto min-w-40 flex-1" value={value.type} onChange={(e) => onChange(defaultCondition(e.target.value as ConditionType))} aria-label={t('automation.editor.if')}>
          {CONDITION_TYPES.map((c) => <option key={c} value={c}>{t(`automation.conditions.${c}`)}</option>)}
        </select>
        <select className="input w-auto min-w-36 flex-1" value={value.op} onChange={(e) => onChange({ ...value, op: e.target.value } as Condition)}>
          {OPS[value.type].map((o) => <option key={o} value={o}>{t(`automation.ops.${o}`)}</option>)}
        </select>
        <button type="button" className="btn-ghost btn-sm text-danger" onClick={onRemove} aria-label={t('automation.common.remove')}><Trash2 className="size-4" /></button>
      </div>
      {needsValues && (
        <div className="mt-2.5">
          {value.type === 'VISA_TYPE' && <MultiChips options={VISA_TYPES} value={values as (typeof VISA_TYPES)[number][]} onChange={setValues} label={(v) => t(`automation.visaTypes.${v}`)} />}
          {value.type === 'CASE_STATUS' && <MultiChips options={CASE_STATUSES} value={values as CaseStatus[]} onChange={setValues} label={(s) => statusLabel(s)} />}
          {value.type === 'CLIENT_LANGUAGE' && <MultiChips options={LANGS} value={values as Lang[]} onChange={setValues} label={(l) => t(`automation.locales.${l}`)} />}
          {value.type === 'VISA_CATEGORY' && <MultiChips options={meta.visaCategories.map((c) => c.id)} value={values} onChange={setValues} label={(id) => { const c = meta.visaCategories.find((x) => x.id === id); return c ? `${c.visaLabel} ${l10nPick(c.title, lang)}`.trim() : id; }} />}
          {value.type === 'ASSIGNED_STAFF' && <MultiChips options={meta.staff.map((s) => s.id)} value={values} onChange={setValues} label={(id) => { const s = meta.staff.find((x) => x.id === id); return s ? fullName(s) : id; }} />}
          {value.type === 'COMPANY' && <MultiChips options={meta.companies.map((c) => c.id)} value={values} onChange={setValues} label={(id) => meta.companies.find((x) => x.id === id)?.name ?? id} />}
          {value.type === 'CLIENT_NATIONALITY' && (
            <input className="input" placeholder={t('automation.nationalityPh')} defaultValue={values.join(', ')} onBlur={(e) => setValues(e.target.value.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 30))} />
          )}
        </div>
      )}
      {value.type === 'REQUIREMENT' && (
        <select className="input mt-2.5" value={value.key} onChange={(e) => onChange({ ...value, key: e.target.value })}>
          <option value="">—</option>
          {meta.requirements.map((r) => <option key={r.key} value={r.key}>{l10nPick(r.title, lang) || r.key}</option>)}
        </select>
      )}
    </div>
  );
};

// ─── Actions ────────────────────────────────────────────────────────────

const TargetPicker = ({ value, onChange, meta, allowAdmins }: { value: StaffTarget; onChange: (v: StaffTarget) => void; meta: Meta; allowAdmins: boolean }) => {
  const { t } = useTranslation();
  const kinds = allowAdmins ? (['CASE_OWNER', 'USER', 'ROLE', 'ADMINS'] as const) : (['CASE_OWNER', 'USER', 'ROLE'] as const);
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <select className="input" value={value.kind} onChange={(e) => {
        const k = e.target.value as StaffTarget['kind'];
        onChange(k === 'USER' ? { kind: 'USER', userId: meta.staff[0]?.id ?? '' } : k === 'ROLE' ? { kind: 'ROLE', role: 'STAFF' } : ({ kind: k } as StaffTarget));
      }}>
        {kinds.map((k) => <option key={k} value={k}>{t(`automation.assignee.${k}`)}</option>)}
      </select>
      {value.kind === 'USER' && (
        <select className="input" value={value.userId} onChange={(e) => onChange({ kind: 'USER', userId: e.target.value })}>
          {meta.staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
        </select>
      )}
      {value.kind === 'ROLE' && (
        <select className="input" value={value.role} onChange={(e) => onChange({ kind: 'ROLE', role: e.target.value as 'STAFF' })}>
          {(['STAFF', 'ADMIN', 'SUPER_ADMIN'] as const).map((r) => <option key={r} value={r}>{t(`automation.roles.${r}`)}</option>)}
        </select>
      )}
    </div>
  );
};

const ActionBody = ({ value, onChange, meta, target }: { value: Action; onChange: (a: Action) => void; meta: Meta; target: TargetRef }) => {
  const { t } = useTranslation();
  const lang = currentLocale();
  const f = (k: string) => t(`automation.actionFields.${k}`);
  switch (value.type) {
    case 'CREATE_TASK':
      return (
        <div className="space-y-3">
          <Field label={f('title')}><TemplateInput value={value.title} onChange={(title) => onChange({ ...value, title })} target={target} maxLength={200} /></Field>
          <Field label={f('description')}><TemplateInput multiline value={value.description ?? ''} onChange={(description) => onChange({ ...value, description })} target={target} maxLength={4000} /></Field>
          <Field label={f('assignee')}><TargetPicker value={value.assignee} onChange={(assignee) => onChange({ ...value, assignee })} meta={meta} allowAdmins={false} /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={f('dueInDays')}>
              <input type="number" min={0} max={365} className="input" placeholder={f('noDue')} value={value.dueInDays ?? ''} onChange={(e) => onChange({ ...value, dueInDays: e.target.value === '' ? null : Math.max(0, Math.min(365, Number(e.target.value))) })} />
            </Field>
            <Field label={f('priority')}>
              <select className="input" value={value.priority} onChange={(e) => onChange({ ...value, priority: e.target.value as 'NORMAL' })}>
                {(['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const).map((p) => <option key={p} value={p}>{t(`automation.priority.${p}`)}</option>)}
              </select>
            </Field>
          </div>
        </div>
      );
    case 'SEND_CLIENT_MESSAGE':
      return (
        <div className="space-y-3">
          <Field label={f('channels')}><MultiChips options={['EMAIL', 'IN_APP', 'SMS'] as const} value={value.channels} onChange={(channels) => channels.length && onChange({ ...value, channels })} label={(c) => t(`automation.channels.${c}`)} /></Field>
          <div className="flex flex-wrap gap-3 text-sm">
            {(['CUSTOM', 'TEMPLATE'] as const).map((k) => (
              <label key={k} className="flex items-center gap-2">
                <input type="radio" className="size-4" checked={value.message.kind === k} onChange={() => onChange({ ...value, message: k === 'TEMPLATE' ? { kind: 'TEMPLATE', key: meta.notificationTemplates[0] ?? 'CASE_CREATED' } : { kind: 'CUSTOM', title: { az: '', de: '', en: '', ru: '' }, body: { az: '', de: '', en: '', ru: '' } } })} />
                {f(k === 'TEMPLATE' ? 'template' : 'custom')}
              </label>
            ))}
          </div>
          {value.message.kind === 'TEMPLATE' ? (
            <select className="input" value={value.message.key} onChange={(e) => onChange({ ...value, message: { kind: 'TEMPLATE', key: e.target.value } })}>
              {meta.notificationTemplates.map((k) => <option key={k} value={k}>{t(`automation.notificationTypes.${k}`, { defaultValue: k })}</option>)}
            </select>
          ) : (
            <>
              <Field label={f('title')}><L10nTemplate value={value.message.title} onChange={(title) => value.message.kind === 'CUSTOM' && onChange({ ...value, message: { ...value.message, title } })} target={target} maxLength={200} /></Field>
              <Field label={f('body')}><L10nTemplate multiline value={value.message.body} onChange={(body) => value.message.kind === 'CUSTOM' && onChange({ ...value, message: { ...value.message, body } })} target={target} maxLength={4000} /></Field>
            </>
          )}
          <p className="text-xs text-muted">{f('autoLanguage')}</p>
        </div>
      );
    case 'NOTIFY_STAFF':
      return (
        <div className="space-y-3">
          <Field label={f('target')}><TargetPicker value={value.target} onChange={(tg) => onChange({ ...value, target: tg })} meta={meta} allowAdmins /></Field>
          <Field label={f('title')}><TemplateInput value={value.title} onChange={(title) => onChange({ ...value, title })} target={target} maxLength={200} /></Field>
          <Field label={f('body')}><TemplateInput multiline value={value.body} onChange={(body) => onChange({ ...value, body })} target={target} maxLength={4000} /></Field>
        </div>
      );
    case 'REQUEST_DOCUMENT':
      return (
        <div className="space-y-3">
          <Field label={f('requirement')}>
            <select className="input" value={value.requirementKey} onChange={(e) => {
              const r = meta.requirements.find((x) => x.key === e.target.value);
              onChange({ ...value, requirementKey: e.target.value, title: r ? { az: r.title.az ?? '', de: r.title.de ?? '', en: r.title.en ?? '', ru: r.title.ru ?? '' } : value.title });
            }}>
              <option value="">—</option>
              {meta.requirements.map((r) => <option key={r.key} value={r.key}>{l10nPick(r.title, lang) || r.key}</option>)}
            </select>
          </Field>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={value.notifyClient} onChange={(e) => onChange({ ...value, notifyClient: e.target.checked })} /> {f('notifyClient')}</label>
        </div>
      );
    case 'CHANGE_STATUS':
      return (
        <div className="space-y-3">
          <Field label={f('to')} hint={t('automation.actionFields.transitionHint', { from: (meta.transitions[value.to] ?? []).map((s) => statusLabel(s as CaseStatus)).join(', ') })}>
            <select className="input" value={value.to} onChange={(e) => onChange({ ...value, to: e.target.value as 'CANCELLED' })}>
              {Object.keys(meta.transitions).map((s) => <option key={s} value={s}>{statusLabel(s as CaseStatus)}</option>)}
            </select>
          </Field>
          <Field label={f('note')}><TemplateInput multiline value={value.note} onChange={(note) => onChange({ ...value, note })} target={target} maxLength={1000} /></Field>
        </div>
      );
    case 'ASSIGN':
      return (
        <div className="space-y-3">
          <Field label={f('mode')}>
            <select className="input" value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value as 'AUTO', userId: e.target.value === 'USER' ? meta.staff[0]?.id : undefined })}>
              {(['AUTO', 'USER'] as const).map((m) => <option key={m} value={m}>{t(`automation.assignMode.${m}`)}</option>)}
            </select>
          </Field>
          {value.mode === 'USER' && (
            <select className="input" value={value.userId ?? ''} onChange={(e) => onChange({ ...value, userId: e.target.value })} aria-label={f('assignee')}>
              {meta.staff.map((s) => <option key={s.id} value={s.id}>{fullName(s)}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={value.onlyIfUnassigned} onChange={(e) => onChange({ ...value, onlyIfUnassigned: e.target.checked })} /> {f('onlyIfUnassigned')}</label>
        </div>
      );
    case 'ADD_NOTE':
      return <Field label={f('text')}><TemplateInput multiline value={value.text} onChange={(text) => onChange({ ...value, text })} target={target} maxLength={4000} /></Field>;
    case 'WEBHOOK':
      return <p className="text-sm text-muted">{f('webhookHint')}</p>;
  }
};

const ActionCard = ({ index, count, value, onChange, onMove, onRemove, meta, target }: { index: number; count: number; value: Action; onChange: (a: Action) => void; onMove: (d: -1 | 1) => void; onRemove: () => void; meta: Meta; target: TargetRef }) => {
  const { t } = useTranslation();
  const delayed = !!value.delay;
  return (
    <div className="rounded-lg border border-line bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface/50 px-3 py-2">
        <span className="text-xs font-bold text-muted">{t('automation.editor.step', { n: index + 1 })}</span>
        <select className="input w-auto min-w-44 flex-1 py-1.5" value={value.type} onChange={(e) => onChange({ ...defaultAction(e.target.value as Action['type']), delay: value.delay, onlyIfStillTrue: value.onlyIfStillTrue })}>
          {ACTION_TYPES.map((a) => <option key={a} value={a}>{t(`automation.actions.${a}`)}</option>)}
        </select>
        <button type="button" className="btn-ghost btn-sm" disabled={index === 0} onClick={() => onMove(-1)} aria-label={t('automation.common.moveUp')}><ArrowUp className="size-4" /></button>
        <button type="button" className="btn-ghost btn-sm" disabled={index === count - 1} onClick={() => onMove(1)} aria-label={t('automation.common.moveDown')}><ArrowDown className="size-4" /></button>
        <button type="button" className="btn-ghost btn-sm text-danger" disabled={count === 1} onClick={onRemove} aria-label={t('automation.common.remove')}><Trash2 className="size-4" /></button>
      </div>
      <div className="space-y-3 p-3">
        <ActionBody value={value} onChange={onChange} meta={meta} target={target} />
        <div className="flex flex-wrap items-center gap-2 border-t border-dashed border-line pt-3 text-sm">
          <span className="font-semibold text-navy-900">{t('automation.editor.delay')}:</span>
          <select className="input w-auto py-1.5" value={value.delay?.unit ?? ''} onChange={(e) => onChange({ ...value, delay: e.target.value ? { amount: value.delay?.amount ?? 1, unit: e.target.value as 'HOURS' } : null, onlyIfStillTrue: e.target.value ? value.onlyIfStillTrue : false })}>
            <option value="">{t('automation.editor.noDelay')}</option>
            <option value="HOURS">{t('automation.editor.hours')}</option>
            <option value="DAYS">{t('automation.editor.days')}</option>
          </select>
          {delayed && (
            <>
              <input type="number" min={1} max={365} className="input w-20 py-1.5" value={value.delay!.amount} onChange={(e) => onChange({ ...value, delay: { ...value.delay!, amount: Math.max(1, Math.min(365, Number(e.target.value) || 1)) } })} aria-label={t('automation.editor.delay')} />
              <span className="text-muted">{t('automation.editor.after')}</span>
              <label className="flex items-center gap-2" title={t('automation.editor.onlyIfStillTrueHint')}>
                <input type="checkbox" className="size-4" checked={!!value.onlyIfStillTrue} onChange={(e) => onChange({ ...value, onlyIfStillTrue: e.target.checked })} /> {t('automation.editor.onlyIfStillTrue')}
              </label>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Dry run ────────────────────────────────────────────────────────────

interface CaseHit { id: string; number: string; status: CaseStatus; client?: { firstName: string; lastName: string } | null }

const resultLine = (a: DryRun['actions'][number]) => {
  const r = a.result ?? {};
  const parts: string[] = [];
  const s = (v: unknown) => (typeof v === 'string' ? v : '');
  if (s(r.title)) parts.push(s(r.title));
  const who = (r.assignee ?? r.to) as { name?: string } | string | undefined;
  if (who && typeof who === 'object' && who.name) parts.push(`→ ${who.name}`);
  if (typeof r.to === 'string') parts.push(`→ ${statusLabel(r.to as CaseStatus)}`);
  if (Array.isArray(r.recipients)) parts.push(`→ ${(r.recipients as { name: string }[]).map((x) => x.name).join(', ')}`);
  if (s(r.note)) parts.push(s(r.note));
  if (r.channels && typeof r.channels === 'object') parts.push(Object.entries(r.channels as Record<string, string>).map(([k, v]) => `${k}: ${reasonText(v)}`).join(' · '));
  if (typeof r.subscribedWebhooks === 'number') parts.push(`webhooks: ${r.subscribedWebhooks}`);
  if (s(r.body)) parts.push(s(r.body).slice(0, 240));
  return parts.join('\n');
};

const TestPanel = ({ draft }: { draft: RuleDraft }) => {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<CaseHit | null>(null);
  const needsCase = !['APPLICATION_STATUS_CHANGED', 'BOOKING_CREATED', 'INQUIRY_CREATED'].includes(draft.trigger.type);
  const search = useQuery({
    queryKey: ['automation-case-search', q],
    queryFn: async () => (await api.get<{ items: CaseHit[] }>('/admin/cases', { params: { search: q } })).data.items.slice(0, 8),
    enabled: q.trim().length >= 2,
  });
  const run = useMutation({
    mutationFn: async () => (await api.post<DryRun>('/admin/automation/test', { rule: { ...draft, enabled: undefined }, caseId: picked?.id })).data,
    onError: toastAutomationError,
  });
  const res = run.data;
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{needsCase ? t('automation.editor.saveFirst') : t('automation.test.latestEntity')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <span className="label">{t('automation.test.pick')}</span>
          <Search className="pointer-events-none absolute bottom-3 left-3 size-4 text-muted" aria-hidden />
          <input className="input pl-9" value={picked ? `${picked.number}${picked.client ? ` · ${fullName(picked.client)}` : ''}` : q} placeholder={t('automation.test.search')} onChange={(e) => { setPicked(null); setQ(e.target.value); }} />
          {!picked && q.trim().length >= 2 && (
            <ul className="absolute inset-x-0 top-full z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-line bg-white shadow-lg">
              {search.isLoading && <li className="px-3 py-2"><Spinner className="size-4 text-brand-600" /></li>}
              {search.data?.length === 0 && <li className="px-3 py-2 text-sm text-muted">{t('automation.test.noResults')}</li>}
              {search.data?.map((c) => (
                <li key={c.id}>
                  <button type="button" className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-surface" onClick={() => setPicked(c)}>
                    <span className="truncate"><span className="font-semibold text-navy-900">{c.number}</span>{c.client ? ` · ${fullName(c.client)}` : ''}</span>
                    <span className="shrink-0 text-xs text-muted">{statusLabel(c.status)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button type="button" className="btn-primary btn-sm" disabled={run.isPending || (needsCase && !picked)} onClick={() => run.mutate()}>
          {run.isPending ? <Spinner className="size-3.5" /> : <FlaskConical className="size-3.5" />} {t('automation.test.run')}
        </button>
      </div>
      {res && (
        <div className="space-y-3 rounded-lg border border-line bg-surface/40 p-3 text-sm" aria-live="polite">
          <p className={clsx('flex items-center gap-2 font-semibold', res.matched ? 'text-emerald-700' : 'text-amber-800')}>
            {res.matched ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />} {res.matched ? t('automation.test.matched') : t('automation.test.notMatched')}
          </p>
          <div>
            <p className="text-xs font-bold text-muted uppercase">{t('automation.test.trigger')}</p>
            <p>{res.trigger.ok ? t('automation.test.ok') : `${t('automation.test.fail')}: ${reasonText(res.trigger.reason)}`}</p>
          </div>
          {res.conditions.length > 0 && (
            <div>
              <p className="text-xs font-bold text-muted uppercase">{t('automation.test.conditions')}</p>
              <ul className="space-y-0.5">
                {res.conditions.map((c) => (
                  <li key={c.index} className={c.ok ? 'text-emerald-700' : 'text-red-700'}>
                    {c.ok ? '✓' : '✗'} {t(`automation.conditions.${c.type}`)} {c.seen !== undefined && <span className="text-muted">({t('automation.test.seen', { value: c.seen ?? '—' })})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className="text-xs font-bold text-muted uppercase">{t('automation.test.actions')}</p>
            <ol className="space-y-2">
              {res.actions.map((a) => (
                <li key={a.index} className="rounded-md border border-line bg-white p-2">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-navy-900">
                    {a.index + 1}. {t(`automation.actions.${a.type}`)}
                    {a.delayMs > 0 && <span className="badge bg-warning-bg text-warning-fg">{t('automation.test.delayed', { time: fmtDelay(a.delayMs) })}</span>}
                    <span className={clsx('badge', a.status === 'SUCCEEDED' ? 'bg-success-bg text-success-fg' : a.status === 'SKIPPED' ? 'bg-neutral-bg text-neutral-fg' : 'bg-danger-bg text-danger-fg')}>{t(`automation.runs.step.${a.status}`)}</span>
                  </p>
                  {a.reason && <p className="text-xs text-muted">{reasonText(a.reason)}</p>}
                  {resultLine(a) && <p className="mt-1 text-xs whitespace-pre-wrap text-ink/80">{resultLine(a)}</p>}
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Editor ─────────────────────────────────────────────────────────────

export const blankRule = (): RuleDraft => ({ name: '', description: null, enabled: false, trigger: defaultTrigger('CASE_CREATED'), conditions: [], actions: [defaultAction('CREATE_TASK')] });

/** Click-only rule editor (drawer): WHEN · IF · THEN, placeholder picker, dry run. */
export const RuleEditor = ({ open, ruleId, initial, meta, onClose }: { open: boolean; ruleId: string | null; initial: RuleDraft; meta: Meta; onClose: () => void }) => {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<RuleDraft>(initial);
  const [showTest, setShowTest] = useState(false);
  const target = useTemplateTarget();
  useEffect(() => {
    if (open) {
      setDraft(initial);
      setShowTest(false);
    }
  }, [open, initial]);

  const save = useMutation({
    mutationFn: async () => {
      const body = { ...draft, description: draft.description?.trim() || null };
      return ruleId ? api.put(`/admin/automation/rules/${ruleId}`, body) : api.post('/admin/automation/rules', body);
    },
    onSuccess: () => {
      toast.success(t('automation.common.saved'));
      void qc.invalidateQueries({ queryKey: ['automation-rules'] });
      onClose();
    },
    onError: toastAutomationError,
  });

  const setAction = (i: number, a: Action) => setDraft((d) => ({ ...d, actions: d.actions.map((x, j) => (j === i ? a : x)) }));
  const moveAction = (i: number, dir: -1 | 1) =>
    setDraft((d) => {
      const list = [...d.actions];
      const j = i + dir;
      if (j < 0 || j >= list.length) return d;
      [list[i], list[j]] = [list[j], list[i]];
      return { ...d, actions: list };
    });

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={ruleId ? t('automation.editor.titleEdit') : t('automation.editor.titleNew')}
      footer={
        <>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setShowTest((v) => !v)}><FlaskConical className="size-3.5" /> {t('automation.test.button')}</button>
          <button type="button" className="btn-secondary btn-sm" onClick={onClose}>{t('automation.common.cancel')}</button>
          <button type="button" className="btn-primary btn-sm" disabled={save.isPending || !draft.name.trim()} onClick={() => save.mutate()}>
            {save.isPending ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />} {t('automation.common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('automation.editor.name')}><input className="input" value={draft.name} maxLength={160} onChange={(e) => setDraft({ ...draft, name: e.target.value })} data-autofocus /></Field>
        <Field label={t('automation.editor.description')}><textarea className="input min-h-16" value={draft.description ?? ''} maxLength={2000} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={draft.enabled} onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })} /> {t('automation.editor.enabled')}</label>

        <Section title={t('automation.editor.when')} tone="bg-brand-50 text-brand-800">
          <TriggerEditor value={draft.trigger} onChange={(trigger) => setDraft({ ...draft, trigger })} />
        </Section>

        <Section title={t('automation.editor.if')} tone="bg-amber-50 text-amber-900">
          {draft.conditions.length === 0 && <p className="text-sm text-muted">{t('automation.editor.noConditions')}</p>}
          {draft.conditions.map((c, i) => (
            <ConditionRow key={i} value={c} meta={meta} onChange={(nc) => setDraft((d) => ({ ...d, conditions: d.conditions.map((x, j) => (j === i ? nc : x)) }))} onRemove={() => setDraft((d) => ({ ...d, conditions: d.conditions.filter((_, j) => j !== i) }))} />
          ))}
          <button type="button" className="btn-secondary btn-sm" disabled={draft.conditions.length >= 20} onClick={() => setDraft((d) => ({ ...d, conditions: [...d.conditions, defaultCondition('VISA_TYPE')] }))}>
            <Plus className="size-3.5" /> {t('automation.editor.addCondition')}
          </button>
        </Section>

        <Section title={t('automation.editor.then')} tone="bg-emerald-50 text-emerald-900">
          {draft.actions.map((a, i) => (
            <ActionCard key={i} index={i} count={draft.actions.length} value={a} meta={meta} target={target.ref} onChange={(na) => setAction(i, na)} onMove={(d) => moveAction(i, d)} onRemove={() => setDraft((d) => ({ ...d, actions: d.actions.filter((_, j) => j !== i) }))} />
          ))}
          <button type="button" className="btn-secondary btn-sm" disabled={draft.actions.length >= 10} onClick={() => setDraft((d) => ({ ...d, actions: [...d.actions, defaultAction('NOTIFY_STAFF')] }))}>
            <Plus className="size-3.5" /> {t('automation.editor.addAction')}
          </button>
        </Section>

        <section className="rounded-xl border border-line bg-white p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-navy-900"><Braces className="size-4 text-brand-600" /> {t('automation.editor.placeholders')}</h3>
          <p className="mt-1 mb-2 text-xs text-muted">{t('automation.editor.placeholdersHint')}</p>
          <div className="flex flex-wrap gap-1.5">
            {meta.placeholders.map((p) => (
              <button key={p} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => target.insert(p)} className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink/80 hover:border-brand-400 hover:text-navy-900" title={`{{${p}}}`}>
                {t(phKey(p), { defaultValue: p })}
              </button>
            ))}
          </div>
        </section>

        {showTest && (
          <Section title={t('automation.test.title')} tone="bg-slate-100 text-slate-800">
            <TestPanel draft={draft} />
          </Section>
        )}
      </div>
    </Drawer>
  );
};
