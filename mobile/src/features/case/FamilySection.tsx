import { View } from 'react-native';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChevronRight, UserRound, Users } from '@/components/icons';
import { Card, Pill, Section, StatusBadge, Text } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { colors, fonts } from '@/theme';
import type { CaseStatus, L10n } from '@/types';

/** GET /api/family/cases/:id (server lib/family/members.ts) — only the fields the app shows. */
interface FamilyMember {
  caseId: string;
  number: string;
  status: CaseStatus;
  relation: 'spouse' | 'child' | 'parent' | 'other';
  final: boolean;
  counts: { required: number; accepted: number; pending: number; rejected: number; missing: number };
  profile: { firstName: string; lastName: string; birthDate: string | null; joinsWhen: 'WITH_MAIN' | 'LATER' } | null;
  checklist: { id: string; title: L10n; required: boolean; state: 'accepted' | 'pending' | 'rejected' | 'missing' }[];
}
interface FamilyOverview {
  main: { id: string };
  members: FamilyMember[];
}

export const familyKey = (caseId: string) => ['family', caseId] as const;

const STATE_COLOR: Record<FamilyMember['checklist'][number]['state'], { fg: string; bg: string }> = {
  accepted: { fg: colors.success, bg: colors.successSoft },
  pending: { fg: colors.sky, bg: colors.skySoft },
  rejected: { fg: colors.danger, bg: colors.dangerSoft },
  missing: { fg: colors.warning, bg: colors.warningSoft },
};

/**
 * Main applicant's case: the family members (Familiennachzug) with their checklist state. Each member has
 * their own case — tapping opens it, where the normal upload / scan flow uploads to the member's checklist.
 * Adding members is done on the web portal or by the team.
 */
export const FamilySection = ({ caseId }: { caseId: string }) => {
  const { t } = useTranslation();
  const f = useFormat();
  const { data } = useQuery({
    queryKey: familyKey(caseId),
    queryFn: async () => (await api.get<FamilyOverview>(`/family/cases/${caseId}`)).data,
    staleTime: 30_000,
  });
  if (!data || data.main.id !== caseId || data.members.length === 0) return null;

  return (
    <Section title={t('m.family.title')} icon={Users}>
      <View style={{ gap: 10 }}>
        {data.members.map((m) => {
          const name = m.profile ? `${m.profile.firstName} ${m.profile.lastName}`.trim() : m.number;
          const pct = m.counts.required ? Math.round((m.counts.accepted / m.counts.required) * 100) : 100;
          return (
            <Card key={m.caseId} onPress={() => router.push(`/cases/${m.caseId}`)}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <UserRound size={20} color={colors.danger} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="title" numberOfLines={1}>
                    {name}
                  </Text>
                  <Text variant="small" numberOfLines={1}>
                    {t(`m.family.relation.${m.relation}`)} · {m.number}
                    {m.profile?.birthDate ? ` · ${f.date(m.profile.birthDate)}` : ''}
                  </Text>
                </View>
                <ChevronRight size={18} color={colors.muted} />
              </View>
              <View style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <StatusBadge status={m.status} />
                <Text variant="caption">{t('m.family.progress', { accepted: m.counts.accepted, required: m.counts.required })}</Text>
              </View>
              <View style={{ marginTop: 8, height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }} accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: pct }}>
                <View style={{ width: `${pct}%`, height: 6, backgroundColor: colors.blue }} />
              </View>
              <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {m.checklist.map((i) => (
                  <Pill key={i.id} label={`${f.tr(i.title)}${i.required ? '' : ` (${t('m.family.optional')})`}`} fg={STATE_COLOR[i.state].fg} bg={STATE_COLOR[i.state].bg} />
                ))}
              </View>
              {m.counts.missing + m.counts.rejected > 0 && !m.final ? (
                <Text style={{ marginTop: 10, fontFamily: fonts.semibold, color: colors.blue }}>{t('m.family.upload')}</Text>
              ) : null}
            </Card>
          );
        })}
        <Text variant="caption">{t('m.family.addOnWeb')}</Text>
      </View>
    </Section>
  );
};
