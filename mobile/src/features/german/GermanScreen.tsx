import '@/i18n/german';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarCheck, CheckCircle2, ExternalLink, Flame, Layers, Play, RotateCcw } from '@/components/icons';
import { Button, Card, Chips, ErrorState, ScrollScreen, Section, SkeletonCard, Text, useToast } from '@/components/ui';
import { currentLanguage } from '@/i18n';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useErrorMessage } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';

/**
 * German screen of the client app: daily vocabulary practice (server-side SM-2 scheduling, streak,
 * job-field filter) and the upcoming Goethe / telc / ÖSD exam dates with "I have registered".
 * Same API as the web portal (/api/german/vocab*, /api/german/me).
 */

const FIELDS = ['GENERAL', 'WORK', 'CARE', 'CONSTRUCTION', 'HOSPITALITY', 'DRIVING'] as const;
const LEVELS = ['A1', 'A2', 'B1', 'B2'] as const;
const GRADES = { again: 1, hard: 3, good: 4, easy: 5 } as const;
type GradeKey = keyof typeof GRADES;

interface Group {
  key: string;
  total: number;
  started: number;
  learned: number;
}
interface Summary {
  profileLevel: string;
  recommendedLevel: string;
  streak: { current: number; best: number; practisedToday: boolean };
  today: { reviews: number; correct: number; newWords: number; goal: number; newLimit: number };
  due: number;
  total: number;
  learned: number;
  levels: Group[];
  fields: Group[];
}
interface WordCard {
  id: string;
  de: string;
  article: string | null;
  plural: string | null;
  example: string | null;
  level: string;
  field: string;
  translations: { az: string; ru: string; en: string };
  state: 'new' | 'review';
  preview: Record<GradeKey, number>;
}
interface ExamDate {
  id: string;
  provider: string;
  level: string | null;
  city: string;
  location: string | null;
  examDate: string;
  registrationDeadline: string | null;
  link: string | null;
}
interface Overview {
  level: string;
  examDates: ExamDate[];
  exams: { id: string; examDateId: string | null; status: string }[];
}

export const VOCAB_QK = ['german', 'vocab'] as const;
const OVERVIEW_QK = ['german', 'me'] as const;

export const useVocabSummary = (enabled = true) =>
  useQuery({ queryKey: VOCAB_QK, queryFn: async () => (await api.get<Summary>('/german/vocab')).data, enabled, staleTime: 30_000 });

const wordLabel = (c: Pick<WordCard, 'article' | 'de'>) => (c.article ? `${c.article} ${c.de}` : c.de);
const translationOf = (c: WordCard) => {
  const lng = currentLanguage();
  return (lng === 'az' || lng === 'ru' ? c.translations[lng] : c.translations.en) || c.translations.en;
};

const Bar = ({ value, max, color = colors.blue }: { value: number; max: number; color?: string }) => (
  <View style={styles.bar}>
    <View style={[styles.barFill, { backgroundColor: color, width: `${max ? Math.min(100, Math.round((value / max) * 100)) : 0}%` }]} />
  </View>
);

const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <View style={styles.stat}>
    <Text variant="caption">{label}</Text>
    <Text style={{ fontFamily: fonts.heading, fontSize: 20, marginTop: 2 }}>{value}</Text>
    {sub ? <Text variant="caption">{sub}</Text> : null}
  </View>
);

const Flashcard = ({ card, index, total, busy, onGrade }: { card: WordCard; index: number; total: number; busy: boolean; onGrade: (g: GradeKey) => void }) => {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  const when = (g: GradeKey) => (card.preview[g] === 0 ? t('m.german.inMinutes') : t('m.german.inDays', { count: card.preview[g] }));
  const tone: Record<GradeKey, { bg: string; fg: string }> = {
    again: { bg: colors.dangerSoft, fg: colors.danger },
    hard: { bg: colors.warningSoft, fg: colors.warning },
    good: { bg: colors.successSoft, fg: colors.success },
    easy: { bg: colors.blueSoft, fg: colors.blue },
  };
  return (
    <Card>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption">
          {t(card.state === 'new' ? 'm.german.new' : 'm.german.review')} · {card.level} · {t(`m.german.fields.${card.field}`)}
        </Text>
        <Text variant="caption">
          {index + 1} / {total}
        </Text>
      </View>
      <View style={{ marginTop: 8 }}>
        <Bar value={index} max={total} />
      </View>
      <View style={{ alignItems: 'center', marginVertical: space.xl }}>
        <Text variant="small">{t('m.german.question')}</Text>
        <Text style={{ fontFamily: fonts.headingBlack, fontSize: 30, lineHeight: 38, textAlign: 'center', marginTop: 6 }} selectable>
          {wordLabel(card)}
        </Text>
        {card.plural ? (
          <Text variant="small">
            {t('m.german.plural')}: die {card.plural}
          </Text>
        ) : null}
      </View>
      {!shown ? (
        <Button
          title={t('m.german.show')}
          size="lg"
          onPress={() => {
            haptic.tap();
            setShown(true);
          }}
        />
      ) : (
        <Animated.View entering={FadeIn.duration(200)} style={{ gap: space.md }}>
          <View style={styles.answer}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 18, textAlign: 'center' }}>{translationOf(card)}</Text>
            {card.example ? (
              <Text variant="small" style={{ textAlign: 'center', fontStyle: 'italic', marginTop: 6 }}>
                „{card.example}“
              </Text>
            ) : null}
          </View>
          <View style={styles.grades}>
            {(Object.keys(GRADES) as GradeKey[]).map((g) => (
              <Pressable
                key={g}
                disabled={busy}
                accessibilityRole="button"
                onPress={() => onGrade(g)}
                style={({ pressed }) => [styles.grade, { backgroundColor: tone[g].bg }, (pressed || busy) && { opacity: 0.7 }]}
              >
                <Text style={{ fontFamily: fonts.semibold, color: tone[g].fg }}>{t(`m.german.grades.${g}`)}</Text>
                <Text variant="caption" style={{ color: tone[g].fg }}>
                  {when(g)}
                </Text>
              </Pressable>
            ))}
          </View>
        </Animated.View>
      )}
    </Card>
  );
};

