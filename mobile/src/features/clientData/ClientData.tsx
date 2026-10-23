import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { Check, CheckCircle2, ChevronRight, ExternalLink, FileText, Plus, ShieldCheck, Trash2 } from '@/components/icons';
import { Button, Card, ErrorState, Field, Section, SkeletonList, Text, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { WEB_URL } from '@/lib/config';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { currentLanguage } from '@/i18n';
import '@/i18n/clientData';
import { colors, radius } from '@/theme';

/**
 * Client data on the phone (native): the "Your details" card of the case screen, the questionnaire form and
 * the data confirmation. Server: /api/client-data (same endpoints as the web portal). File answers and photo
 * proofs open the web portal (uploads stay in one place).
 */

type L10n = { az: string; de: string; en: string; ru: string };
type FieldType = 'text' | 'textarea' | 'number' | 'date' | 'select' | 'multi' | 'yesno' | 'group' | 'file';
interface FormField {
  key: string;
  type: FieldType;
  label: L10n;
  help?: L10n | null;
  required?: boolean;
  options?: { value: string; label: L10n }[];
  fields?: FormField[];
  maxRows?: number;
  showIf?: { field: string; equals: string | boolean } | null;
}
type Answers = Record<string, unknown>;
type FormStatus = 'SENT' | 'DRAFT' | 'SUBMITTED' | 'APPLIED' | 'CANCELLED';
interface ClientForm {
  id: string;
  title: L10n;
  fields: FormField[];
  answers: Answers;
  status: FormStatus;
  note: string | null;
  dueAt: string | null;
  editable: boolean;
}
interface Tasks {
  forms: { id: string; title: L10n; status: FormStatus; dueAt: string | null }[];
  confirmation: { id: string; status: 'PENDING' | 'SUBMITTED' | 'CONFIRMED'; fields: number } | null;
}
interface Confirmation {
  id: string;
  status: string;
  fields: { key: string; section: string; label: L10n; value: string }[];
  answers: Record<string, { ok: boolean; value?: string }>;
  editable: boolean;
}

const tasksKey = (caseId: string) => ['client-data-tasks', caseId] as const;
const useTr = () => {
  const { i18n } = useTranslation();
  const lang = (i18n.language?.slice(0, 2) ?? 'az') as keyof L10n;
  return (v: L10n | null | undefined) => (v ? v[lang] || v.az || v.en || '' : '');
};
const isVisible = (f: FormField, a: Answers) => {
  if (!f.showIf) return true;
  const v = a[f.showIf.field];
  if (typeof f.showIf.equals === 'boolean') return v === f.showIf.equals;
  return Array.isArray(v) ? v.includes(f.showIf.equals) : v === f.showIf.equals;
};
const empty = (v: unknown) => v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0);
const missingOf = (fields: FormField[], a: Answers) => {
  const out = new Set<string>();
  for (const f of fields) {
    if (!isVisible(f, a)) continue;
    if (f.required && empty(a[f.key])) out.add(f.key);
    if (f.type === 'group' && Array.isArray(a[f.key])) (a[f.key] as Answers[]).forEach((r, i) => (f.fields ?? []).forEach((s) => s.required && empty(r[s.key]) && out.add(`${f.key}.${i}.${s.key}`)));
  }
  return out;
};
const openWeb = (path: string) => void WebBrowser.openBrowserAsync(`${WEB_URL}${path}?lng=${currentLanguage()}`);

// ─── Case screen card ──────────────────────────────────────────────

