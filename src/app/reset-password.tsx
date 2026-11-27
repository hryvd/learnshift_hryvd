import { useEffect, useState } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';

import { Paty } from '@/components/mascot/Paty';
import { Card, Notice, PillButton, Skeleton, Text, TextField } from '@/components/ui';
import { useTheme } from '@/design/theme';
import { space } from '@/design/tokens';
import { supabase } from '@/lib/supabase';
import * as api from '@/services/backend/api';

type Phase = 'checking' | 'ready' | 'invalid' | 'saving' | 'done';

/** Reads the recovery tokens from a password-reset email link (web). */
async function claimRecoverySession(): Promise<boolean> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  // Supabase reports expired/used links in the URL instead of tokens.
  if (hash.get('error') || query.get('error')) return false;
  try {
    const access = hash.get('access_token');
    const refresh = hash.get('refresh_token');
    if (access && refresh) {
      const { error } = await supabase.auth.setSession({ access_token: access, refresh_token: refresh });
      if (error) return false;
    } else if (query.get('code')) {
      const { error } = await supabase.auth.exchangeCodeForSession(query.get('code')!);
      if (error) return false;
    } else {
      // No recovery token: this page only works from a reset email link.
      return false;
    }
    // Drop the tokens from the address bar and history.
    window.history.replaceState(null, '', '/reset-password');
    return true;
  } catch {
    return false;
  }
}

export default function ResetPassword() {
  const { c } = useTheme();
  const [phase, setPhase] = useState<Phase>('checking');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    claimRecoverySession().then((ok) => {
      if (alive) setPhase(ok ? 'ready' : 'invalid');
    });
    return () => {
      alive = false;
    };
  }, []);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw2.length > 0 && pw !== pw2;
  const canSave = phase === 'ready' && pw.length >= 8 && pw === pw2;

  const save = async () => {
    if (!canSave) return;
    setPhase('saving');
    setError(null);
    try {
      await api.updatePassword(pw);
      setPhase('done');
    } catch (e) {
      setError((e as Error).message);
      setPhase('ready');
    }
  };

  return (
    <ScrollView style={{ backgroundColor: c.bg }} contentContainerStyle={styles.body}>
      <Card style={styles.card}>
        <View style={styles.head}>
          <Paty expression={phase === 'done' ? 'proud' : 'curious'} size={64} />
          <View style={styles.flex}>
            <Text variant="title">Set a new password</Text>
            <Text variant="subhead">LearnShift account</Text>
          </View>
        </View>

        {phase === 'checking' ? (
          <View style={styles.gap}>
            <Skeleton height={48} />
            <Skeleton height={48} />
          </View>
        ) : null}

        {phase === 'invalid' ? (
          <>
            <Notice text="This reset link has expired or was already used. Request a new one from the sign-in screen." />
            <PillButton label="Back to sign in" block onPress={() => router.replace('/onboarding')} />
          </>
        ) : null}

        {phase === 'ready' || phase === 'saving' ? (
          <View style={styles.gap}>
            {error ? <Notice text={error} /> : null}
            <TextField
              label="New password"
              secret
              value={pw}
              onChangeText={setPw}
              autoComplete="new-password"
              textContentType="newPassword"
              error={tooShort ? 'Use at least 8 characters.' : null}
            />
            <TextField
              label="Confirm new password"
              secret
              value={pw2}
              onChangeText={setPw2}
              autoComplete="new-password"
              textContentType="newPassword"
              onSubmitEditing={save}
              error={mismatch ? 'Passwords do not match.' : null}
            />
            <PillButton
              label={phase === 'saving' ? 'Saving…' : 'Save new password'}
              block
              disabled={!canSave}
              onPress={save}
            />
          </View>
        ) : null}

        {phase === 'done' ? (
          <>
            <Notice tone="success" text="Password updated. You are signed in." />
            <PillButton label="Continue" block onPress={() => router.replace('/')} />
          </>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: space.screen },
  card: { width: '100%', maxWidth: 460, gap: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  flex: { flex: 1 },
  gap: { gap: 12 },
});
