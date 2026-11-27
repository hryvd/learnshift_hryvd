import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { Paty } from '@/components/mascot/Paty';
import { Card, Notice, PillButton, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { DISPLAY_FONT } from '@/design/typography';
import { normalizeFriendCode } from '@/lib/qr';
import * as api from '@/services/backend/api';
import { useAuth } from '@/store/useAuth';

/** Opened from a teacher's class QR or invite link. */
export default function JoinClass() {
  const { c } = useTheme();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = normalizeFriendCode(raw ?? '');
  const status = useAuth((s) => s.status);
  const role = useAuth((s) => s.profile?.role);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.joinClass(code);
      setJoined(res.name);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Card style={styles.card}>
        <Paty expression={joined ? 'cheering' : 'waving'} size={88} />
        <Text variant="overline">Class code</Text>
        <Text style={[styles.code, { color: c.accent }]} selectable accessibilityLabel={`Class code ${code.split('').join(' ')}`}>
          {code || '——'}
        </Text>
        {joined ? (
          <>
            <Text variant="title" align="center">
              You joined {joined}!
            </Text>
            <PillButton label="Go to LearnShift" block onPress={() => router.replace('/')} />
          </>
        ) : status !== 'signedIn' ? (
          <>
            <Text variant="body" align="center" color="textSecondary">
              Sign in or create your student account, then enter this code in Profile › Join a class.
            </Text>
            <PillButton label="Sign in or sign up" block onPress={() => router.push('/onboarding')} />
          </>
        ) : role !== 'student' ? (
          <Text variant="body" align="center" color="textSecondary">
            Only student accounts can join a class. Share this code with your students.
          </Text>
        ) : (
          <>
            <Text variant="body" align="center" color="textSecondary">
              Your teacher sees your learning progress in this class. Never your screen time.
            </Text>
            {error ? <Notice text={error} /> : null}
            <PillButton label={busy ? 'Joining…' : 'Join this class'} block disabled={busy || code.length !== 6} onPress={join} />
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 12, padding: 32 },
  code: { fontFamily: DISPLAY_FONT, fontSize: 44, lineHeight: 52, letterSpacing: 6 },
});