const ExamDates = () => {
  const { t } = useTranslation();
  const f = useFormat();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: OVERVIEW_QK, queryFn: async () => (await api.get<Overview>('/german/me')).data });
  const [saving, setSaving] = useState<string | null>(null);
  if (!data) return null;

  const markRegistered = async (d: ExamDate) => {
    setSaving(d.id);
    try {
      const planned = data.exams.find((e) => e.examDateId === d.id);
      const res = planned
        ? await api.patch<Overview>(`/german/me/exams/${planned.id}`, { status: 'REGISTERED' })
        : await api.post<Overview>('/german/me/exams', { examDateId: d.id, status: 'REGISTERED' });
      qc.setQueryData(OVERVIEW_QK, res.data);
      haptic.success();
      toast(t('m.german.saved'), 'success');
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Section title={t('m.german.exams')} icon={CalendarCheck}>
      <Text variant="small">{t('m.german.examsHint')}</Text>
      {data.examDates.length === 0 ? (
        <Text variant="small" style={{ marginTop: space.md }}>
          {t('m.german.noExams')}
        </Text>
      ) : (
        <View style={{ gap: space.md, marginTop: space.md }}>
          {data.examDates.map((d) => {
            const mine = data.exams.find((e) => e.examDateId === d.id);
            const registered = !!mine && mine.status !== 'PLANNED' && mine.status !== 'CANCELLED';
            return (
              <View key={d.id} style={styles.exam}>
                <Text variant="title">
                  {t(`m.german.providers.${d.provider}`)} {d.level ?? ''}
                </Text>
                <Text variant="small">
                  {f.dateTime(d.examDate)} · {[d.location, d.city].filter(Boolean).join(', ')}
                </Text>
                {d.registrationDeadline ? <Text variant="caption">{t('m.german.deadline', { date: f.date(d.registrationDeadline) })}</Text> : null}
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.sm }}>
                  {registered ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <CheckCircle2 size={16} color={colors.success} />
                      <Text style={{ color: colors.success, fontFamily: fonts.semibold }}>{t('m.german.registered')}</Text>
                    </View>
                  ) : (
                    <Button title={t('m.german.markRegistered')} size="sm" icon={CheckCircle2} loading={saving === d.id} onPress={() => void markRegistered(d)} />
                  )}
                  {d.link ? (
                    <Button
                      title={t('m.german.register')}
                      size="sm"
                      variant="secondary"
                      iconRight={ExternalLink}
                      onPress={() => void WebBrowser.openBrowserAsync(d.link!, { controlsColor: colors.blue, toolbarColor: colors.navy })}
                    />
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}
    </Section>
  );
};

export const GermanScreen = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();
  const { data: s, error, refetch } = useVocabSummary();
  const [field, setField] = useState<string>('all');
  const [level, setLevel] = useState<string>('auto');
  const [queue, setQueue] = useState<WordCard[] | null>(null);
  const [pos, setPos] = useState(0);
  const [stats, setStats] = useState({ correct: 0, total: 0 });
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const params = { limit: 20, ...(field !== 'all' ? { field } : {}), ...(level !== 'auto' ? { level } : {}) };
      const res = (await api.get<{ cards: WordCard[] }>('/german/vocab/session', { params })).data;
      setQueue(res.cards);
      setPos(0);
      setStats({ correct: 0, total: 0 });
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setLoading(false);
    }
  };

  const grade = async (g: GradeKey) => {
    if (!queue || busy) return;
    const card = queue[pos];
    setBusy(true);
    try {
      const res = (await api.post<{ correct: boolean; summary: Summary }>('/german/vocab/review', { wordId: card.id, grade: GRADES[g] })).data;
      qc.setQueryData(VOCAB_QK, res.summary);
      if (res.correct) haptic.success();
      else haptic.tap();
      // A forgotten word comes back once more at the end of the session.
      if (!res.correct && queue.slice(pos + 1).every((c) => c.id !== card.id)) setQueue([...queue, { ...card, state: 'review', preview: { again: 0, hard: 1, good: 1, easy: 1 } }]);
      setStats((x) => ({ correct: x.correct + (res.correct ? 1 : 0), total: x.total + 1 }));
      setPos((p) => p + 1);
    } catch (err) {
      toast(errorMessage(err), 'error');
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const fieldItems = [{ key: 'all', label: t('m.german.all') }, ...FIELDS.filter((x) => (s?.fields.find((g) => g.key === x)?.total ?? 0) > 0).map((x) => ({ key: x, label: t(`m.german.fields.${x}`) }))];
  const levelItems = [
    { key: 'auto', label: t('m.german.auto', { level: s?.recommendedLevel ?? 'A1' }) },
    ...LEVELS.filter((x) => (s?.levels.find((g) => g.key === x)?.total ?? 0) > 0).map((x) => ({ key: x, label: x })),
  ];

  return (
    <ScrollScreen onRefresh={() => Promise.all([refetch(), qc.invalidateQueries({ queryKey: OVERVIEW_QK })])}>
      {!s ? (
        <SkeletonCard lines={3} />
      ) : (
        <Animated.View entering={FadeInDown.duration(250)} style={{ gap: space.lg }}>
          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Layers size={18} color={colors.blue} />
              <Text variant="h3" style={{ flex: 1 }}>
                {t('m.german.homeTitle')}
              </Text>
              <Text variant="caption">{t('m.german.level', { level: s.profileLevel === 'none' ? 'A0' : s.profileLevel })}</Text>
            </View>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text variant="caption">{t('m.german.streak')}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Flame size={18} color={s.streak.practisedToday ? colors.warning : colors.muted} />
                  <Text style={{ fontFamily: fonts.heading, fontSize: 20 }}>{s.streak.current}</Text>
                </View>
                <Text variant="caption">{t('m.german.best', { count: s.streak.best })}</Text>
              </View>
              <View style={styles.stat}>
                <Text variant="caption">{t('m.german.today')}</Text>
                <Text style={{ fontFamily: fonts.heading, fontSize: 20, marginTop: 2 }}>{t('m.german.goal', { done: s.today.reviews, goal: s.today.goal })}</Text>
                <View style={{ marginTop: 6 }}>
                  <Bar value={s.today.reviews} max={s.today.goal} color={colors.success} />
                </View>
              </View>
            </View>
            <View style={styles.stats}>
              <Stat label={t('m.german.due')} value={String(s.due)} sub={t('m.german.newLeft', { count: Math.max(0, s.today.newLimit - s.today.newWords) })} />
              <Stat label={t('m.german.learned')} value={String(s.learned)} sub={t('m.german.of', { total: s.total })} />
            </View>
            <Text variant="small" color={s.streak.practisedToday ? colors.success : colors.warning} style={{ fontFamily: fonts.semibold, marginTop: space.md }}>
              {s.streak.practisedToday ? t('m.german.practisedToday') : t('m.german.notToday')}
            </Text>
          </Card>

          {queue === null ? (
            <View style={{ gap: space.md }}>
              <Chips value={level} onChange={setLevel} items={levelItems} />
              <Chips value={field} onChange={setField} items={fieldItems} />
              <Button title={t('m.german.start')} icon={Play} size="lg" loading={loading} onPress={() => void load()} />
            </View>
          ) : queue.length === 0 ? (
            <Card>
              <Text style={{ textAlign: 'center' }}>{t('m.german.allDone')}</Text>
              <Button title={t('m.german.close')} variant="secondary" onPress={() => setQueue(null)} style={{ marginTop: space.md }} />
            </Card>
          ) : pos >= queue.length ? (
            <Card>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <CheckCircle2 size={36} color={colors.success} />
                <Text variant="h3">{t('m.german.finished')}</Text>
                <Text variant="small">{t('m.german.finishedBody', { correct: stats.correct, total: stats.total })}</Text>
              </View>
              <View style={{ gap: space.sm, marginTop: space.lg }}>
                <Button title={t('m.german.more')} icon={RotateCcw} loading={loading} onPress={() => void load()} />
                <Button title={t('m.german.close')} variant="secondary" onPress={() => setQueue(null)} />
              </View>
            </Card>
          ) : (
            <View style={{ gap: space.sm }}>
              <Flashcard key={`${pos}-${queue[pos].id}`} card={queue[pos]} index={pos} total={queue.length} busy={busy} onGrade={(g) => void grade(g)} />
              <Button title={t('m.german.close')} variant="ghost" onPress={() => setQueue(null)} />
            </View>
          )}
        </Animated.View>
      )}
      <ExamDates />
    </ScrollScreen>
  );
};

const styles = StyleSheet.create({
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  stats: { flexDirection: 'row', gap: space.md, marginTop: space.md },
  stat: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: space.md },
  answer: { backgroundColor: colors.surface, borderRadius: radius.md, padding: space.lg },
  grades: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  grade: { flexBasis: '47%', flexGrow: 1, minHeight: 56, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: space.sm },
  exam: { borderWidth: StyleSheet.hairlineWidth, borderColor: colors.line, borderRadius: radius.md, padding: space.md, gap: 2 },
});
