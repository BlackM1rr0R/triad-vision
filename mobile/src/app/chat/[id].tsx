import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { ClientChat } from '@/features/chat/ClientChat';
import { colors } from '@/theme';

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: colors.surface }}>
      <ClientChat caseId={id} />
    </View>
  );
}
