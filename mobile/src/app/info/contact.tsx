import { Linking, Platform, View } from 'react-native';
import { Clock, Mail, MapPin, MessageCircle, Phone } from '@/components/icons';
import { useTranslation } from 'react-i18next';
import { Button, Card, ErrorState, ListRow, ScrollScreen, Section, SkeletonList, Text } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useContent } from '@/lib/queries';
import { space } from '@/theme';
import type { Office } from '@/types';

const mapUrl = (o: Office) =>
  Platform.OS === 'ios'
    ? `https://maps.apple.com/?ll=${o.lat},${o.lng}&q=${encodeURIComponent(o.address)}`
    : `geo:${o.lat},${o.lng}?q=${encodeURIComponent(o.address)}`;

const SOCIAL_LABEL: Record<string, string> = { instagram: 'Instagram', facebook: 'Facebook', linkedin: 'LinkedIn', tiktok: 'TikTok', youtube: 'YouTube' };

export default function Contact() {
  const { t } = useTranslation();
  const f = useFormat();
  const { data, isLoading, error, refetch } = useContent();
  const c = data?.settings.contact;
  const social = data?.settings.social ?? {};
  // CMS fields can be missing/empty on a fresh install — hide what we cannot dial or mail.
  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const phone = text(c?.phone);
  const whatsapp = text(c?.whatsapp);
  const email = text(c?.email);

  return (
    <ScrollScreen onRefresh={refetch}>
      <View style={{ gap: 4 }}>
        <Text variant="h2">{t('contact.title')}</Text>
        <Text variant="small">{t('contact.subtitle')}</Text>
      </View>
      {isLoading ? (
        <SkeletonList count={3} lines={2} />
      ) : error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : c ? (
        <>
          {phone || whatsapp ? (
            <View style={{ flexDirection: 'row', gap: space.md }}>
              {phone ? <Button title={t('m.common.call')} icon={Phone} onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)} style={{ flex: 1 }} /> : null}
              {whatsapp ? (
                <Button
                  title={t('m.common.whatsapp')}
                  icon={MessageCircle}
                  variant="success"
                  onPress={() => void Linking.openURL(`https://wa.me/${whatsapp.replace(/\D/g, '')}`)}
                  style={{ flex: 1 }}
                />
              ) : null}
            </View>
          ) : null}
          <Card>
            {phone ? <ListRow icon={Phone} title={t('contact.phone')} subtitle={phone} onPress={() => void Linking.openURL(`tel:${phone.replace(/\s/g, '')}`)} /> : null}
            {email ? <ListRow icon={Mail} title={t('contact.email')} subtitle={email} onPress={() => void Linking.openURL(`mailto:${email}`)} /> : null}
            {c.hours ? <ListRow icon={Clock} title={t('contact.hours')} subtitle={f.tr(c.hours)} /> : null}
          </Card>
          {c.offices?.length ? (
            <Section title={t('contact.offices')} icon={MapPin}>
              {c.offices.map((o, i) => (
                <ListRow key={i} icon={MapPin} title={f.tr(o.city)} subtitle={o.address} onPress={() => void Linking.openURL(mapUrl(o)).catch(() => undefined)} />
              ))}
            </Section>
          ) : null}
          {Object.keys(social).length ? (
            <Section title={t('m.info.follow')}>
              {Object.entries(social).map(([k, url]) => (
                <ListRow key={k} title={SOCIAL_LABEL[k] ?? k} subtitle={url.replace(/^https?:\/\//, '')} onPress={() => void Linking.openURL(url)} />
              ))}
            </Section>
          ) : null}
        </>
      ) : null}
    </ScrollScreen>
  );
}
