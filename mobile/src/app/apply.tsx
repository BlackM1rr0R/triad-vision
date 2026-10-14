import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Send } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, CmsIcon, Field, ScrollScreen, Skeleton, Text, useToast } from '@/components/ui';
import { api } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useContent, useErrorMessage } from '@/lib/queries';
import { colors, fonts, radius, space } from '@/theme';
import type { CaseSummary } from '@/types';

const Option = ({ label, sub, icon, active, onPress }: { label: string; sub?: string; icon?: string; active: boolean; onPress: () => void }) => (
  <Pressable
    onPress={() => {
      haptic.select();
      onPress();
    }}
    accessibilityRole="radio"
    accessibilityState={{ selected: active }}
    style={[styles.option, active && styles.optionOn]}
  >
    {icon ? (
      <View style={[styles.optionIcon, active && { backgroundColor: colors.blue }]}>
        <CmsIcon name={icon} size={18} color={active ? colors.white : colors.blue} />
      </View>
    ) : null}
    <View style={{ flex: 1 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5 }}>{label}</Text>
      {sub ? <Text variant="caption">{sub}</Text> : null}
    </View>
    <View style={[styles.radio, active && styles.radioOn]}>{active ? <Check size={13} color={colors.white} strokeWidth={3} /> : null}</View>
  </Pressable>
);

export default function Apply() {
  const { t } = useTranslation();
  const f = useFormat();
  const qc = useQueryClient();
  const toast = useToast();
  const message = useErrorMessage();
  const params = useLocalSearchParams<{ visa?: string }>();
  const { data: content, isLoading } = useContent();
  const [profession, setProfession] = useState('');
  const [visaId, setVisaId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preselect the visa the user came from (info/visa/[slug] → Apply).
  const preselected = content?.visaCategories.find((v) => v.slug === params.visa)?.id ?? null;
  const selected = visaId ?? preselected;

  const submit = async () => {
    if (profession.trim().length < 2) {
      setError(t('m.apply.professionRequired'));
      haptic.warning();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post<{ case: CaseSummary }>('/cases', { profession: profession.trim(), visaCategoryId: selected === 'none' ? null : selected });
      await qc.invalidateQueries({ queryKey: ['cases'] });
      toast(t('m.apply.success'));
      router.dismissTo('/my-case');
      void data;
    } catch (err) {
      haptic.error();
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollScreen keyboard>
      <Text variant="h2">{t('portal.startTitle')}</Text>
      <Text variant="small">{t('m.apply.subtitle')}</Text>
      <Field label={t('m.apply.profession')} value={profession} onChangeText={setProfession} placeholder={t('m.apply.professionPh')} maxLength={120} />
      <Text variant="label">{t('m.apply.visaType')}</Text>
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {isLoading
          ? [0, 1, 2].map((i) => <Skeleton key={i} height={56} rounded={12} />)
          : content?.visaCategories.map((v) => (
              <Option key={v.id} label={f.tr(v.title)} sub={v.visaLabel} icon={v.icon} active={selected === v.id} onPress={() => setVisaId(v.id)} />
            ))}
        <Option label={t('m.apply.notSure')} active={!selected || selected === 'none'} onPress={() => setVisaId('none')} />
      </View>
      {error ? (
        <Text variant="small" color={colors.danger}>
          {error}
        </Text>
      ) : null}
      <Button title={t('m.apply.submit')} icon={Send} size="lg" loading={busy} onPress={submit} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  optionOn: { borderColor: colors.blue, backgroundColor: '#f6f9ff' },
  optionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.blueSoft, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.blue, borderColor: colors.blue },
});