export const ClientDataSection = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const tr = useTr();
  const f = useFormat();
  const { data } = useQuery({ queryKey: tasksKey(caseId), queryFn: async () => (await api.get<Tasks>(`/client-data/cases/${caseId}/tasks`)).data, refetchInterval: 60_000 });
  if (!data || (!data.forms.length && !data.confirmation)) return null;
  const open = (s: FormStatus) => s === 'SENT' || s === 'DRAFT';
  const rows: { key: string; title: string; sub: string; todo: boolean; onPress: () => void; icon: typeof FileText }[] = [];
  if (data.confirmation) {
    const c = data.confirmation;
    rows.push({ key: 'confirm', title: t('m.cd.confirmTitle'), sub: c.status === 'PENDING' ? t('m.cd.confirmTodo', { count: c.fields }) : c.status === 'SUBMITTED' ? t('m.cd.confirmInReview') : t('m.cd.confirmOk'), todo: c.status === 'PENDING', icon: ShieldCheck, onPress: () => router.push({ pathname: '/client-data/confirm', params: { caseId } }) });
  }
  for (const fm of [...data.forms].sort((a, b) => Number(open(b.status)) - Number(open(a.status)))) {
    rows.push({ key: fm.id, title: tr(fm.title), sub: open(fm.status) ? (fm.dueAt ? t('m.cd.due', { date: f.date(fm.dueAt) }) : t('m.cd.formOpen')) : t('m.cd.formDone'), todo: open(fm.status), icon: FileText, onPress: () => router.push({ pathname: '/client-data/form', params: { caseId, formId: fm.id } }) });
  }
  return (
    <Section title={t('m.cd.title')} icon={ShieldCheck}>
      <Text variant="small" style={{ marginBottom: 10 }}>
        {t('m.cd.hint')}
      </Text>
      <View style={{ gap: 8 }}>
        {rows.map((r) => {
          const Icon = r.todo ? r.icon : CheckCircle2;
          return (
            <Pressable key={r.key} accessibilityRole="button" onPress={() => { haptic.tap(); r.onPress(); }} style={({ pressed }) => [styles.row, r.todo && styles.rowTodo, pressed && { opacity: 0.8 }]}>
              <View style={[styles.rowIcon, { backgroundColor: r.todo ? colors.blue : colors.successSoft }]}>
                <Icon size={16} color={r.todo ? colors.white : colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text variant="title">{r.title}</Text>
                <Text variant="caption">{r.sub}</Text>
              </View>
              <ChevronRight size={18} color={colors.muted} />
            </Pressable>
          );
        })}
      </View>
    </Section>
  );
};

// ─── Questionnaire ─────────────────────────────────────────────────

const Choice = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={() => { haptic.select(); onPress(); }} style={[styles.choice, active && styles.choiceActive]}>
    <Text variant="label" color={active ? colors.white : colors.ink}>
      {label}
    </Text>
  </Pressable>
);

const Input = ({ f, value, onChange, error }: { f: FormField; value: unknown; onChange: (v: unknown) => void; error: boolean }) => {
  const { t } = useTranslation();
  const tr = useTr();
  const label = `${tr(f.label)}${f.required ? ' *' : ''}`;
  const hint = f.help ? tr(f.help) || undefined : undefined;
  const err = error ? t('m.cd.required') : null;
  switch (f.type) {
    case 'yesno':
    case 'select':
    case 'multi': {
      const opts = f.type === 'yesno' ? [{ v: true as unknown, l: t('m.cd.yes') }, { v: false as unknown, l: t('m.cd.no') }] : (f.options ?? []).map((o) => ({ v: o.value as unknown, l: tr(o.label) }));
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      return (
        <View style={{ gap: 6 }}>
          <Text variant="label">{label}</Text>
          {hint ? <Text variant="caption">{hint}</Text> : null}
          <View style={styles.choices}>
            {opts.map((o) => (
              <Choice key={String(o.v)} label={o.l} active={f.type === 'multi' ? arr.includes(o.v) : value === o.v} onPress={() => onChange(f.type === 'multi' ? (arr.includes(o.v) ? arr.filter((x) => x !== o.v) : [...arr, o.v]) : o.v)} />
            ))}
          </View>
          {err ? <Text variant="caption" color={colors.danger}>{err}</Text> : null}
        </View>
      );
    }
    case 'file':
      return (
        <View style={{ gap: 6 }}>
          <Text variant="label">{label}</Text>
          <Text variant="caption">{Array.isArray(value) && value.length ? `✓ ${value.length}` : t('m.cd.fileOnWeb')}</Text>
        </View>
      );
    default:
      return (
        <Field
          label={label}
          hint={hint}
          error={err}
          value={value === undefined || value === null ? '' : String(value)}
          multiline={f.type === 'textarea'}
          keyboardType={f.type === 'number' ? 'numeric' : 'default'}
          placeholder={f.type === 'date' ? t('m.cd.datePlaceholder') : undefined}
          maxLength={f.type === 'textarea' ? 4000 : 500}
          onChangeText={(s) => onChange(f.type === 'number' ? (s === '' ? undefined : Number(s.replace(',', '.'))) : s || undefined)}
        />
      );
  }
};

