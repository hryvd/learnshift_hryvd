import { View } from 'react-native';
import { Stack } from 'expo-router';

import { TeacherUploadSheet } from '@/components/teacher/TeacherUploadSheet';
import { useTheme } from '@/design/theme';
import { useRoleGate } from '@/hooks/useRoleGate';
import { IS_PITCH } from '@/lib/config';
import { useTeacherLive } from '@/services/backend/teacher';

export default function TeacherLayout() {
  const gate = useRoleGate('teacher');
  if (gate) return gate;
  return <TeacherStack />;
}

function TeacherStack() {
  const { c } = useTheme();
  useTeacherLive(!IS_PITCH);
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" options={{ animation: 'none' }} />
        <Stack.Screen name="modules" options={{ animation: 'none' }} />
        <Stack.Screen name="review" options={{ animation: 'none' }} />
        <Stack.Screen name="settings" options={{ animation: 'none' }} />
        <Stack.Screen name="student/[id]" />
      </Stack>
      <TeacherUploadSheet />
    </View>
  );
}
