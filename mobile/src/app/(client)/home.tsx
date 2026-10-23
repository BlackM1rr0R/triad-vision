import { useCallback } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Clock3, FileSignature, MessageCircle, Plus, Upload, Video } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Card, NavyHeader, ScrollScreen, SkeletonCard, StatusBadge, StepBar, Text, ErrorState } from '@/components/ui';
import { AppointmentCard } from '@/features/case/ClientCaseView';
import { ExploreGrid } from '@/features/common/Explore';
import { CheckInCard } from '@/features/checkin/CheckInCard'; // post-arrival check-in (one tap)
import { InterviewStatusPill, interviewTitle } from '@/features/interviews/InterviewCard';
import { useAuth } from '@/lib/auth';
import { CLIENT_UPLOAD_STAGE, STATUS_STEP, STEP_KEYS, hasActiveCase, missingRequirements, pickActiveCase } from '@/lib/caseStatus';
import { useFormat } from '@/lib/format';
import { nextInterview } from '@/lib/interviews';
import { useCase, useMyCases, useMyInterviews } from '@/lib/queries';
import { colors, fonts, space } from '@/theme';

/** The next proposed/confirmed interview, when there is one (nothing otherwise — most clients never have interviews). */
const UpcomingInterview = () => {
  const { t } = useTranslation();
  const f = useFormat();
  const { data } = useMyInterviews();
  const next = data ? nextInterview(data.upcoming) : undefined;
  if (!next) return null;
  return (
    <Card index={2} onPress={() => router.push(`/interviews/${next.id}`)}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <Video size={16} color={colors.violet} />
          <Text variant="caption">{t('m.home.nextInterview')}</Text>
        </View>
        <InterviewStatusPill status={next.status} />
      </View>
      <Text variant="h3" style={{ marginTop: 8 }} numberOfLines={2}>
        {interviewTitle(next, t)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 }}>
        <Clock3 size={15} color={colors.muted} />
        <Text variant="small" style={{ flex: 1 }}>
          {f.longDateTime(next.startsAt)}
        </Text>
        <ArrowRight size={18} color={colors.blue} />
      </View>
      {next.status === 'PROPOSED' ? (
        <Text variant="small" color={colors.warning} style={{ fontFamily: fonts.semibold, marginTop: 6 }}>
          {t('m.interviews.awaiting')}
        </Text>
      ) : null}
    </Card>
  );
};

const ActiveCase = ({ id }: { id: string }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const { data: c } = useCase(id);
  if (!c) return <SkeletonCard lines={4} />;
  const step = STATUS_STEP[c.status];
  const stage = CLIENT_UPLOAD_STAGE[c.status];
  const missing = stage ? missingRequirements(c.requirements, stage, 'uploaded').length : 0;

  return (
    <View style={{ gap: space.lg }}>
      <Card index={0} onPress={() => router.push('/my-case')}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text variant="caption">
            {t('m.home.activeCase')} · {c.number}
          </Text>
          <ArrowRight size={18} color={colors.blue} />
        </View>
        <Text variant="h2" style={{ marginTop: 6 }}>
          {c.profession}
        </Text>
        {c.visaCategory ? <Text variant="small">{f.tr(c.visaCategory.title)}</Text> : null}
        <View style={{ marginTop: 14, gap: 8 }}>
          <StepBar status={c.status} />
          {step >= 0 && step < 5 ? (
            <Text variant="caption">
              {t('m.home.stepOf', { current: step + 1, total: STEP_KEYS.length })} · {t(`portal.steps.${STEP_KEYS[step]}`)}
            </Text>
          ) : null}
        </View>
        <StatusBadge status={c.status} style={{ marginTop: 12 }} />
        <Text style={{ marginTop: 10 }}>{t(`portal.statusHelp.${c.status}`)}</Text>
        {stage && missing > 0 ? (
          <Text variant="small" color={colors.warning} style={{ marginTop: 6, fontFamily: fonts.semibold }}>
            {t('portal.docs.missingList')} {missing}
          </Text>
        ) : null}
      </Card>

      {stage ? <Button title={t('m.home.uploadDocs')} icon={Upload} size="lg" onPress={() => router.push('/my-case')} /> : null}
      {c.status === 'CONTRACT_SENT' ? (
        <Button title={t('m.home.signContract')} icon={FileSignature} size="lg" onPress={() => router.push(`/sign/${c.id}`)} />
      ) : null}
      {c.status === 'APPOINTMENT_SCHEDULED' ? <AppointmentCard c={c} index={1} /> : null}
      <Button title={t('m.home.chat')} icon={MessageCircle} variant="secondary" onPress={() => router.push('/messages')} />
    </View>
  );
};

export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: cases, isLoading, error, refetch } = useMyCases();
  const active = cases ? pickActiveCase(cases) : undefined;
  const canApply = cases ? !hasActiveCase(cases) : false;

  const refresh = useCallback(() => qc.invalidateQueries({ queryKey: ['cases'] }), [qc]);

  return (
    <ScrollScreen
      onRefresh={refresh}
      bottomInset={false}
      header={<NavyHeader eyebrow="Triad Vision" title={t('m.home.hello', { name: user?.firstName ?? '' })} subtitle={t('m.home.subtitle')} />}
    >
      {isLoading ? (
        <SkeletonCard lines={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : active ? (
        <ActiveCase id={active.id} />
      ) : null}

      <CheckInCard />
      <UpcomingInterview />

      {!isLoading && !error && canApply ? (
        <Card index={1} style={{ backgroundColor: colors.navy, borderColor: colors.navy }}>
          <Text variant="h3" color={colors.white}>
            {cases?.length ? t('m.home.newApplication') : t('m.home.noCaseTitle')}
          </Text>
          <Text style={{ color: 'rgba(255,255,255,0.75)', marginTop: 6 }}>{t('m.home.noCaseText')}</Text>
          <Button title={t('m.home.apply')} icon={Plus} onPress={() => router.push('/apply')} style={{ marginTop: 14 }} />
        </Card>
      ) : null}

      <Text variant="h3" style={{ marginTop: space.sm }}>
        {t('m.home.explore')}
      </Text>
      <ExploreGrid light />
    </ScrollScreen>
  );
}
