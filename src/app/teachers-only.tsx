import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Paty } from '@/components/mascot/Paty';
import { Card, PillButton, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { TEACHER_APP_NAME } from '@/lib/config';
import * as api from '@/services/backend/api';
import { clearTeacherCache } from '@/services/backend/teacher';

/** A student or guardian account opened the teacher desktop app. */
export default function TeachersOnly() {
  const { c } = useTheme();
  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Card style={styles.card}>
        <Paty expression="curious" size={80} />
        <Text variant="title" align="center">
          {TEACHER_APP_NAME} is for teachers
        </Text>
        <Text variant="body" align="center" color="textSecondary">
          This account is a student or family account. Students and families use the LearnShift phone app. Sign out
          to use a teacher account.
        </Text>
        <PillButton
          label="Sign out"
          block
          onPress={async () => {
            clearTeacherCache();
            await api.signOut();
            router.replace('/onboarding');
          }}
        />
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 440, alignItems: 'center', gap: 14, padding: 32 },
});
