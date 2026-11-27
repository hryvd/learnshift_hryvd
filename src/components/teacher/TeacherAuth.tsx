import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { Paty } from '@/components/mascot/Paty';
import { masteryColor, masteryInk } from '@/components/teacher/ClassHeatmap';
import { Rise, Shake } from '@/components/teacher/Motion';
import { Notice, PillButton, Text, TextField } from '@/components/ui';
import { LockKey } from '@/components/ui/icons';
import { useReducedMotion } from '@/design/motion';
import { useTheme } from '@/design/theme';
import { TEACHER_APP_NAME } from '@/lib/config';
import * as api from '@/services/backend/api';
import { waitForProfile } from '@/store/useAuth';

type Mode = 'signin' | 'signup';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign in / create account for LearnShift for Teachers (desktop). Teachers only. */
export function TeacherAuth() {
  const { c } = useTheme();
  const { width } = useWindowDimensions();
  const split = width >= 900;
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window === 'undefined') return 'signin';
    return new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'signin';
  });

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      {split ? <BrandPanel /> : null}
      <ScrollView style={styles.flex} contentContainerStyle={styles.formWrap} keyboardShouldPersistTaps="handled">
        {!split ? (
          <Rise style={styles.compactBrand}>
            <Paty expression="waving" size={64} />
            <Text variant="headline">{TEACHER_APP_NAME}</Text>
          </Rise>
        ) : null}
        <AuthCard mode={mode} setMode={setMode} />
      </ScrollView>
    </View>
  );
}

// ── Left: what the teacher is about to get ───────────────────────────────

const PREVIEW = [
  ['Andrea Cruz', [0.86, 0.74, 0.62, 0.81, 0.7, 0.55, 0.9, 0.66]],
  ['Bea Ramos', [0.58, 0.41, 0.29, 0.47, 0.38, 0.33, 0.6, 0.44]],
  ['Carlo Diaz', [0.92, 0.88, 0.71, 0.84, 0.79, 0.68, 0.95, 0.73]],
  ['Dana Lim', [0.66, 0.52, 0.31, 0.56, 0.49, 0.4, 0.7, 0.51]],
  ['Eli Santos', [0.77, 0.69, 0.58, 0.72, 0.64, 0.52, 0.81, 0.6]],
] as const;
const SKILLS = ['INT', 'FRA', 'DEC', 'RAT', 'ALG', 'GEO', 'MEA', 'STA'];

function BrandPanel() {
  const { c, isNight } = useTheme();
  const colors = isNight ? (['#1A1530', '#26192A', '#3A2418'] as const) : (['#FFF6EA', '#FBE3C6', '#F6CFA3'] as const);
  return (
    <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.brand}>
      <Rise style={styles.brandTop}>
        <View style={styles.brandRow}>
          <Paty expression="waving" size={44} />
          <Text variant="headline" style={styles.brandName}>
            {TEACHER_APP_NAME}
          </Text>
        </View>
      </Rise>

      <View style={styles.brandMid}>
        <Rise delay={80}>
          <Text variant="overline" color="accent">
            For classroom teachers · Grades 1–10
          </Text>
        </Rise>
        <Rise delay={140}>
          <Text style={[styles.hero, { color: c.text }]}>Your whole class, in one view.</Text>
        </Rise>
        <Rise delay={220}>
          <Text variant="body" color="textSecondary" style={styles.heroSub}>
            See each student’s skill gaps, turn any lesson file into flashcards and quizzes, and check the tutor’s
            answers before students rely on them.
          </Text>
        </Rise>
        <Rise delay={320}>
          <PreviewCard />
        </Rise>
      </View>

      <Rise delay={420} style={[styles.privacy, { backgroundColor: c.card + 'B3' }]}>
        <LockKey size={14} weight="fill" color={c.textSecondary} />
        <Text variant="caption" color="text">
          Learning data only. Teachers never see screen time.
        </Text>
      </Rise>
    </LinearGradient>
  );
}