export const FormScreenBody = ({ caseId, formId }: { caseId: string; formId: string }) => {
  const { t } = useTranslation();
  const tr = useTr();
  const toast = useToast();
  const message = useErrorMessage();
  const qc = useQueryClient();
  const key = ['client-case-form', caseId, formId];
  const { data, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ form: ClientForm }>(`/client-data/cases/${caseId}/forms/${formId}`)).data.form });
  const [answers, setAnswers] = useState<Answers>({});
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<'save' | 'submit' | null>(null);
  useEffect(() => {
    if (data) setAnswers(data.answers ?? {});
  }, [data]);

  if (isLoading && !data) return <SkeletonList count={4} />;
  if (!data) return <ErrorState error={error} onRetry={() => void refetch()} />;
  const set = (k: string, v: unknown) => setAnswers((a) => ({ ...a, [k]: v }));
  const save = async () => {
    setBusy('save');
    try {
      await api.put(`/client-data/cases/${caseId}/forms/${formId}`, { answers });
      toast(t('m.cd.saved'));
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(null);
    }
  };
  const submit = async () => {
    const m = missingOf(data.fields, answers);
    setMissing(m);
    if (m.size) {
      haptic.error();
      toast(t('m.cd.missing'), 'error');
      return;
    }
    setBusy('submit');
    try {
      await api.post(`/client-data/cases/${caseId}/forms/${formId}/submit`, { answers });
      toast(t('m.cd.submitted'));
      await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: tasksKey(caseId) })]);
      router.back();
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Card>
        <Text variant="h2">{tr(data.title)}</Text>
        {data.note ? <Text variant="small" style={{ marginTop: 6 }}>{data.note}</Text> : null}
        {!data.editable ? <Text variant="small" color={colors.success} style={{ marginTop: 6 }}>{t('m.cd.readOnly')}</Text> : null}
      </Card>
      <Card>
        <View style={{ gap: 16 }} pointerEvents={data.editable ? 'auto' : 'none'}>
          {data.fields
            .filter((f) => isVisible(f, answers))
            .map((f) => {
              if (f.type !== 'group') return <Input key={f.key} f={f} value={answers[f.key]} error={missing.has(f.key)} onChange={(v) => set(f.key, v)} />;
              const rows = Array.isArray(answers[f.key]) ? (answers[f.key] as Answers[]) : [];
              return (
                <View key={f.key} style={[styles.group, missing.has(f.key) && { borderColor: colors.danger }]}>
                  <Text variant="label">{`${tr(f.label)}${f.required ? ' *' : ''}`}</Text>
                  {rows.map((r, i) => (
                    <View key={i} style={styles.groupRow}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text variant="caption">#{i + 1}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={t('m.cd.remove')} hitSlop={10} onPress={() => set(f.key, rows.filter((_, j) => j !== i))}>
                          <Trash2 size={18} color={colors.muted} />
                        </Pressable>
                      </View>
                      {(f.fields ?? []).map((s) => (
                        <Input key={s.key} f={s} value={r[s.key]} error={missing.has(`${f.key}.${i}.${s.key}`)} onChange={(v) => set(f.key, rows.map((x, j) => (j === i ? { ...x, [s.key]: v } : x)))} />
                      ))}
                    </View>
                  ))}
                  {rows.length < (f.maxRows ?? 20) ? <Button title={t('m.cd.addRow')} variant="secondary" size="sm" icon={Plus} onPress={() => set(f.key, [...rows, {}])} /> : null}
                </View>
              );
            })}
        </View>
      </Card>
      {data.fields.some((f) => f.type === 'file') ? <Button title={t('m.cd.fileOnWeb')} variant="ghost" icon={ExternalLink} onPress={() => openWeb(`/account/cases/${caseId}/forms/${formId}`)} /> : null}
      {data.editable ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Button title={t('m.cd.saveDraft')} variant="secondary" loading={busy === 'save'} disabled={!!busy} onPress={() => void save()} style={{ flex: 1 }} />
          <Button title={t('m.cd.submit')} loading={busy === 'submit'} disabled={!!busy} onPress={() => void submit()} style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
};

// ─── Data confirmation ─────────────────────────────────────────────

