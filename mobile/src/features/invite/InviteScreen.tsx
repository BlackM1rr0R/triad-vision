import '@/i18n/invite';
import { useState } from 'react';
import { Linking, Platform, Pressable, Share, View } from 'react-native';
import { router } from 'expo-router';
import * as Contacts from 'expo-contacts/legacy';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Gift, MessageCircle, Phone, Share2, Trash2, UserPlus } from '@/components/icons';
import { Button, Card, Chips, ErrorState, ScrollScreen, Section, SkeletonCard, Text, useToast } from '@/components/ui';
import { currentLanguage } from '@/i18n';
import { api } from '@/lib/api';
import { smsUrl, waPhone, whatsappUrl } from '@/lib/invite';
import { colors, space } from '@/theme';

/**
 * Client app "Invite friends": pick a profession message (same templates as the web portal,
 * GET /api/growth/referral/share), pick contacts on the phone and open WhatsApp / SMS with the message.
 * Picked contacts live only in this screen's memory — nothing about them is uploaded or stored.
 */

type L10n = Record<'az' | 'de' | 'en' | 'ru', string>;
interface ShareData {
  link: string | null;
  templates: { key: string; label: L10n; text: L10n }[];
}
interface Picked {
  id: string;
  name: string;
  phone: string;
}

const useShare = () => useQuery({ queryKey: ['growth', 'referral', 'share'], queryFn: async () => (await api.get<ShareData>('/growth/referral/share')).data });

export const InviteScreen = () => {
  const { t } = useTranslation();
  const toast = useToast();
  const lang = currentLanguage();
  const { data, error, refetch, isLoading } = useShare();
  const [key, setKey] = useState<string | null>(null);
  const [picked, setPicked] = useState<Picked[]>([]);

  if (isLoading) {
    return (
      <ScrollScreen>
        <SkeletonCard lines={4} />
      </ScrollScreen>
    );
  }
  if (error || !data) {
    return (
      <ScrollScreen>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </ScrollScreen>
    );
  }
  const tpl = data.templates.find((x) => x.key === key) ?? data.templates[0];
  const message = tpl ? tpl.text[lang] || tpl.text.en : (data.link ?? '');

  const open = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      toast(t('m.invite.noApp'), 'error');
    }
  };
  const pick = async () => {
    const perm = await Contacts.requestPermissionsAsync();
    if (perm.status !== 'granted') {
      toast(t('m.invite.denied'), 'error');
      return;
    }
    const c = await Contacts.presentContactPickerAsync();
    if (!c) return;
    const phone = c.phoneNumbers?.find((p) => p.number)?.number;
    if (!phone) {
      toast(t('m.invite.noPhone'), 'error');
      return;
    }
    setPicked((list) => (list.some((x) => x.id === c.id) ? list : [...list, { id: c.id, name: c.name || phone, phone }]));
  };

  if (!data.link) {
    return (
      <ScrollScreen>
        <Card>
          <Text>{t('m.invite.disabled')}</Text>
        </Card>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <View style={{ gap: space.lg }}>
        <Card>
          <Text variant="small">{t('m.invite.intro')}</Text>
        </Card>
        {data.templates.length > 0 && tpl && (
          <Section title={t('m.invite.profession')} icon={MessageCircle}>
            <Chips items={data.templates.map((x) => ({ key: x.key, label: x.label[lang] || x.label.en }))} value={tpl.key} onChange={setKey} />
            <Text variant="small" style={{ marginTop: space.md }}>
              {message}
            </Text>
          </Section>
        )}
        <Button title={t('m.invite.pick')} icon={UserPlus} onPress={() => void pick()} full />
        {picked.map((p) => (
          <Card key={p.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text variant="title">{p.name}</Text>
                <Text variant="caption">{p.phone}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel={t('m.invite.remove')} hitSlop={10} onPress={() => setPicked((l) => l.filter((x) => x.id !== p.id))}>
                <Trash2 size={18} color={colors.muted} />
              </Pressable>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: space.md }}>
              <Button title={t('m.invite.whatsapp')} icon={MessageCircle} size="sm" variant="success" onPress={() => void open(whatsappUrl(waPhone(p.phone), message))} />
              <Button title={t('m.invite.sms')} icon={Phone} size="sm" variant="secondary" onPress={() => void open(smsUrl(p.phone, message, Platform.OS))} />
            </View>
          </Card>
        ))}
        <Button title={t('m.invite.shareAny')} icon={Share2} variant="secondary" onPress={() => void Share.share({ message })} full />
      </View>
    </ScrollScreen>
  );
};

/** Home card → invite screen (hidden while the programme is off). */
export const InviteHomeCard = ({ index }: { index?: number }) => {
  const { t } = useTranslation();
  const { data } = useShare();
  if (!data?.link) return null;
  return (
    <Card index={index} onPress={() => router.push('/invite')}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Gift size={20} color={colors.blue} />
        <View style={{ flex: 1 }}>
          <Text variant="title">{t('m.invite.homeTitle')}</Text>
          <Text variant="small">{t('m.invite.homeText')}</Text>
        </View>
        <ArrowRight size={18} color={colors.blue} />
      </View>
    </Card>
  );
};