/** A small class heatmap that fills cell by cell: the dashboard, before signing in. */
function PreviewCard() {
  const { c, isNight } = useTheme();
  return (
    <View
      style={[styles.preview, { backgroundColor: c.card, borderColor: c.hairline }]}
      accessible
      accessibilityLabel="Preview of the class mastery heatmap"
    >
      <View style={styles.previewHead}>
        <View style={styles.flex}>
          <Text variant="caption">Grade 6 · Sampaguita</Text>
          <Text variant="headline">Class mastery</Text>
        </View>
        <View style={[styles.gapPill, { backgroundColor: c.accentTint }]}>
          <Text variant="caption" color="accent">
            Fractions: root gap for 3
          </Text>
        </View>
      </View>
      <View style={styles.gridHead}>
        <View style={styles.nameCol} />
        {SKILLS.map((s) => (
          <Text key={s} variant="caption" style={styles.headCell}>
            {s}
          </Text>
        ))}
      </View>
      {PREVIEW.map(([name, row], r) => (
        <View key={name} style={styles.gridRow}>
          <Text variant="caption" color="text" numberOfLines={1} style={styles.nameCol}>
            {name}
          </Text>
          {row.map((m, i) => (
            <Cell key={i} m={m} delay={480 + (r * SKILLS.length + i) * 22} night={isNight} c={c} />
          ))}
        </View>
      ))}
    </View>
  );
}

function Cell({ m, delay, night, c }: { m: number; delay: number; night: boolean; c: ReturnType<typeof useTheme>['c'] }) {
  const reduced = useReducedMotion();
  const p = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!reduced) p.set(withDelay(delay, withTiming(1, { duration: 360 })));
  }, [delay, reduced, p]);
  const s = useAnimatedStyle(() => ({ opacity: 0.15 + 0.85 * p.get(), transform: [{ scale: 0.7 + 0.3 * p.get() }] }));
  return (
    <Animated.View style={[styles.cell, { backgroundColor: masteryColor(m, c, night) }, s]}>
      <Text style={[styles.cellText, { color: masteryInk(m, c, night) }]}>{Math.round(m * 100)}</Text>
    </Animated.View>
  );
}

// ── Right: the form ──────────────────────────────────────────────────────

