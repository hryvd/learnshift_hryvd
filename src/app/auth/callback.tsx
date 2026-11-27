import { useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Paty } from '@/components/mascot/Paty';
import { Card, Notice, PillButton, Skeleton, Text } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { IS_TEACHER_APP } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import * as api from '@/services/backend/api';
import { waitForProfile } from '@/store/useAuth';

/** Finishes a Google sign-in on the web: stores the session, then sets the role. */
async function finish(): Promise<string | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return 'Open this page in the browser.';
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const failed = hash.get('error_description') ?? query.get('error_description');
  if (failed) return failed.replace(/\+/g, ' ');
  const access = hash.get('access_token');
  const refresh = hash.get('refresh_token');
  const code = query.get('code');
  if (access && refresh) {
    const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
    if (error) return error.message;
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return error.message;
  } else {
    return 'This sign-in link is incomplete. Try Continue with Google again.';
  }
  window.history.replaceState(null, '', '/auth/callback');
  const profile = await waitForProfile();
  if (!profile) return 'We couldn’t reach LearnShift. Check your internet and try again.';
  if (IS_TEACHER_APP && profile.role !== 'teacher') {
    try {
      await api.claimTeacherRole();
    } catch (e) {
      return (e as Error).message;
    }
  }
  return null;
}

export default function AuthCallback() {
  const { c } = useTheme();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    finish().then((err) => {
      if (!alive) return;
      if (err) setError(err);
      else router.replace('/');
    });
    return () => {
      alive = false;
    };
  }, []);
  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <Card style={styles.card}>
        <Paty expression={error ? 'concerned' : 'happy'} size={72} />
        {error ? (
          <>
            <Text variant="title" align="center">
              Google sign-in didn’t finish
            </Text>
            <Notice text={error} />
            <PillButton
              label="Back to sign in"
              block
              onPress={async () => {
                await api.signOut();
                router.replace('/onboarding');
              }}
            />
          </>
        ) : (
          <>
            <Text variant="title" align="center">
              Signing you in…
            </Text>
            <Skeleton height={12} width="70%" />
          </>
        )}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 420, alignItems: 'center', gap: 16, padding: 32 },
});