export const ConfirmScreenBody = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const tr = useTr();
  const toast = useToast();
  const message = useErrorMessage();
  const qc = useQueryClient();
  const key = ['client-confirmation', caseId];
  const { data, isLoading, error, refetch } = useQuery({ queryKey: key, queryFn: async () => (await api.get<{ confirmation: Confirmation | null; sections: Record<string, L10n> }>(`/client-data/cases/${caseId}/confirmation`)).data });
  const [draft, setDraft] = useState<Record<string, { ok: boolean; value?: string }>>({});
  const [busy, setBusy] = useState(false);
  const conf = data?.confirmation ?? null;
  const answers = conf?.editable ? draft : (conf?.answers ?? {});
  const done = useMemo(() => (conf?.fields ?? []).filter((f) => answers[f.key] && (answers[f.key].ok || answers[f.key].value?.trim())).length, [conf, answers]);

  if (isLoading && !data) return <SkeletonList count={5} />;
  if (!data) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!conf) return <Card><Text variant="body">{t('m.cd.none')}</Text></Card>;
  const total = conf.fields.length;
  const submit = async () => {
    if (done < total) {
      toast(t('m.cd.answerAll'), 'error');
      return;
    }
    setBusy(true);
    try {
      await api.post(`/client-data/cases/${caseId}/confirmation/submit`, { answers: draft });
      toast(t('m.cd.confirmSent'));
      await Promise.all([qc.invalidateQueries({ queryKey: key }), qc.invalidateQueries({ queryKey: tasksKey(caseId) })]);
      router.back();
    } catch (err) {
      toast(message(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: 14 }}>
      <Card>
        <Text variant="h2">{t('m.cd.confirmTitle')}</Text>
        <Text variant="small" style={{ marginTop: 6 }}>{t('m.cd.confirmIntro')}</Text>
        {conf.editable ? <Text variant="caption" style={{ marginTop: 8 }}>{t('m.cd.progress', { done, total })}</Text> : null}
      </Card>
      {conf.fields.map((f) => {
        const a = answers[f.key];
        return (
          <Card key={f.key}>
            <Text variant="caption">{tr(f.label)}</Text>
            <Text variant="title" style={[{ marginTop: 2 }, a && !a.ok ? { textDecorationLine: 'line-through', opacity: 0.6 } : null]}>{f.value || t('m.cd.empty')}</Text>
            {conf.editable ? (
              <View style={[styles.choices, { marginTop: 10 }]}>
                <Choice label={t('m.cd.correct')} active={a?.ok === true} onPress={() => setDraft((d) => ({ ...d, [f.key]: { ok: true } }))} />
                <Choice label={t('m.cd.fix')} active={a?.ok === false} onPress={() => setDraft((d) => ({ ...d, [f.key]: { ok: false, value: a?.ok === false ? a.value : f.value } }))} />
              </View>
            ) : a ? (
              <Text variant="label" color={a.ok ? colors.success : colors.warning} style={{ marginTop: 6 }}>{a.ok ? t('m.cd.correct') : `✏️ ${a.value ?? ''}`}</Text>
            ) : null}
            {conf.editable && a?.ok === false ? (
              <View style={{ marginTop: 10 }}>
                <Field label={t('m.cd.correctValue')} value={a.value ?? ''} maxLength={300} onChangeText={(s) => setDraft((d) => ({ ...d, [f.key]: { ok: false, value: s } }))} />
              </View>
            ) : null}
          </Card>
        );
      })}
      {conf.editable ? (
        <>
          <Text variant="caption" center>{t('m.cd.evidence')}</Text>
          <Button title={t('m.cd.proofOnWeb')} variant="ghost" icon={ExternalLink} onPress={() => openWeb(`/account/cases/${caseId}/confirm`)} />
          <Button title={t('m.cd.confirmSubmit')} icon={Check} loading={busy} disabled={busy} onPress={() => void submit()} full />
        </>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12, backgroundColor: colors.card },
  rowTodo: { borderColor: colors.blue, backgroundColor: colors.blueSoft },
  rowIcon: { width: 34, height: 34, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 44, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  choiceActive: { backgroundColor: colors.blue, borderColor: colors.blue },
  group: { gap: 10, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12 },
  groupRow: { gap: 10, backgroundColor: colors.surface, borderRadius: radius.sm, padding: 10 },
});