function AuthCard({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  const { c } = useTheme();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState<null | 'email'>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [touched, setTouched] = useState(false);

  const cleanEmail = email.trim().toLowerCase();
  const emailBad = touched && !EMAIL.test(cleanEmail);
  const pwBad = touched && mode === 'signup' && password.length > 0 && password.length < 8;
  const nameBad = touched && mode === 'signup' && !name.trim();

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
    setInfo(null);
    setTouched(false);
  };

  const fail = (msg: string) => {
    setError(msg);
    setTries((n) => n + 1);
  };

  const submit = async () => {
    if (busy) return;
    setTouched(true);
    setError(null);
    setInfo(null);
    if (!EMAIL.test(cleanEmail)) return fail('Enter your school or personal email address.');
    if (mode === 'signup' && !name.trim()) return fail('Enter your name as students will see it.');
    if (mode === 'signup' ? password.length < 8 : !password) {
      return fail(mode === 'signup' ? 'Use a password with at least 8 characters.' : 'Enter your password.');
    }
    setBusy('email');
    try {
      if (mode === 'signup') {
        await api.signUp({ email: cleanEmail, password, name: name.trim(), role: 'teacher', lang: 'en' });
      } else {
        await api.signIn(cleanEmail, password);
      }
      const p = await waitForProfile();
      if (!p) throw new Error('We couldn’t reach LearnShift. Check your internet and try again.');
      router.replace('/');
    } catch (e) {
      const msg = (e as Error).message;
      if (/check your email/i.test(msg)) setInfo(msg);
      else fail(/invalid login/i.test(msg) ? 'That email and password don’t match an account.' : msg);
    } finally {
      setBusy(null);
    }
  };

  const forgot = async () => {
    setTouched(true);
    setError(null);
    if (!EMAIL.test(cleanEmail)) return fail('Type your email first, then choose Forgot password.');
    try {
      await api.resetPassword(cleanEmail);
      setInfo('If that email has an account, a reset link is on its way.');
    } catch (e) {
      fail((e as Error).message);
    }
  };

  const strength = password.length === 0 ? 0 : password.length < 8 ? 1 : /[^a-z]/i.test(password) && password.length >= 10 ? 3 : 2;

  return (
    <Shake trigger={tries} style={styles.cardOuter}>
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.hairline }]}>
        <Rise k={mode} delay={60}>
          <Text style={[styles.cardTitle, { color: c.text }]} role="heading" aria-level={1}>
            {mode === 'signin' ? 'Welcome back' : 'Create your teacher account'}
          </Text>
          <Text variant="subhead" style={styles.cardSub}>
            {mode === 'signin'
              ? 'Sign in to see your classes.'
              : 'Free for teachers. Set up a class in under a minute.'}
          </Text>
        </Rise>

        {error ? <Notice text={error} /> : null}
        {info ? <Notice tone="success" text={info} /> : null}

        <Rise k={mode} delay={220} style={styles.fields}>
          {mode === 'signup' ? (
            <TextField
              label="Your name"
              placeholder="e.g. Ms. Ana O’Brien Reyes"
              value={name}
              onChangeText={setName}
              autoComplete="name"
              textContentType="name"
              maxLength={60}
              error={nameBad ? 'Enter your name.' : null}
            />
          ) : null}
          <TextField
            label="Email"
            placeholder="you@school.edu.ph"
            value={email}
            onChangeText={setEmail}
            onBlur={() => setEmail((v) => v.trim().toLowerCase())}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            error={emailBad ? 'Check this email address.' : null}
          />
          <TextField
            label="Password"
            secret
            value={password}
            onChangeText={setPassword}
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            textContentType={mode === 'signup' ? 'newPassword' : 'password'}
            onSubmitEditing={submit}
            error={pwBad ? 'At least 8 characters.' : null}
          />
          {mode === 'signup' ? (
            <View style={styles.meterRow} accessibilityLabel={`Password strength: ${['none', 'too short', 'good', 'strong'][strength]}`}>
              {[1, 2, 3].map((n) => (
                <View
                  key={n}
                  style={[styles.meter, { backgroundColor: strength >= n ? (strength === 1 ? c.danger : strength === 2 ? c.accent : c.success) : c.inset }]}
                />
              ))}
              <Text variant="caption" style={styles.meterLabel}>
                {['8+ characters', 'Too short', 'Good', 'Strong'][strength]}
              </Text>
            </View>
          ) : (
            <Pressable onPress={forgot} accessibilityRole="button" style={styles.forgot}>
              <Text variant="subhead" color="accent">
                Forgot password?
              </Text>
            </Pressable>
          )}
        </Rise>

        <Rise delay={280}>
          <PillButton
            label={busy === 'email' ? (mode === 'signin' ? 'Signing in…' : 'Creating account…') : mode === 'signin' ? 'Sign in' : 'Create account'}
            size="lg"
            block
            disabled={!!busy}
            onPress={submit}
          />
        </Rise>

        <View style={styles.switchRow}>
          <Text variant="subhead">{mode === 'signin' ? 'New to LearnShift?' : 'Already have an account?'}</Text>
          <Pressable onPress={() => switchTo(mode === 'signin' ? 'signup' : 'signin')} accessibilityRole="button">
            <Text variant="subhead" color="accent" style={styles.bold}>
              {mode === 'signin' ? 'Create a teacher account' : 'Sign in'}
            </Text>
          </Pressable>
        </View>
      </View>
      <Text variant="caption" align="center" style={styles.note}>
        Students and families use the LearnShift phone app.
      </Text>
    </Shake>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row' },
  flex: { flex: 1 },
  bold: { fontWeight: '700' },
  brand: { width: '46%', maxWidth: 760, paddingHorizontal: 56, paddingVertical: 40, justifyContent: 'space-between' },
  brandTop: { gap: 8 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandName: { fontSize: 17, letterSpacing: -0.2 },
  brandMid: { gap: 14, maxWidth: 560 },
  hero: { fontFamily: 'Inter_800ExtraBold', fontSize: 44, lineHeight: 50, letterSpacing: -1.4 },
  heroSub: { fontSize: 16, lineHeight: 25, maxWidth: 480 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  preview: { marginTop: 18, borderRadius: 18, borderWidth: 1, padding: 18, gap: 6, shadowColor: '#3A2A20', shadowOpacity: 0.12, shadowRadius: 30, shadowOffset: { width: 0, height: 18 } },
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  gapPill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  gridHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  headCell: { flex: 1, textAlign: 'center', fontSize: 10, fontWeight: '700' },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  nameCol: { width: 92 },
  cell: { flex: 1, height: 26, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  cellText: { fontSize: 10.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  formWrap: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  compactBrand: { alignItems: 'center', gap: 8, marginBottom: 20 },
  cardOuter: { width: '100%', maxWidth: 440 },
  card: { borderRadius: 24, borderWidth: 1, padding: 32, gap: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
  cardTitle: { fontFamily: 'Inter_800ExtraBold', fontSize: 26, lineHeight: 32, letterSpacing: -0.6 },
  cardSub: { marginTop: 4, fontSize: 14.5 },
  fields: { gap: 12 },
  forgot: { alignSelf: 'flex-end', paddingVertical: 2 },
  meterRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meter: { flex: 1, height: 4, borderRadius: 2 },
  meterLabel: { width: 96, textAlign: 'right' },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  note: { marginTop: 16 },
});
