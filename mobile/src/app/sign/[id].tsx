import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Check, Eraser, FileText, PenLine } from '@/components/icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorState, Field, SkeletonList, StaleHint, Text, useToast } from '@/components/ui';
import { useOpenDocument } from '@/features/case/useDocuments';
import { SignaturePad, type SignaturePadHandle } from '@/features/sign/SignaturePad';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useFormat } from '@/lib/format';
import { haptic } from '@/lib/haptics';
import { useCase, useErrorMessage } from '@/lib/queries';
import { qk } from '@/lib/queryClient';
import { colors, fonts, radius, space } from '@/theme';

export default function SignContract() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const f = useFormat();
  const qc = useQueryClient();
  const toast = useToast();
  const message = useErrorMessage();
  const { data: c, isLoading, error, refetch } = useCase(id);
  const { open, openingId } = useOpenDocument();
  const pad = useRef<SignaturePadHandle>(null);

  const [name, setName] = useState(user ? `${user.firstName} ${user.lastName}` : '');
  const [agree, setAgree] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (isLoading) {
    return (
      <View style={{ padding: space.lg }}>
        <SkeletonList count={2} lines={3} />
      </View>
    );
  }
  // A failed background refetch must not hide a contract that is already on screen.
  if (!c) return <ErrorState error={error} onRetry={() => void refetch()} />;

  const file = c.contract?.file;

  const submit = async () => {
    setProblem(null);
    if (name.trim().length < 3) return setProblem(t('m.sign.nameRequired'));
    if (!pad.current || pad.current.isEmpty()) return setProblem(t('m.sign.empty'));
    if (!agree) return setProblem(t('m.sign.agreeRequired'));
    setBusy(true);
    try {
      const signature = await pad.current.toDataUrl();
      await api.post(`/cases/${c.id}/contract/sign`, { signerName: name.trim(), signature, agree: true }, { timeout: 60_000 });
      await Promise.all([qc.invalidateQueries({ queryKey: qk.case(c.id) }), qc.invalidateQueries({ queryKey: qk.myCases })]);
      toast(t('m.sign.success'));
      router.back();
    } catch (err) {
      haptic.error();
      setProblem(message(err));
    } finally {
      setBusy(false);
    }
  };

  const signable = c.status === 'CONTRACT_SENT' && !!file;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        scrollEnabled={!drawing}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: insets.bottom + space.xxxl }}
      >
        <Card>
          <Text variant="caption">
            {c.number} · {t('portal.contract.version')} {c.contract?.version ?? 1}
            {c.contract ? ` · ${f.date(c.contract.sentAt)}` : ''}
          </Text>
          <Text variant="h3" style={{ marginTop: 6 }}>
            {t('m.sign.intro')}
          </Text>
          {file ? (
            <Button
              title={t('m.case.openContract')}
              icon={FileText}
              variant="secondary"
              loading={openingId === file.id}
              onPress={() => void open(file)}
              style={{ marginTop: space.md }}
            />
          ) : null}
        </Card>

        {signable ? (
          <>
            <Field label={t('m.sign.nameLabel')} value={name} onChangeText={setName} autoCapitalize="words" autoComplete="name" />

            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <PenLine size={16} color={colors.blue} />
                  <Text variant="label">{t('portal.contract.signTitle')}</Text>
                </View>
                <Pressable
                  onPress={() => {
                    haptic.tap();
                    pad.current?.clear();
                  }}
                  hitSlop={10}
                  accessibilityRole="button"
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Eraser size={15} color={colors.muted} />
                  <Text variant="small">{t('m.sign.clear')}</Text>
                </Pressable>
              </View>
              <SignaturePad ref={pad} placeholder={t('m.sign.drawHere')} onDrawingChange={setDrawing} onChange={setEmpty} />
            </View>

            <Pressable
              onPress={() => {
                haptic.select();
                setAgree((a) => !a);
              }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: agree }}
              style={styles.agree}
            >
              <View style={[styles.box, agree && styles.boxOn]}>{agree ? <Check size={15} color={colors.white} strokeWidth={3} /> : null}</View>
              <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20 }}>{t('m.sign.agree')}</Text>
            </Pressable>

            {problem ? (
              <Text variant="small" color={colors.danger} accessibilityRole="alert">
                {problem}
              </Text>
            ) : null}

            <Button title={t('m.sign.submit')} icon={PenLine} size="lg" loading={busy} disabled={empty || !agree} onPress={submit} />
          </>
        ) : (
          <Text variant="small" center>
            {t(`portal.statusHelp.${c.status}`)}
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  agree: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: space.md, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line },
  box: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: colors.blue, borderColor: colors.blue },
});
