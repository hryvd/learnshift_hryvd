import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { pushTransition } from '@/design/navigation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useFonts } from 'expo-font';
import { Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';

import { ease, timing, useReducedMotion } from '@/design/motion';
import { ThemeProvider, useTheme } from '@/design/theme';
import { FONT_MAIN, FONT_SECONDARY } from '@/design/typography';
import { Paty } from '@/components/mascot/Paty';
import { SplashTransition } from '@/components/mascot/SplashTransition';
import { PhoneFrame, SHOW_FRAME } from '@/components/web/PhoneFrame';
import * as api from '@/services/backend/api';
import { SessionEffects } from '@/services/backend/session';
import { clearTeacherCache } from '@/services/backend/teacher';
import { useAppStore } from '@/store/useAppStore';
import { useAuth } from '@/store/useAuth';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  // Desktop web: show the app inside a phone (it runs in an embedded page).
  if (SHOW_FRAME) {
    SplashScreen.hideAsync().catch(() => {});
    return <PhoneFrame />;
  }
  return <App />;
}

function App() {
  const [loaded, error] = useFonts({
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
    [FONT_MAIN]: require('../../assets/fonts/Bungee-Regular.ttf'),
  });
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());
  const authReady = useAuth((s) => s.status !== 'loading');

  useEffect(() => {
    if (hydrated) return;
    return useAppStore.persist.onFinishHydration(() => setHydrated(true));
  }, [hydrated]);

  if ((!loaded && !error) || !hydrated) return null;

  return (
    <GestureHandlerRootView style={styles.root}>
      <SessionEffects />
      <ThemeProvider>
        <ErrorBoundary>{authReady ? <Shell /> : null}</ErrorBoundary>
        <SplashTransition ready={authReady} />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.errRoot}>
        <Paty expression="concerned" size={110} alive={false} interactive={false} />
        <RNText style={styles.errTitle}>Something went wrong</RNText>
        <RNText style={styles.errSub}>LearnShift hit an unexpected screen error. Reload or sign out to continue.</RNText>
        <Pressable
          onPress={() => {
            this.setState({ error: null });
            router.replace('/');
          }}
          style={styles.errBtn}
        >
          <RNText style={styles.errBtnText}>Reload app</RNText>
        </Pressable>
        <Pressable
          onPress={async () => {
            clearTeacherCache();
            await api.signOut().catch(() => {});
            this.setState({ error: null });
            router.replace('/onboarding');
          }}
          style={[styles.errBtn, styles.errSecondary]}
        >
          <RNText style={styles.errSecondaryText}>Sign out</RNText>
        </Pressable>
      </View>
    );
  }
}

function Shell() {
  const { c, isNight } = useTheme();
  // Web: browser chrome (focus rings, scrollbars, address bar) follows the in-app theme.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.documentElement;
    root.dataset.theme = isNight ? 'night' : 'day';
    root.style.colorScheme = isNight ? 'dark' : 'light';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.bg);
  }, [isNight, c.bg]);
  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar style={isNight ? 'light' : 'dark'} />
      <LangFade>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, ...pushTransition }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="onboarding" options={{ animation: 'fade' }} />
          <Stack.Screen name="reset-password" options={{ animation: 'fade' }} />
          <Stack.Screen name="teachers-only" options={{ animation: 'fade' }} />
          <Stack.Screen name="join/[code]" options={{ animation: 'fade' }} />
          <Stack.Screen name="privacy-policy" options={{ animation: 'fade' }} />
          <Stack.Screen name="account" options={{ presentation: 'modal', contentStyle: { backgroundColor: c.bg } }} />
          <Stack.Screen name="(student)" />
          <Stack.Screen name="guardian" options={{ animation: 'fade' }} />
          <Stack.Screen name="teacher" options={{ animation: 'fade' }} />
          <Stack.Screen name="demo" options={{ presentation: 'modal', contentStyle: { backgroundColor: c.bg } }} />
          <Stack.Screen name="dev/gallery" />
        </Stack>
      </LangFade>
      <ThemeCrossfade />
    </View>
  );
}

/** Language switch: a quick dip so the swap reads as a crossfade, not a jump. */
function LangFade({ children }: { children: React.ReactNode }) {
  const lang = useAppStore((s) => s.lang);
  const reduced = useReducedMotion();
  const o = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    o.set(
      withSequence(
        withTiming(0.35, { duration: 1 }),
        withTiming(1, { duration: reduced ? 120 : 320, easing: ease.out }),
      ),
    );
  }, [lang, reduced, o]);
  const s = useAnimatedStyle(() => ({ opacity: o.get() }));
  return <Animated.View style={[styles.root, s]}>{children}</Animated.View>;
}

/**
 * Day ↔ Night: the old canvas color sits on top and fades out over ~1.2 s,
 * so the whole app appears to melt into the new theme.
 */
function ThemeCrossfade() {
  const { c, mode } = useTheme();
  const [from, setFrom] = useState<string | null>(null);
  const prev = useRef({ mode, bg: c.bg });
  const o = useSharedValue(0);

  useEffect(() => {
    if (prev.current.mode === mode) return;
    setFrom(prev.current.bg);
    prev.current = { mode, bg: c.bg };
    o.set(
      withSequence(
        withTiming(1, { duration: 1 }),
        withTiming(0, { duration: timing.themeCrossfade, easing: ease.inOut }),
      ),
    );
  }, [mode, c.bg, o]);

  const s = useAnimatedStyle(() => ({ opacity: o.get() }));
  if (!from) return null;
  // pointerEvents as a style: on web the prop form is ignored by Animated views,
  // which left this (invisible) layer swallowing clicks after a theme switch.
  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: from, pointerEvents: 'none' }, s]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  errRoot: {
    flex: 1,
    backgroundColor: '#F6F5F1',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 14,
  },
  errTitle: { fontSize: 22, fontFamily: FONT_MAIN, fontWeight: 'normal', color: '#2B2D31', textAlign: 'center' },
  errSub: { fontSize: 15, fontFamily: 'Inter_500Medium', color: '#575C63', textAlign: 'center', lineHeight: 22 },
  errBtn: {
    minWidth: 220,
    minHeight: 48,
    borderRadius: 999,
    backgroundColor: '#C2410C',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  errBtnText: { color: '#FFFFFF', fontSize: 16, fontFamily: FONT_SECONDARY, fontWeight: 'normal' },
  errSecondary: { backgroundColor: '#EAE8E2' },
  errSecondaryText: { color: '#2B2D31', fontSize: 15, fontFamily: FONT_SECONDARY, fontWeight: 'normal' },
});
